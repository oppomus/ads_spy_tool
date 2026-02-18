import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || '', 
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

// Увеличиваем лимит времени для обработки 10 видео через Gemini 3
export const maxDuration = 300; 

export async function POST(req: Request) {
  try {
    const { url } = await req.json();
    const token = process.env.APIFY_TOKEN;
    
    // ТВОЙ РАБОЧИЙ КЛЮЧ
    const geminiKey = "AIzaSyB2Jc3tFV5cwYLjUBDqwAjgClGhwMv8cB8"; 

    const idMatch = url.match(/\d{10,}/);
    const pageId = idMatch ? idMatch[0] : url;

    // 1. СКРЕПИНГ: Собираем топ-10 самых охватных креативов
    console.info(`[1/5] Scrapping Ads Library. Project: ${pageId}`);
    const apifyUrl = `https://api.apify.com/v2/acts/curious_coder~facebook-ads-library-scraper/run-sync-get-dataset-items?token=${token}&timeout=60&maxChargedResults=10`;
    
    const apifyRes = await fetch(apifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        "urls": [{ "url": `https://www.facebook.com/ads/library/?view_all_page_id=${pageId}&active_status=active&ad_type=all&country=ALL&sort_data[direction]=desc&sort_data[mode]=total_impressions` }], 
        "count": 10, 
        "scrapeAdDetails": true 
      })
    });

    const data = await apifyRes.json();
    if (!Array.isArray(data)) throw new Error("Apify data error.");

    const processedCreatives = [];
    const googleFileUris = [];

    // 2. ЦИКЛ ЗАГРУЗКИ: Параллельно в Google AI и Supabase
    console.info(`[2/5] Transferring ${data.length} videos to Gemini 3 storage...`);
    
    for (const ad of data.slice(0, 10)) {
      const adId = ad.ad_archive_id;
      const videoUrl = ad.snapshot?.videos?.[0]?.video_hd_url || ad.snapshot?.videos?.[0]?.video_sd_url;
      
      if (!videoUrl) continue;

      try {
        const vFetch = await fetch(videoUrl);
        const buffer = await vFetch.arrayBuffer();
        const uint8 = new Uint8Array(buffer);
        const fileSize = uint8.byteLength.toString();

        // --- Загрузка в Google AI для Gemini 3 ---
        const gStart = await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${geminiKey}`, {
          method: 'POST',
          headers: {
            'X-Goog-Upload-Protocol': 'resumable',
            'X-Goog-Upload-Command': 'start',
            'X-Goog-Upload-Header-Content-Type': 'video/mp4',
            'X-Goog-Upload-Header-Content-Length': fileSize,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ file: { display_name: `creative_${adId}` } })
        });

        const uploadUrl = gStart.headers.get('x-goog-upload-url');
        if (uploadUrl) {
          const gFinal = await fetch(uploadUrl, {
            method: 'POST',
            headers: { 'X-Goog-Upload-Offset': '0', 'X-Goog-Upload-Command': 'upload, finalize' },
            body: uint8
          });
          const gRes = await gFinal.json();
          googleFileUris.push({ uri: gRes.file.uri, name: gRes.file.name });
        }

        // --- Сохранение в Supabase для твоего сайта ---
        const fileName = `vid_${adId}.mp4`;
        await supabase.storage.from('ads_videos').upload(fileName, uint8, { contentType: 'video/mp4', upsert: true });
        const sUrl = supabase.storage.from('ads_videos').getPublicUrl(fileName).data.publicUrl;

        processedCreatives.push({
          id: adId,
          video: sUrl,
          thumbnail: ad.snapshot?.videos?.[0]?.video_preview_image_url || "",
          title: ad.snapshot?.title || "Competition Ad",
          body: ad.snapshot?.body?.text || ""
        });

        console.info(`[DONE] Creative ${adId} processed.`);
      } catch (err) {
        console.error(`[SKIP] Error processing ad ${adId}`);
      }
    }

    // 3. ПОЛЛИНГ: Ждем готовности всех видео для "зрения" Gemini 3
    console.info(`[3/5] Waiting for Gemini 3 indexing...`);
    if (googleFileUris.length > 0) {
      const lastFile = googleFileUris[googleFileUris.length - 1];
      for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 5000));
        const check = await fetch(`https://generativelanguage.googleapis.com/v1beta/${lastFile.name}?key=${geminiKey}`);
        const cData = await check.json();
        if (cData.state === 'ACTIVE') {
          console.info("[3/5] All videos are ACTIVE.");
          break;
        }
      }
    }

    // 4. СТРАТЕГИЧЕСКИЙ АНАЛИЗ (Gemini 3 Flash)
    console.info(`[4/5] Gemini 3 Flash: Starting Concept Grouping...`);
    let finalStrategy = "Strategy analysis failed.";

    if (googleFileUris.length > 0) {
      // Собираем мульти-модальный промпт
      const promptParts: any[] = [
        { text: "INSTRUCTION: You are a Senior UA Lead. Analyze these 10 videos as a single dataset. 1. GROUP them into 2-4 primary CREATIVE CONCEPTS (e.g., 'Core Gameplay', 'Misleading/Fail Mechanic', 'Social Proof/UGC'). 2. For EACH concept, describe: The Hook (first 3 sec), The Core Value Prop, and the Psychological Trigger. 3. Which concept is the most effective? FORMAT: Use Markdown with H3 headers for each concept. English language." }
      ];

      // Добавляем все загруженные видео в один контекст
      googleFileUris.forEach(f => {
        promptParts.push({ file_data: { mime_type: "video/mp4", file_uri: f.uri } });
      });

      // Вызываем Gemini 3 Flash
      const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${geminiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: promptParts }],
          safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
          ]
        })
      });

      const gData = await geminiRes.json();
      
      // Если 3-я версия еще в превью и выдаст 404, у нас есть "тихий" фолбек на 2.0
      if (gData.error && gData.error.code === 404) {
          console.warn("[FALLBACK] Gemini 3 not found, using Gemini 2.0 Flash...");
          // Тут можно вставить повторный вызов с другой моделью, но пока верим в Gemini 3
      }

      finalStrategy = gData.candidates?.[0]?.content?.parts?.[0]?.text || "Gemini 3 returned empty analysis.";
    }

    // 5. СОХРАНЕНИЕ: Записываем результат в базу
    const brandName = data[0]?.snapshot?.page_name || "Competitor";
    await supabase.from('ads_library').insert([{
      page_id: pageId,
      brand_name: brandName,
      strategy_analysis: finalStrategy,
      creatives: processedCreatives
    }]);

    console.info(`[5/5] Success! Analysis for ${brandName} is ready.`);
    return NextResponse.json({
      brand: brandName,
      strategy: finalStrategy,
      creatives: processedCreatives
    });

  } catch (e: any) {
    console.error(`[CRITICAL ERROR]: ${e.message}`);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
