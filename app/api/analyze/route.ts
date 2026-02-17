import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '');
export const maxDuration = 300; 

export async function POST(req: Request) {
  try {
    const { url } = await req.json();
    const token = process.env.APIFY_TOKEN;
    const geminiKey = "AIzaSyB2Jc3tFV5cwYLjUBDqwAjgClGhwMv8cB8"; // ТВОЙ РАБОЧИЙ КЛЮЧ

    const idMatch = url.match(/\d{10,}/);
    const pageId = idMatch ? idMatch[0] : url;

    // 1. Apify
    const apifyUrl = `https://api.apify.com/v2/acts/curious_coder~facebook-ads-library-scraper/run-sync-get-dataset-items?token=${token}&timeout=60&maxChargedResults=10`;
    const res = await fetch(apifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        "urls": [{ "url": `https://www.facebook.com/ads/library/?view_all_page_id=${pageId}&active_status=active&ad_type=all&country=ALL&sort_data[direction]=desc&sort_data[mode]=total_impressions` }], 
        "count": 10, 
        "scrapeAdDetails": true 
      })
    });

    const data = await res.json();
    const processed = [];
    let googleFileResource: any = null;

    // 2. Обработка медиа (Уже работает!)
    for (let i = 0; i < data.slice(0, 10).length; i++) {
      const ad = data[i];
      const adId = ad.ad_archive_id;
      const videoSource = ad.snapshot?.videos?.[0] || ad.snapshot?.cards?.[0];
      const fbVideoUrl = videoSource?.video_hd_url || videoSource?.video_sd_url;
      
      let storageUrl = null;
      if (fbVideoUrl) {
        try {
          const vFetch = await fetch(fbVideoUrl);
          if (vFetch.ok) {
            const arrayBuffer = await vFetch.arrayBuffer();
            const uint8Array = new Uint8Array(arrayBuffer);

            if (i === 0 && !googleFileResource) {
              const startRes = await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${geminiKey}`, {
                method: 'POST',
                headers: {
                  'X-Goog-Upload-Protocol': 'resumable',
                  'X-Goog-Upload-Command': 'start',
                  'X-Goog-Upload-Header-Content-Type': 'video/mp4',
                  'X-Goog-Upload-Header-Content-Length': uint8Array.byteLength.toString(),
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({ file: { display_name: `creative_${adId}` } })
              });

              const uploadUrl = startRes.headers.get('x-goog-upload-url');
              if (uploadUrl) {
                const finalRes = await fetch(uploadUrl, {
                  method: 'POST',
                  headers: { 'X-Goog-Upload-Offset': '0', 'X-Goog-Upload-Command': 'upload, finalize' },
                  body: uint8Array
                });
                googleFileResource = await finalRes.json();
              }
            }

            const fileName = `vid_${adId}.mp4`;
            await supabase.storage.from('ads_videos').upload(fileName, uint8Array, { contentType: 'video/mp4', upsert: true });
            storageUrl = supabase.storage.from('ads_videos').getPublicUrl(fileName).data.publicUrl;
          }
        } catch (e: any) { console.error(`Media loop error: ${e.message}`); }
      }
      processed.push({ id: adId, thumbnail: videoSource?.video_preview_image_url || "", video: storageUrl, title: ad.snapshot?.title || "Ad", body: ad.snapshot?.body?.text || "" });
    }

    // 3. АНАЛИЗ (Gemini 1.5 Pro)
    let strategy = "Vision analysis failed - check logs.";
    if (googleFileResource?.file?.name) {
      const gFileName = googleFileResource.file.name;
      for (let attempt = 0; attempt < 12; attempt++) {
        await new Promise(r => setTimeout(r, 5000)); 
        const checkRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/${gFileName}?key=${geminiKey}`);
        const checkData = await checkRes.json();
        
        console.info(`[DEBUG] Polling: ${checkData.state}`);
        
        if (checkData.state === 'ACTIVE') {
          // Пауза 8 секунд для полной готовности кадров (Warm-up)
          await new Promise(r => setTimeout(r, 8000));
          console.info("[DEBUG] Requesting Analysis from 1.5 Pro...");

          const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${geminiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{
                parts: [
                  { text: "Detailed Marketing Analysis of this video. Identify: 1. CORE VALUE PROP, 2. VISUAL HOOK, 3. MECHANICS, 4. PSYCHOLOGY. Be thorough." },
                  { file_data: { mime_type: "video/mp4", file_uri: googleFileResource.file.uri } }
                ]
              }],
              // Принудительное отключение всех фильтров
              safetySettings: [
                { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
              ]
            })
          });

          const gData = await geminiRes.json();

          // ЛОГИРУЕМ ВЕСЬ ОТВЕТ, ЧТОБЫ УВИДЕТЬ ПРИЧИНУ ПУСТОТЫ
          if (gData.candidates?.[0]?.content?.parts?.[0]?.text) {
            strategy = gData.candidates[0].content.parts[0].text;
            console.info("[DEBUG] Analysis SUCCESS.");
            break;
          } else {
            console.error("[DEBUG] Analysis returned NO TEXT. Full Response:", JSON.stringify(gData));
            const reason = gData.candidates?.[0]?.finishReason || "UNKNOWN_REASON";
            strategy = `AI blocked or failed. Reason: ${reason}`;
            // Если заблочено, пробуем выйти из цикла
            break; 
          }
        }
      }
    }

    await supabase.from('ads_library').insert([{ page_id: pageId, brand_name: data[0]?.snapshot?.page_name || "Brand", strategy_analysis: strategy, creatives: processed }]);
    return NextResponse.json({ brand: data[0]?.snapshot?.page_name, strategy, creatives: processed });

  } catch (e: any) {
    console.error(`[DEBUG] CRITICAL: ${e.message}`);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
