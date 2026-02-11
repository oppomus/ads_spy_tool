import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || '', 
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export const maxDuration = 60; // Максимум для Vercel

export async function POST(req: Request) {
  console.info("--- [START] АНАЛИЗ ЗАПУЩЕН ---");
  try {
    const { url } = await req.json();
    const token = process.env.APIFY_TOKEN;
    const geminiKey = process.env.GEMINI_API_KEY;

    const idMatch = url.match(/\d{10,}/);
    const pageId = idMatch ? idMatch[0] : url;

    // Вызов скрапера curious_coder с лимитом 10
    const apifyUrl = `https://api.apify.com/v2/acts/curious_coder~facebook-ads-library-scraper/run-sync-get-dataset-items?token=${token}&timeout=45&maxChargedResults=10`;
    
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
    if (!Array.isArray(data)) throw new Error("Apify failed to return data array");
    console.info(`[INFO] Получено от Apify: ${data.length} объектов`);

    const processed = [];

    // ОБРАБОТКА ПО ТВОЕМУ JSON
    for (const ad of data.slice(0, 5)) {
      const adId = ad.ad_archive_id;
      // Ищем видео именно в cards[0]
      const card = ad.snapshot?.cards?.[0];
      const fbVideoUrl = card?.video_hd_url || card?.video_sd_url;
      const thumbUrl = card?.video_preview_image_url;
      
      let storageUrl = null;

      if (fbVideoUrl) {
        try {
          console.info(`[FETCHING] Начинаю скачивание видео для ID: ${adId}`);
          const vFetch = await fetch(fbVideoUrl);
          if (!vFetch.ok) throw new Error("CDN download failed");
          
          const buffer = await vFetch.arrayBuffer();
          const fileName = `vid_${adId}.mp4`;

          // Загрузка в Supabase Storage
          const { error: upError } = await supabase.storage
            .from('ads_videos')
            .upload(fileName, buffer, { contentType: 'video/mp4', upsert: true });

          if (upError) {
            console.error(`[STORAGE ERROR] ${upError.message}`);
          } else {
            storageUrl = supabase.storage.from('ads_videos').getPublicUrl(fileName).data.publicUrl;
            console.info(`[SUCCESS] Видео сохранено: ${storageUrl}`);
          }
        } catch (e) { 
          console.error(`[SKIP] Ошибка на видео ${adId}, иду дальше...`); 
        }
      }

      processed.push({
        id: adId,
        thumbnail: thumbUrl || "",
        video: storageUrl,
        rawUrl: fbVideoUrl, // Для анализа ИИ
        title: card?.title || "No Title",
        body: ad.snapshot?.body?.text || ""
      });
    }

    // GEMINI: Полноценный разбор стратегии
    const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `Ты — Senior UA Lead. Проведи глубокий разбор Township на основе данных: ${JSON.stringify(processed)}. 
            1. Сгруппируй видео по КОНЦЕПТАМ. 
            2. Для каждого концепта опиши: ХУК (0-3 сек), ГЕЙМПЛЕЙ и ПСИХОЛОГИЮ. 
            Пиши на русском, используй только текст и списки. БЕЗ MARKDOWN БИБЛИОТЕК.`
          }]
        }]
      })
    });

    const gData = await geminiRes.json();
    const strategy = gData?.candidates?.[0]?.content?.parts?.[0]?.text || "Анализ готов.";

    // ПИШЕМ В БАЗУ ДЛЯ АРХИВА
    await supabase.from('ads_library').insert([{
      page_id: pageId, 
      brand_name: data[0]?.snapshot?.page_name || "Township", 
      strategy_analysis: strategy, 
      creatives: processed
    }]);

    console.info("--- [DONE] ВСЁ ЗАВЕРШЕНО УСПЕШНО ---");
    return NextResponse.json({ brand: data[0]?.snapshot?.page_name, strategy, creatives: processed });

  } catch (e: any) {
    console.error(`[CRITICAL] ${e.message}`);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
