import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Инициализация Supabase с сервисным ключом для обхода ограничений RLS на запись
const supabase = createClient(
  process.env.SUPABASE_URL || '', 
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

// Лимит времени выполнения для Vercel Hobby (60 секунд)
export const maxDuration = 60; 

export async function POST(req: Request) {
  try {
    const { url } = await req.json();
    const token = process.env.APIFY_TOKEN;
    const geminiKey = process.env.GEMINI_API_KEY;

    // Извлекаем ID страницы из URL
    const idMatch = url.match(/\d{10,}/);
    const pageId = idMatch ? idMatch[0] : url;

    // Запрос к скраперу curious_coder согласно его спецификации
    // timeout=45 дает запас времени для сохранения видео в Supabase до обрыва связи Vercel
    const apifyUrl = `https://api.apify.com/v2/acts/curious_coder~facebook-ads-library-scraper/run-sync-get-dataset-items?token=${token}&timeout=45&maxChargedResults=10`;
    
    const res = await fetch(apifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        "urls": [{ "url": `https://www.facebook.com/ads/library/?view_all_page_id=${pageId}&active_status=active&ad_type=all&country=ALL` }], 
        "count": 10,
        "scrapeAdDetails": true // Обязательно для получения ссылок на видео
      })
    });

    const data = await res.json();
    if (!Array.isArray(data)) throw new Error("Apify error: " + JSON.stringify(data));

    const processed = [];

    // Обрабатываем первые 5 креативов, чтобы уложиться в тайминги
    for (const ad of data.slice(0, 5)) {
      const adId = ad.ad_archive_id; // Ключ из твоего JSON
      const card = ad.snapshot?.cards?.[0]; // Видео данные лежат в карточках
      const fbVideoUrl = card?.video_hd_url || card?.video_sd_url;
      const thumbUrl = card?.video_preview_image_url;
      
      let storageUrl = null;

      if (fbVideoUrl) {
        try {
          // Скачиваем видео и заливаем в Supabase Storage
          const vFetch = await fetch(fbVideoUrl);
          const buffer = await vFetch.arrayBuffer();
          const fileName = `vid_${adId}.mp4`;

          const { error: upError } = await supabase.storage
            .from('ads_videos')
            .upload(fileName, buffer, { contentType: 'video/mp4', upsert: true });

          if (!upError) {
            storageUrl = supabase.storage.from('ads_videos').getPublicUrl(fileName).data.publicUrl;
          }
        } catch (e) { 
          console.error(`Media processing failed for ad ${adId}`); 
        }
      }

      processed.push({
        id: adId,
        thumbnail: thumbUrl || "",
        video: storageUrl, // Ссылка на видео в твоем облаке
        rawVideoUrl: fbVideoUrl, // Передаем Gemini оригинал для анализа
        title: card?.title || "No title",
        body: ad.snapshot?.body?.text || "No description"
      });
    }

    // ГЛУБОКИЙ UA-АНАЛИЗ КОНЦЕПТОВ (Gemini 1.5 Flash)
    // Мы отправляем ссылки на видео прямо в промпт, чтобы ИИ мог их "посмотреть"
    const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `Ты — Senior UA Creative Lead. Проведи визуальный разбор видео-креативов для бренда "${data[0]?.snapshot?.page_name}". 
            
            ДАННЫЕ: ${JSON.stringify(processed)}

            ТВОЯ ЗАДАЧА:
            1. Сгруппируй эти видео в 2-3 логических "КРЕАТИВНЫХ КОНЦЕПТА" (например, "Player Fail", "Satisfaction/Cleaning", "Story-driven Choice").
            2. Для КАЖДОГО концепта распиши:
               - ВИЗУАЛЬНЫЙ ХУК (0-3 сек): Что именно происходит в первые секунды, чтобы остановить скролл? (персонажи, действия, контрасты).
               - МЕХАНИКА И СЕТТИНГ: Опиши геймплей (Match-3, пазл, симуляция) и окружение.
               - ПСИХОЛОГИЯ: Почему это цепляет? (чувство вины, азарт, удовлетворение от порядка).
               - WIN/FAIL STATE: Используется ли механика проигрыша игрока?
            
            Ответ дай на русском языке в формате Markdown. Используй жирные заголовки и списки.`
          }]
        }]
      })
    });

    const gData = await geminiRes.json();
    const strategy = gData?.candidates?.[0]?.content?.parts?.[0]?.text || "Анализ не удался.";

    // Сохранение результата в архив базы данных
    await supabase.from('ads_library').insert([{
      page_id: pageId, 
      brand_name: data[0]?.snapshot?.page_name || "Unknown Brand", 
      strategy_analysis: strategy, 
      creatives: processed
    }]);

    return NextResponse.json({ 
      brand: data[0]?.snapshot?.page_name, 
      strategy, 
      creatives: processed 
    });

  } catch (e: any) {
    console.error("Critical Error:", e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
