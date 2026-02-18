import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '');
export const maxDuration = 300; 

export async function POST(req: Request) {
  try {
    const { url } = await req.json();
    const token = process.env.APIFY_TOKEN;
    const geminiKey = "AIzaSyB2Jc3tFV5cwYLjUBDqwAjgClGhwMv8cB8"; 

    const idMatch = url.match(/\d{10,}/);
    const pageId = idMatch ? idMatch[0] : url;

    // 1. Apify: Берем топ-10
    const apifyUrl = `https://api.apify.com/v2/acts/curious_coder~facebook-ads-library-scraper/run-sync-get-dataset-items?token=${token}&timeout=60&maxChargedResults=10`;
    const res = await fetch(apifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        "urls": [{ "url": `https://www.facebook.com/ads/library/?view_all_page_id=${pageId}&active_status=active&ad_type=all&country=ALL&sort_data[direction]=desc&sort_data[mode]=total_impressions` }], 
        "count": 10, "scrapeAdDetails": true 
      })
    });

    const data = await res.json();
    const processed = [];
    const googleFileUris = []; // Массив для всех видео в Google

    // 2. Массовая загрузка всех креативов
    console.info(`[MEDIA] Processing ${data.length} videos...`);
    for (let i = 0; i < data.length; i++) {
      const ad = data[i];
      const adId = ad.ad_archive_id;
      const videoSource = ad.snapshot?.videos?.[0] || ad.snapshot?.cards?.[0];
      const fbVideoUrl = videoSource?.video_hd_url || videoSource?.video_sd_url;
      
      if (fbVideoUrl) {
        try {
          const vFetch = await fetch(fbVideoUrl);
          if (vFetch.ok) {
            const buffer = await vFetch.arrayBuffer();
            const uint8Array = new Uint8Array(buffer);
            const fileSize = uint8Array.byteLength.toString();

            // Загрузка в Google Cloud для каждого видео
            const startRes = await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${geminiKey}`, {
              method: 'POST',
              headers: {
                'X-Goog-Upload-Protocol': 'resumable',
                'X-Goog-Upload-Command': 'start',
                'X-Goog-Upload-Header-Content-Type': 'video/mp4',
                'X-Goog-Upload-Header-Content-Length': fileSize,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ file: { display_name: `ad_${adId}` } })
            });

            const uploadUrl = startRes.headers.get('x-goog-upload-url');
            if (uploadUrl) {
              const finalRes = await fetch(uploadUrl, {
                method: 'POST',
                headers: { 'X-Goog-Upload-Offset': '0', 'X-Goog-Upload-Command': 'upload, finalize' },
                body: uint8Array
              });
              const gFile = await finalRes.json();
              googleFileUris.push({ uri: gFile.file.uri, name: gFile.file.name });
              console.info(`[GOOGLE] Uploaded ${i+1}/10: ${adId}`);
            }

            // Загрузка в Supabase для отображения
            const fileName = `vid_${adId}.mp4`;
            await supabase.storage.from('ads_videos').upload(fileName, uint8Array, { contentType: 'video/mp4', upsert: true });
            const sUrl = supabase.storage.from('ads_videos').getPublicUrl(fileName).data.publicUrl;
            
            processed.push({ id: adId, thumbnail: videoSource?.video_preview_image_url || "", video: sUrl, title: ad.snapshot?.title || "Ad", body: ad.snapshot?.body?.text || "" });
          }
        } catch (e) { console.error(`Err uploading ${adId}`); }
      }
    }

    // 3. Ожидание готовности ВСЕХ файлов и АНАЛИЗ
    let strategy = "Strategic grouping failed.";
    if (googleFileUris.length > 0) {
      console.info(`[AI] Waiting for ${googleFileUris.length} files to index...`);
      
      // Поллинг готовности последнего файла (обычно они готовы одновременно)
      let allReady = false;
      for (let attempt = 0; attempt < 15; attempt++) {
        await new Promise(r => setTimeout(r, 5000));
        const lastFile = googleFileUris[googleFileUris.length - 1];
        const check = await fetch(`https://generativelanguage.googleapis.com/v1beta/${lastFile.name}?key=${geminiKey}`);
        const cData = await check.json();
        if (cData.state === 'ACTIVE') { allReady = true; break; }
      }

      if (allReady) {
        await new Promise(r => setTimeout(r, 5000));
        console.info("[AI] Sending multi-file prompt to Gemini...");

        // ФОРМИРУЕМ МАССИВ ЧАСТЕЙ ДЛЯ ПРОМПТА
        const promptParts = [
          { text: "INSTRUCTION: You are a Senior UA Lead. I am providing you with 10 most successful video ads of a competitor. 1. GROUP these ads into 2-4 distinct CREATIVE CONCEPTS. 2. For each concept, identify: CORE IDEA, VISUAL HOOK, MECHANICS, and PSYCHOLOGICAL TRIGGERS. 3. Which concept seems most dominant? Respond in English with clear formatting." }
        ];

        // Добавляем все видео в запрос
        googleFileUris.forEach(file => {
          promptParts.push({ file_data: { mime_type: "video/mp4", file_uri: file.uri } });
        });

        // Брутфорс моделей (как в прошлом шаге)
        const models = ["gemini-1.5-pro", "gemini-1.5-flash", "gemini-2.0-flash-exp"];
        for (const model of models) {
          const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: promptParts }],
              safetySettings: [{ category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" }, { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" }, { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" }, { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }]
            })
          });

          const gData = await geminiRes.json();
          if (gData.candidates?.[0]?.content?.parts?.[0]?.text) {
            strategy = gData.candidates[0].content.parts[0].text;
            console.info(`[AI SUCCESS] Strategy generated with ${model}`);
            break;
          }
        }
      }
    }

    const brand = data[0]?.snapshot?.page_name || "Brand";
    await supabase.from('ads_library').insert([{ page_id: pageId, brand_name: brand, strategy_analysis: strategy, creatives: processed }]);
    
    return NextResponse.json({ brand, strategy, creatives: processed });

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
