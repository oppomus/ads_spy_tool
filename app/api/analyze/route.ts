import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '');
export const maxDuration = 60; 

export async function POST(req: Request) {
  try {
    const { url } = await req.json();
    const token = process.env.APIFY_TOKEN;
    const geminiKey = process.env.GEMINI_API_KEY;

    const idMatch = url.match(/\d{10,}/);
    const pageId = idMatch ? idMatch[0] : url;

    const apifyUrl = `https://api.apify.com/v2/acts/curious_coder~facebook-ads-library-scraper/run-sync-get-dataset-items?token=${token}&timeout=30&maxChargedResults=10`;
    const res = await fetch(apifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ "urls": [{ "url": `https://www.facebook.com/ads/library/?view_all_page_id=${pageId}&active_status=active&ad_type=all&country=ALL` }], "count": 10, "scrapeAdDetails": true })
    });

    const data = await res.json();
    if (!Array.isArray(data)) throw new Error("Apify failed");

    const processed = [];
    let googleFileResource: any = null;

    for (let i = 0; i < data.slice(0, 5).length; i++) {
      const ad = data[i];
      const adId = ad.ad_archive_id;
      const videoSource = ad.snapshot?.videos?.[0] || ad.snapshot?.cards?.[0];
      const fbVideoUrl = videoSource?.video_hd_url || videoSource?.video_sd_url;
      
      let storageUrl = null;
      if (fbVideoUrl) {
        try {
          const vFetch = await fetch(fbVideoUrl);
          if (vFetch.ok) {
            const buffer = await vFetch.arrayBuffer();

            // --- ШАГ 1: ЗАГРУЗКА В GOOGLE (Ультра-стабильный метод) ---
            if (i === 0) {
              console.info(`[DEBUG] Uploading FULL video (${(buffer.byteLength / 1024 / 1024).toFixed(2)}MB)...`);
              
              const uploadRes = await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${geminiKey}`, {
                method: 'POST',
                headers: {
                  'X-Goog-Upload-Protocol': 'media',
                  'X-Goog-Upload-Header-Content-Type': 'video/mp4',
                  'Content-Type': 'video/mp4',
                },
                // ПЕРЕДАЕМ КАК Uint8Array — это исключает ошибки 400 в Node.js
                body: new Uint8Array(buffer) 
              });

              if (!uploadRes.ok) {
                const errText = await uploadRes.text();
                console.error(`[GOOGLE UPLOAD ERROR] Status: ${uploadRes.status}, Body: ${errText}`);
              } else {
                googleFileResource = await uploadRes.json();
                console.info(`[DEBUG] File successfully uploaded to Google: ${googleFileResource.file?.name}`);
              }
            }

            // --- ШАГ 2: SUPABASE STORAGE ---
            const fileName = `vid_${adId}.mp4`;
            await supabase.storage.from('ads_videos').upload(fileName, buffer, { contentType: 'video/mp4', upsert: true });
            storageUrl = supabase.storage.from('ads_videos').getPublicUrl(fileName).data.publicUrl;
          }
        } catch (e: any) { console.error(`[MEDIA ERROR] ${adId}: ${e.message}`); }
      }

      processed.push({
        id: adId,
        thumbnail: videoSource?.video_preview_image_url || "",
        video: storageUrl,
        title: ad.snapshot?.title || "Ad",
        body: ad.snapshot?.body?.text || ""
      });
    }

    // --- ШАГ 3: ЖДЕМ И АНАЛИЗИРУЕМ (Только если файл загружен) ---
    let strategy = "Vision analysis failed (Upload Issue).";
    
    if (googleFileResource?.file?.name) {
      const gFileName = googleFileResource.file.name;
      console.info(`[DEBUG] Polling status for ${gFileName}...`);
      
      for (let attempt = 0; attempt < 6; attempt++) {
        await new Promise(r => setTimeout(r, 4000)); // Ждем 4 сек между проверками
        const checkRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/${gFileName}?key=${geminiKey}`);
        const checkData = await checkRes.json();
        
        if (checkData.state === 'ACTIVE') {
          console.info("[DEBUG] Video is ACTIVE. Sending to Gemini 1.5 Flash...");
          
          const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{
                parts: [
                  { text: "You are a Senior UA Lead. WATCH this video and provide a detailed teardown of: 1. CORE CONCEPT, 2. VISUAL HOOK (0-3s), 3. MECHANICS, 4. PSYCHOLOGY. Respond in English." },
                  { file_data: { mime_type: "video/mp4", file_uri: googleFileResource.file.uri } }
                ]
              }]
            })
          });

          const gData = await geminiRes.json();
          strategy = gData.candidates?.[0]?.content?.parts?.[0]?.text || "AI Error: Could not extract text.";
          break;
        }
        console.info(`[DEBUG] Attempt ${attempt + 1}: State is ${checkData.state}`);
      }
    }

    await supabase.from('ads_library').insert([{
      page_id: pageId, brand_name: data[0]?.snapshot?.page_name || "Brand", 
      strategy_analysis: strategy, creatives: processed
    }]);

    return NextResponse.json({ brand: data[0]?.snapshot?.page_name, strategy, creatives: processed });

  } catch (e: any) {
    console.error(`[CRITICAL ERROR] ${e.message}`);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
