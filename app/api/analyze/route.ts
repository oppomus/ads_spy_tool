import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || '', 
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

// Лимит времени для Vercel Pro (5 минут)
export const maxDuration = 300; 

export async function POST(req: Request) {
  try {
    const { url } = await req.json();
    const token = process.env.APIFY_TOKEN;
    
    // РАБОЧИЙ КЛЮЧ (Захардкожен по просьбе для теста)
    const geminiKey = "AIzaSyB2Jc3tFV5cwYLjUBDqwAjgClGhwMv8cB8"; 

    const idMatch = url.match(/\d{10,}/);
    const pageId = idMatch ? idMatch[0] : url;

    // 1. СКРЕПИНГ (Apify)
    console.info(`[1/4] Starting Scraper for Page ID: ${pageId}`);
    const apifyUrl = `https://api.apify.com/v2/acts/curious_coder~facebook-ads-library-scraper/run-sync-get-dataset-items?token=${token}&timeout=60&maxChargedResults=10`;
    
    const res = await fetch(apifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        "urls": [{ 
          "url": `https://www.facebook.com/ads/library/?view_all_page_id=${pageId}&active_status=active&ad_type=all&country=ALL&sort_data[direction]=desc&sort_data[mode]=total_impressions` 
        }], 
        "count": 10,
        "scrapeAdDetails": true 
      })
    });

    const data = await res.json();
    if (!Array.isArray(data)) throw new Error("Apify failed to return data array.");

    const processed = [];
    let googleFileResource: any = null;

    // 2. ОБРАБОТКА МЕДИА
    console.info(`[2/4] Processing ${data.length} creatives...`);
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

            // Загрузка ПЕРВОГО видео в Google Cloud для Gemini 3
            if (i === 0 && !googleFileResource) {
              console.info(`[GOOGLE] Uploading target video (${uint8Array.byteLength} bytes)`);
              const startRes = await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${geminiKey}`, {
                method: 'POST',
                headers: {
                  'X-Goog-Upload-Protocol': 'resumable',
                  'X-Goog-Upload-Command': 'start',
                  'X-Goog-Upload-Header-Content-Type': 'video/mp4',
                  'X-Goog-Upload-Header-Content-Length': uint8Array.byteLength.toString(),
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({ file: { display_name: `spy_target_${adId}` } })
              });

              const uploadUrl = startRes.headers.get('x-goog-upload-url');
              if (uploadUrl) {
                const finalRes = await fetch(uploadUrl, {
                  method: 'POST',
                  headers: { 'X-Goog-Upload-Offset': '0', 'X-Goog-Upload-Command': 'upload, finalize' },
                  body: uint8Array
                });
                googleFileResource = await finalRes.json();
                console.info(`[GOOGLE] Step 2 Success: ${googleFileResource.file.uri}`);
              }
            }

            // Загрузка в Supabase Storage
            const fileName = `vid_${adId}.mp4`;
            await supabase.storage.from('ads_videos').upload(fileName, uint8Array, { contentType: 'video/mp4', upsert: true });
            storageUrl = supabase.storage.from('ads_videos').getPublicUrl(fileName).data.publicUrl;
          }
        } catch (e: any) { console.error(`[MEDIA ERR] Ad ${adId}: ${e.message}`); }
      }

      processed.push({
        id: adId,
        thumbnail: videoSource?.video_preview_image_url || "",
        video: storageUrl,
        title: ad.snapshot?.title || "Ad",
        body: ad.snapshot?.body?.text || ""
      });
    }

    // 3. АНАЛИЗ С АВТО-ПОДБОРОМ МОДЕЛИ (Fallback Brute-force)
    let strategy = "Vision analysis unavailable.";
    if (googleFileResource?.file?.name) {
      const gFileName = googleFileResource.file.name;
      
      for (let attempt = 0; attempt < 12; attempt++) {
        await new Promise(r => setTimeout(r, 5000)); 
        const checkRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/${gFileName}?key=${geminiKey}`);
        const checkData = await checkRes.json();
        
        console.info(`[POLLING] File State: ${checkData.state}`);

        if (checkData.state === 'ACTIVE') {
          await new Promise(r => setTimeout(r, 10000)); // "Прогрев" видео
          console.info("[BRUTEFORCE] Starting model selection...");

          // Список моделей 2026 года для перебора
          const modelsToTry = [
            "gemini-3-flash-preview", // Самая новая Gemini 3 Flash
            "gemini-3-flash",         // Gemini 3 Flash (стабильная)
            "gemini-3-pro-preview",   // Умная Gemini 3
            "gemini-2.0-flash-exp",   // Запасная Gemini 2
            "gemini-1.5-flash"        // Старая добрая 1.5
          ];

          for (const modelName of modelsToTry) {
            try {
              console.info(`[BRUTEFORCE] Trying model: ${modelName}`);
              const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${geminiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  contents: [{
                    parts: [
                      { text: "ACT AS A UA STRATEGIST. Analyze this video: 1. CORE CONCEPT, 2. VISUAL HOOK (0-3s), 3. MECHANICS, 4. PSYCHOLOGICAL TRIGGERS. Reply in English." },
                      { file_data: { mime_type: "video/mp4", file_uri: googleFileResource.file.uri } }
                    ]
                  }],
                  safetySettings: [
                    { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                    { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                    { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
                    { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
                  ]
                })
              });

              const gData = await geminiRes.json();

              if (gData.error) {
                console.warn(`[SKIP] Model ${modelName} returned error: ${gData.error.message}`);
                continue; 
              }

              if (gData.candidates?.[0]?.content?.parts?.[0]?.text) {
                strategy = gData.candidates[0].content.parts[0].text;
                console.info(`[!!! SUCCESS !!!] Model ${modelName} generated strategy.`);
                break; // Текст получен, выходим из цикла моделей
              }
            } catch (err) {
              console.error(`[FATAL] Unexpected error on ${modelName}`);
            }
          }
          break; // Выходим из цикла поллинга
        }
      }
    }

    // 4. СОХРАНЕНИЕ
    const brandName = data[0]?.snapshot?.page_name || "Brand";
    await supabase.from('ads_library').insert([{
      page_id: pageId, 
      brand_name: brandName, 
      strategy_analysis: strategy, 
      creatives: processed
    }]);

    console.info(`[FINISH] Processed ${brandName} successfully.`);
    return NextResponse.json({ brand: brandName, strategy, creatives: processed });

  } catch (e: any) {
    console.error(`[CRITICAL] ${e.message}`);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
