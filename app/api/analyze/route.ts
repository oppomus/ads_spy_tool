import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '');

// Vercel не будет ждать вечность
export const maxDuration = 60; 

export async function POST(req: Request) {
  try {
    const { url } = await req.json();
    const token = process.env.APIFY_TOKEN;
    const geminiKey = process.env.GEMINI_API_KEY;

    const idMatch = url.match(/\d{10,}/);
    const pageId = idMatch ? idMatch[0] : url;

    // ПРИМЕНЕНО ПО ИНСТРУКЦИИ: Запускаем Actor и ждем ровно 40 секунд
    const apifyUrl = `https://api.apify.com/v2/acts/apify~facebook-ads-scraper/runs?token=${token}&wait=40`;
    
    const runRes = await fetch(apifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        "startUrls": [{ "url": `https://www.facebook.com/ads/library/?view_all_page_id=${pageId}&active_status=active&ad_type=all&country=ALL` }], 
        "maxResults": 10,           // Жесткий лимит в теле
        "searchPageLimit": 1,        // Только первая страница
        "isDetailedAdsView": true 
      })
    });

    const runData = await runRes.json();
    const runId = runData.data.id;

    // СРАЗУ забираем данные из датасета этого запуска, не дожидаясь его окончания!
    const itemsRes = await fetch(`https://api.apify.com/v2/acts/apify~facebook-ads-scraper/runs/${runId}/dataset/items?token=${token}&limit=10`);
    const data = await itemsRes.json();

    if (!Array.isArray(data) || data.length === 0) throw new Error("Apify is too slow. Check Archive later.");

    const processed = [];

    // ОБРАБОТКА ВИДЕО (Берем только 5 штук, чтобы успеть за 60с Vercel)
    for (const ad of data.slice(0, 5)) {
      let videoUrl = null;
      const fbVideo = ad.adCreativeVideoData?.videoUrl;

      if (fbVideo) {
        try {
          const vFetch = await fetch(fbVideo);
          const buffer = await vFetch.arrayBuffer();
          const fileName = `vid_${ad.adId}.mp4`;

          // Загрузка (используем service_role_key)
          const { error: upError } = await supabase.storage
            .from('ads_videos')
            .upload(fileName, buffer, { contentType: 'video/mp4', upsert: true });

          if (!upError) {
            videoUrl = supabase.storage.from('ads_videos').getPublicUrl(fileName).data.publicUrl;
          }
        } catch (e) { console.error("Media error:", ad.adId); }
      }

      processed.push({
        id: ad.adId,
        thumbnail: ad.adCreativeThumbnails?.[0] || ad.adSnapshotUrl || "",
        video: videoUrl, // Если тут null, видео не сохранилось
        text: ad.adCopy || "Mobile gameplay"
      });
    }

    // ВИЗУАЛЬНЫЙ АНАЛИЗ GEMINI
    const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `As a UA Expert, teardown these ads for "${data[0].pageName}". Detail 3 visual concepts. Hook and Psychology. Data: ${JSON.stringify(processed)}`
          }]
        }]
      })
    });

    const gData = await geminiRes.json();
    const strategy = gData?.candidates?.[0]?.content?.parts?.[0]?.text || "Ready.";

    // ПИШЕМ В БАЗУ (АРХИВ)
    await supabase.from('ads_library').insert([{
      page_id: pageId, brand_name: data[0].pageName, strategy_analysis: strategy, creatives: processed
    }]);

    return NextResponse.json({ brand: data[0].pageName, strategy, creatives: processed });

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
