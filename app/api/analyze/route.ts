import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '');
export const maxDuration = 300; 

export async function POST(req: Request) {
  try {
    const { url } = await req.json();
    const token = process.env.APIFY_TOKEN;
    const geminiKey = process.env.GEMINI_API_KEY;

    const idMatch = url.match(/\d{10,}/);
    const pageId = idMatch ? idMatch[0] : url;

    // 1. Апифай (Таймаут 60 сек)
    const apifyUrl = `https://api.apify.com/v2/acts/curious_coder~facebook-ads-library-scraper/run-sync-get-dataset-items?token=${token}&timeout=60&maxChargedResults=10`;
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

            // --- ШАГ 1: ЖЕЛЕЗНАЯ ЗАГРУЗКА (Resumable Protocol) ---
            if (i === 0 && !googleFileResource) {
              console.info(`[IRON] Initializing Resumable Upload for ${(buffer.byteLength / 1024 / 1024).toFixed(2)}MB...`);
              
              // Этап A: Получаем URL для загрузки
              const startRes = await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${geminiKey}`, {
                method: 'POST',
                headers: {
                  'X-Goog-Upload-Protocol': 'resumable',
                  'X-Goog-Upload-Command': 'start',
                  'X-Goog-Upload-Header-Content-Type': 'video/mp4',
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({ file: { display_name: `creative_${adId}` } })
              });

              const uploadUrl = startRes.headers.get('x-goog-upload-url');
              if (!uploadUrl) throw new Error("Failed to get Google Upload URL");

              // Этап B: Загружаем бинарные данные
              console.info(`[IRON] Sending bytes to Google...`);
              const finalRes = await fetch(uploadUrl, {
                method: 'POST',
                headers: {
                  'X-Goog-Upload-Offset': '0',
                  'X-Goog-Upload-Command': 'upload, finalize'
                },
                body: Buffer.from(buffer)
              });

              if (finalRes.ok) {
                googleFileResource = await finalRes.json();
                console.info(`[IRON] SUCCESS: ${googleFileResource.file?.name}`);
              } else {
                console.error(`[IRON FAIL] ${finalRes.status}: ${await finalRes.text()}`);
              }
            }

            // SUPABASE
            const fileName = `vid_${adId}.mp4`;
            await supabase.storage.from('ads_videos').upload(fileName, buffer, { contentType: 'video/mp4', upsert: true });
            storageUrl = supabase.storage.from('ads_videos').getPublicUrl(fileName).data.publicUrl;
          }
        } catch (e: any) { console.error(`[MEDIA ERR] ${e.message}`); }
      }

      processed.push({
        id: adId,
        thumbnail: videoSource?.video_preview_image_url || "",
        video: storageUrl,
        title: ad.snapshot?.title || "Ad",
        body: ad.snapshot?.body?.text || ""
      });
    }

    // --- ШАГ 2: АНАЛИЗ ---
    let strategy = "Vision analysis failed.";
    if (googleFileResource?.file?.name) {
      const gFileName = googleFileResource.file.name;
      
      for (let attempt = 0; attempt < 15; attempt++) {
        await new Promise(r => setTimeout(r, 4000)); 
        const checkRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/${gFileName}?key=${geminiKey}`);
        const checkData = await checkRes.json();
        
        if (checkData.state === 'ACTIVE') {
          console.info("[IRON] Video is ACTIVE. Running Teardown...");
          const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{
                parts: [
                  { text: "You are a Senior UA Creative Strategist. WATCH this video and provide a visual teardown of: 1. CORE CONCEPT, 2. VISUAL HOOK, 3. MECHANICS, 4. PSYCHOLOGY. Respond in English only." },
                  { file_data: { mime_type: "video/mp4", file_uri: googleFileResource.file.uri } }
                ]
              }]
            })
          });

          const gData = await geminiRes.json();
          strategy = gData.candidates?.[0]?.content?.parts?.[0]?.text || "AI returned empty result.";
          break;
        }
        console.info(`[IRON] Polling ${gFileName}: ${checkData.state}`);
      }
    }

    const brandName = data[0]?.snapshot?.page_name || "Brand";
    await supabase.from('ads_library').insert([{
      page_id: pageId, brand_name: brandName, 
      strategy_analysis: strategy, creatives: processed
    }]);

    return NextResponse.json({ brand: brandName, strategy, creatives: processed });

  } catch (e: any) {
    console.error(`[CRITICAL] ${e.message}`);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
