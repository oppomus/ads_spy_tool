import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '');
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { url } = await req.json();
    const token = process.env.APIFY_TOKEN;
    const geminiKey = process.env.GEMINI_API_KEY;

    const idMatch = url.match(/\d{10,}/);
    const pageId = idMatch ? idMatch[0] : url;

    const apifyUrl = `https://api.apify.com/v2/acts/curious_coder~facebook-ads-library-scraper/run-sync-get-dataset-items?token=${token}&timeout=50&maxChargedResults=10`;
    
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
    if (!Array.isArray(data)) throw new Error("Apify error");

    const processed = [];

    // ОБРАБОТКА ПО ТВОЕМУ JSON: ищем в snapshot.videos
    for (const ad of data.slice(0, 5)) {
      const adId = ad.ad_archive_id;
      const videoData = ad.snapshot?.videos?.[0]; // Точный путь из JSON
      const fbVideoUrl = videoData?.video_hd_url || videoData?.video_sd_url;
      const thumbUrl = videoData?.video_preview_image_url;
      
      let storageUrl = null;

      if (fbVideoUrl) {
        try {
          const vFetch = await fetch(fbVideoUrl);
          const buffer = await vFetch.arrayBuffer();
          const fileName = `vid_${adId}.mp4`;

          const { error: upError } = await supabase.storage
            .from('ads_videos')
            .upload(fileName, buffer, { contentType: 'video/mp4', upsert: true });

          if (!upError) {
            storageUrl = supabase.storage.from('ads_videos').getPublicUrl(fileName).data.publicUrl;
          }
        } catch (e) { console.error("Media fail:", adId); }
      }

      processed.push({
        id: adId,
        thumbnail: thumbUrl || "",
        video: storageUrl,
        rawVideoUrl: fbVideoUrl,
        title: ad.snapshot?.title || "Ad",
        body: ad.snapshot?.body?.text || ""
      });
    }

    // GEMINI: Глубокий визуальный анализ по ссылке на видео
    const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `Ты — Senior UA Lead. Твоя задача — провести визуальный разбор Township-креативов по этим данным: ${JSON.stringify(processed)}. 
            ПРОАНАЛИЗИРУЙ ВИДЕО по ссылке rawVideoUrl. 
            1. Сгруппируй их в 2-3 "КОНЦЕПТА" (например, "Failed Rescue", "ASMR Construction").
            2. Для каждого концепта опиши:
               - ВИЗУАЛЬНЫЙ ХУК (0-3 сек): Что именно происходит? Что происходит далее? Разбей хуки на составляющие: ранний хук, финальный хук.
               - МЕХАНИКА: Какой геймплей? Это реальный геймплей или Misleading? Что именно делается в видео, механику подробно по шагам;
               - ПСИХОЛОГИЯ: Почему это цепляет игрока? (фрустрация, удовлетворение и т.д.).
            Пиши подробно на английском. Используй только текст и списки. Если концепты у нескольких видео схожие - объедини в один концепт. Если разные - выдели отдельные концепты, Не разбирай в текстовом виде КАЖДОЕ видео, нужно разобрать КОНЦЕПТЫ.`
          }]
        }]
      })
    });

    const gData = await geminiRes.json();
    const strategy = gData?.candidates?.[0]?.content?.parts?.[0]?.text || "Анализ готов.";

    await supabase.from('ads_library').insert([{
      page_id: pageId, 
      brand_name: data[0]?.page_name || "Township Mobile", 
      strategy_analysis: strategy, 
      creatives: processed
    }]);

    return NextResponse.json({ brand: data[0]?.page_name, strategy, creatives: processed });

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
