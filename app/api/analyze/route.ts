import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || '', 
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

// Для Vercel Pro ставим максимум
export const maxDuration = 300; 

export async function POST(req: Request) {
  try {
    const { url } = await req.json();
    const token = process.env.APIFY_TOKEN;
    const geminiKey = process.env.GEMINI_API_KEY;

    const idMatch = url.match(/\d{10,}/);
    const pageId = idMatch ? idMatch[0] : url;

    // 1. Сбор данных через Apify (Таймаут 60 сек)
    console.info(`[ULTRA] Starting Scraper for ID: ${pageId}`);
    const apifyUrl = `https://api.apify.com/v2/acts/curious_coder~facebook-ads-library-scraper/run-sync-get-dataset-items?token=${token}&timeout=60&maxChargedResults=10`;
    
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
    if (!Array.isArray(data)) throw new Error("Apify failed to collect data.");

    const processed = [];
    let googleFileResource: any = null;

    // 2. Обработка объявлений и «железная» загрузка первого видео
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

            // Resumable Upload для Google (только для первого видео)
            if (i === 0 && !googleFileResource) {
              console.info(`[IRON] Initializing Upload for ${(buffer.byteLength / 1024 / 1024).toFixed(2)}MB...`);
              
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
              if (uploadUrl) {
                const finalRes = await fetch(uploadUrl, {
                  method: 'POST',
                  headers: { 'X-Goog-Upload-Offset': '0', 'X-Goog-Upload-Command': 'upload, finalize' },
                  body: Buffer.from(buffer)
                });
                googleFileResource = await finalRes.json();
                console.info(`[IRON] SUCCESS: Video uploaded to Google.`);
              }
            }

            // Загрузка в Supabase для плеера
            const fileName = `vid_${adId}.mp4`;
            await supabase.storage.from('ads_videos').upload(fileName, buffer, { contentType: 'video/mp4', upsert: true });
            storageUrl = supabase.storage.from('ads_videos').getPublicUrl(fileName).data.publicUrl;
          }
        } catch (e: any) { console.error(`[MEDIA ERROR] ${adId}`); }
      }

      processed.push({
        id: adId,
        thumbnail: videoSource?.video_preview_image_url || "",
        video: storageUrl,
        title: ad.snapshot?.title || "Mobile Ad",
        body: ad.snapshot?.body?.text || ""
      });
    }

    // 3. Анализ видео через Gemini 3 / 2.0 / 1.5
    let strategy = "Vision analysis unavailable.";
    let winnerModel = "None";

    if (googleFileResource?.file?.name) {
      const gFileName = googleFileResource.file.name;
      
      // Цикл поллинга (проверка готовности файла)
      for (let attempt = 0; attempt < 12; attempt++) {
        await new Promise(r => setTimeout(r, 4000)); 
        const checkRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/${gFileName}?key=${geminiKey}`);
        const checkData = await checkRes.json();
        
        if (checkData.state === 'ACTIVE') {
          console.info("[ULTRA] Video is ACTIVE. Deep indexing for 25s...");
          await new Promise(r => setTimeout(r, 25000)); 
          
          const modelsToTry = [
            'gemini-3-flash',        // Новое поколение Fast
            'gemini-3-pro',          // Самая мощная 2026
            'gemini-2.0-flash-001',  // Стабильная 2025
            'gemini-1.5-pro-latest'  // Проверенный фолбэк
          ];

          for (const model of modelsToTry) {
            console.info(`[ULTRA DEBUG] Requesting analysis from: ${model}`);
            try {
              const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  contents: [{
                    parts: [
                      { text: "INSTRUCTION: You are a professional UA Creative Strategist. WATCH this full video and provide: 1. CORE CONCEPT, 2. VISUAL HOOK (0-3s), 3. MECHANICS (step-by-step), 4. PSYCHOLOGY. Respond ONLY in English." },
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

              if (gData.candidates?.[0]?.content?.parts?.[0]?.text) {
                strategy = gData.candidates[0].content.parts[0].text;
                winnerModel = model;
                console.info(`[ULTRA WIN] Success with: ${model}`);
                break; // Выход из цикла моделей
              }
            } catch (err) { console.error(`[ULTRA FAIL] ${model}`); }
          }
          break; // Выход из цикла поллинга, так как мы закончили (успешно или нет)
        }
        console.info(`[ULTRA] Polling file status: ${checkData.state}`);
      }
    }

    // 4. Сохранение и ответ
    const brandName = data[0]?.snapshot?.page_name || "Brand Name";
    await supabase.from('ads_library').insert([{
      page_id: pageId, 
      brand_name: brandName, 
      strategy_analysis: strategy, 
      creatives: processed
    }]);

    return NextResponse.json({ brand: brandName, strategy, creatives: processed, model: winnerModel });

  } catch (e: any) {
    console.error(`[CRITICAL ERROR] ${e.message}`);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
