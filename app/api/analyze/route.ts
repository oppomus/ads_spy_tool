import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Инициализация клиента Supabase с Service Role Key для обхода RLS
const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

// Увеличиваем лимит времени выполнения для обработки тяжелых видео
export const maxDuration = 60;

export async function POST(req: Request) {
  console.info("--- [START] Запуск процесса анализа ---");
  try {
    const { url } = await req.json();
    const token = process.env.APIFY_TOKEN;
    const geminiKey = process.env.GEMINI_API_KEY;

    // Парсим ID страницы из URL
    const idMatch = url.match(/\d{10,}/);
    const pageId = idMatch ? idMatch[0] : url;

    console.info(`[STEP 1] Страница ID: ${pageId}. Запуск скрапера Apify...`);

    // ПРИМЕНЕНО: Структура для curious_coder с лимитом 10
    const apifyUrl = `https://api.apify.com/v2/acts/curious_coder~facebook-ads-library-scraper/run-sync-get-dataset-items?token=${token}&timeout=45&maxChargedResults=10`;

    const res = await fetch(apifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        "urls": [{ "url": `https://www.facebook.com/ads/library/?view_all_page_id=${pageId}&active_status=active&ad_type=all&country=ALL` }],
        "count": 10,
        "scrapeAdDetails": true // Включаем для получения прямых ссылок на видео
      })
    });

    const data = await res.json();

    if (!Array.isArray(data)) {
      console.error("[ERROR] Apify вернул ошибку:", data);
      throw new Error("Apify failed to return data array");
    }

    console.info(`[STEP 2] Получено ${data.length} объявлений. Начинаю обработку видео...`);

    const processed = [];

    // ОБРАБОТКА ВИДЕО ПО ТВОЕМУ JSON
    for (const ad of data.slice(0, 5)) {
      // Извлекаем данные по точным ключам: ad_archive_id и cards[0]
      const adId = ad.ad_archive_id;
      const card = ad.snapshot?.cards?.[0];
      const fbVideoUrl = card?.video_hd_url || card?.video_sd_url;
      const thumbUrl = card?.video_preview_image_url;

      console.info(`[PROCESS] Обработка объявления ${adId}...`);

      let storageUrl = null;

      if (fbVideoUrl) {
        try {
          console.info(`[DOWNLOAD] Загрузка видео с Facebook CDN для ${adId}...`);
          const vFetch = await fetch(fbVideoUrl);
          if (!vFetch.ok) throw new Error(`CDN Error: ${vFetch.status}`);

          const buffer = await vFetch.arrayBuffer();
          const fileName = `vid_${adId}.mp4`;

          // Загрузка в твой бакет Supabase
          const { error: upError } = await supabase.storage
            .from('ads_videos')
            .upload(fileName, buffer, {
              contentType: 'video/mp4',
              upsert: true
            });

          if (upError) {
            console.error(`[STORAGE FAIL] ${adId}: ${upError.message}`);
          } else {
            const { data: publicData } = supabase.storage.from('ads_videos').getPublicUrl(fileName);
            storageUrl = publicData.publicUrl;
            console.info(`[UPLOAD SUCCESS] Видео сохранено: ${storageUrl}`);
          }
        } catch (mediaErr: any) {
          console.error(`[MEDIA FAIL] Пропуск видео для ${adId}: ${mediaErr.message}`);
        }
      } else {
        console.warn(`[WARN] Видео ссылка не найдена для ${adId}`);
      }

      processed.push({
        id: adId,
        thumbnail: thumbUrl || "",
        video: storageUrl,
        rawVideoUrl: fbVideoUrl, // Передаем нейронке оригинал для анализа
        adTitle: card?.title || "No title",
        adText: ad.snapshot?.body?.text || "No text"
      });
    }

    console.info("[STEP 3] Видео обработаны. Запуск мультимодального анализа Gemini...");

    // GEMINI 1.5 FLASH: Глубокий визуальный разбор
    const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `Ты — Senior UA UA Creative Lead. Твоя задача — провести глубокий ВИЗУАЛЬНЫЙ разбор креативов Township. 
            ДАННЫЕ: ${JSON.stringify(processed)}

            ИНСТРУКЦИЯ ПО АНАЛИЗУ:
            1. Проанализируй визуальный ряд по предоставленным ссылкам (rawVideoUrl) и текстам.
            2. Сгруппируй видео в 2-3 "КОНЦЕПТА" (например, "Failed Rescue", "Mega Construction", "ASMR Cleanup").
            3. Для КАЖДОГО концепта распиши:
               - SETTING & CHARACTERS: Опиши мир, окружение и персонажей.
               - VISUAL HOOK (0-3 сек): Что именно останавливает скролл? (персонажи в беде, яркий контраст, ошибка игрока).
               - MECHANICS: Что за геймплей? (Match-3, Pin Pulling, симуляция). Это реальный геймплей или Misleading?
               - PSYCHOLOGY: Почему это работает? (фрустрация от проигрыша, удовлетворение от порядка, любопытство).
               - FAIL/SUCCESS: Акцентируется ли ролик на проигрыше игрока?
            
            Ответ дай на русском языке. Используй ТОЛЬКО текстовое форматирование (жирный шрифт, списки). Не используй сторонние библиотеки для отображения.`
          }]
        }]
      })
    });

    const gData = await geminiRes.json();
    const strategy = gData?.candidates?.[0]?.content?.parts?.[0]?.text || "Анализ не удался.";

    console.info("[STEP 4] Анализ получен. Сохранение в архив базы...");

    // Запись в историю для последующего просмотра в Архиве
    const { error: dbError } = await supabase.from('ads_library').insert([{
      page_id: pageId,
      brand_name: data[0]?.snapshot?.page_name || "Township Mobile",
      strategy_analysis: strategy,
      creatives: processed
    }]);

    if (dbError) console.error("[DB ERROR] Ошибка записи в историю:", dbError.message);

    console.info("--- [FINISH] Процесс успешно завершен ---");
    
    return NextResponse.json({
      brand: data[0]?.snapshot?.page_name,
      strategy,
      creatives: processed
    });

  } catch (e: any) {
    console.error("[CRITICAL ERROR]", e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
