import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || '', 
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export const maxDuration = 60; // Лимит Vercel для Hobby

export async function POST(req: Request) {
  try {
    const { url } = await req.json();
    const token = process.env.APIFY_TOKEN;
    const geminiKey = process.env.GEMINI_API_KEY;

    const idMatch = url.match(/\d{10,}/);
    const pageId = idMatch ? idMatch[0] : url;

    // Снайперский запрос к curious_coder
    const apifyUrl = `https://api.apify.com/v2/acts/curious_coder~facebook-ads-library-scraper/run-sync-get-dataset-items?token=${token}&timeout=45&maxChargedResults=10`;
    
    console.log(`[START] Анализ страницы: ${pageId}`);

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
    if (!Array.isArray(data)) throw new Error("Apify failed to return array");

    const processed = [];

    // ОБРАБОТКА ВИДЕО: используем вложенный try-catch для надежности
    for (const ad of data.slice(0, 5)) {
      const adId = ad.ad_archive_id;
      const card = ad.snapshot?.cards?.[0];
      const fbVideoUrl = card?.video_hd_url || card?.video_sd_url;
      const thumbUrl = card?.video_preview_image_url;
      
      let storageUrl = null;

      if (fbVideoUrl) {
        try {
          console.log(`[FETCH] Скачиваю видео для объявления ${adId}...`);
          const vFetch = await fetch(fbVideoUrl);
          if (!vFetch.ok) throw new Error("FB download failed");
          
          const buffer = await vFetch.arrayBuffer();
          const fileName = `vid_${adId}.mp4`;

          const { error: upError } = await supabase.storage
            .from('ads_videos')
            .upload(fileName, buffer, { contentType: 'video/mp4', upsert: true });

          if (upError) {
            console.error(`[STORAGE ERROR] ${upError.message}`);
          } else {
            storageUrl = supabase.storage.from('ads_videos').getPublicUrl(fileName).data.publicUrl;
            console.log(`[SUCCESS] Видео загружено в Supabase: ${fileName}`);
          }
        } catch (e) { 
          console.error(`[SKIP] Не удалось загрузить видео для ${adId}, пропускаю...`); 
        }
      }

      processed.push({
        id: adId,
        thumbnail: thumbUrl || "",
        video: storageUrl,
        rawUrl: fbVideoUrl, // Помогаем Gemini увидеть оригинал
        title: card?.title || "Ad",
        body: ad.snapshot?.body?.text || ""
      });
    }

    // GEMINI: Глубокий визуальный анализ концептов
    const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `Ты — Senior UA Creative Lead. Твоя задача — детально разобрать визуальную стратегию Township. 
            ДАННЫЕ КРЕАТИВОВ: ${JSON.stringify(processed)}
            
            1. Сгруппируй видео в 2-3 "КОНЦЕПТА" (например, "Player Fail", "Story Choice", "ASMR Construction").
            2. Для каждого концепта распиши:
               - ВИЗУАЛЬНЫЙ ХУК (0-3 сек): Опиши действие и персонажей.
               - МЕХАНИКА: Какой геймплей показан? (реальный или фейковый?).
               - ПСИХОЛОГИЯ: Почему это заставляет игрока нажать кнопку?
            
            Пиши на русском. Используй простые заголовки и списки. Не используй Markdown-библиотеки.`
          }]
        }]
      })
    });

    const gData = await geminiRes.json();
    const strategy = gData?.candidates?.[0]?.content?.parts?.[0]?.text || "Анализ готов.";

    // СОХРАНЕНИЕ В БАЗУ ДЛЯ АРХИВА
    await supabase.from('ads_library').insert([{
      page_id: pageId, 
      brand_name: data[0]?.snapshot?.page_name || "Brand", 
      strategy_analysis: strategy, 
      creatives: processed
    }]);

    console.log("[DONE] Анализ завершен и сохранен в базу.");
    return NextResponse.json({ brand: data[0]?.snapshot?.page_name, strategy, creatives: processed });

  } catch (e: any) {
    console.error("[CRITICAL ERROR]", e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
