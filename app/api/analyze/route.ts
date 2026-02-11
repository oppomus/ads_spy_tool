import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '');
export const maxDuration = 300; // Лимит Pro-плана

export async function POST(req: Request) {
  try {
    const { url } = await req.json();
    const token = process.env.APIFY_TOKEN;
    const geminiKey = process.env.GEMINI_API_KEY;

    const idMatch = url.match(/\d{10,}/);
    const pageId = idMatch ? idMatch[0] : url;

    // ФИКС 1: Увеличиваем таймаут до 60 секунд, чтобы Apify не падал
    const apifyUrl = `https://api.apify.com/v2/acts/curious_coder~facebook-ads-library-scraper/run-sync-get-dataset-items?token=${token}&timeout=60&maxChargedResults=10`;
    
    console.info(`[PRO] Starting Scraper for ID: ${pageId}...`);
    const res = await fetch(apifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        "urls": [{ "url": `https://www.facebook.com/ads/library/?view_all_page_id=${pageId}&active_status=active&ad_type=all&country=ALL` }], 
        "count": 10,
        "scrapeAdDetails": true 
      })
    });

    const data = await res.json();
    if (!Array.isArray(data)) throw new Error("Apify failed or timed out.");

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

            // ФИКС 2: Простейший способ загрузки в Google (без Multipart) для обхода ошибки 400
            if (i === 0 && !googleFileResource) {
              console.info(`[PRO] Uploading FULL video to Google (${(buffer.byteLength / 1024 / 1024).toFixed(2)}MB)...`);
              const uploadRes = await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${geminiKey}`, {
                method: 'POST',
                headers: {
                  'X-Goog-Upload-Protocol': 'media',
                  'Content-Type': 'video/mp4'
                },
                body: new Uint8Array(buffer)
              });

              if (uploadRes.ok) {
                googleFileResource = await uploadRes.json();
                console.info(`[PRO] Upload Success: ${googleFileResource.file?.name}`);
              } else {
                const errText = await uploadRes.text();
                console.error(`[PRO] Google Upload Fail: ${uploadRes.status} - ${errText}`);
              }
            }

            // Загрузка в Supabase
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

    // ШАГ 3: Ждем готовности и анализируем
    let strategy = "Vision analysis could not be started.";
    if (googleFileResource?.file?.name) {
      const gFileName = googleFileResource.file.name;
      
      for (let attempt = 0; attempt < 10; attempt++) {
        await new Promise(r => setTimeout(r, 5000)); 
        const checkRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/${gFileName}?key=${geminiKey}`);
        const checkData = await checkRes.json();
        
        if (checkData.state === 'ACTIVE') {
          console.info("[PRO] Video is ACTIVE. Starting Teardown...");
          
          const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{
                parts: [
                  { text: `You are a Senior UA Creative Lead. WATCH this video and provide a visual teardown. 
                           Identify: 1. CORE CONCEPT, 2. VISUAL HOOK (0-3s), 3. MECHANICS (detailed), 4. PSYCHOLOGY. 
                           Respond ONLY in English with detailed descriptions of what happens in the video.` },
                  { file_data: { mime_type: "video/mp4", file_uri: googleFileResource.file.uri } }
                ]
              }]
            })
          });

          const gData = await geminiRes.json();
          strategy = gData.candidates?.[0]?.content?.parts?.[0]?.text || "AI Error: Could not generate content.";
          break;
        }
        console.info(`[PRO] State: ${checkData.state}. Waiting...`);
      }
    }

    const brandName = data[0]?.snapshot?.page_name || "Brand";
    await supabase.from('ads_library').insert([{
      page_id: pageId, brand_name: brandName, 
      strategy_analysis: strategy, creatives: processed
    }]);

    return NextResponse.json({ brand: brandName, strategy, creatives: processed });

  } catch (e: any) {
    console.error(`[CRITICAL ERROR] ${e.message}`);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
