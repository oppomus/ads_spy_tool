import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '');

// Vercel Hobby limit = 60s
export const maxDuration = 60; 

export async function POST(req: Request) {
  try {
    const { url } = await req.json();
    const token = process.env.APIFY_TOKEN;
    const geminiKey = process.env.GEMINI_API_KEY;

    const idMatch = url.match(/\d{10,}/);
    const pageId = idMatch ? idMatch[0] : url;

    // СТРУКТУРА СОГЛАСНО README curious_coder/facebook-ads-library-scraper
    // Используем urls (массив) и limitPerUrl
    const apifyUrl = `https://api.apify.com/v2/acts/curious_coder~facebook-ads-library-scraper/run-sync-get-dataset-items?token=${token}&timeout=50`;
    
    const res = await fetch(apifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        "urls": [ `https://www.facebook.com/ads/library/?view_all_page_id=${pageId}&active_status=active&ad_type=all&country=ALL` ], 
        "limitPerUrl": 10,           // Жесткий лимит на поиск
        "maxResults": 10,            // Общий лимит
        "scrapeAdDetails": true      // ОБЯЗАТЕЛЬНО для получения видео-ссылок
      })
    });

    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) throw new Error("Apify returned no results or timed out.");

    const processed = [];

    // ОБРАБОТКА: Качаем видео в Supabase
    // Берем только первые 5, чтобы успеть за 60 секунд Vercel
    for (const ad of data.slice(0, 5)) {
      const videoLink = ad.adCreativeVideoData?.videoUrl || ad.videoUrl;
      let storageUrl = null;

      if (videoLink) {
        try {
          const vFetch = await fetch(videoLink);
          const buffer = await vFetch.arrayBuffer();
          const fileName = `vid_${ad.adId || Math.random().toString(36).substring(7)}.mp4`;

          // Service role игнорирует RLS, загрузка пройдет
          const { error: upError } = await supabase.storage
            .from('ads_videos')
            .upload(fileName, buffer, { contentType: 'video/mp4', upsert: true });

          if (!upError) {
            storageUrl = supabase.storage.from('ads_videos').getPublicUrl(fileName).data.publicUrl;
          }
        } catch (e) { console.error("Media fail:", ad.adId); }
      }

      processed.push({
        id: ad.adId || Math.random().toString(36).substring(7),
        thumbnail: ad.adCreativeThumbnails?.[0] || ad.thumbnailUrl || "",
        video: storageUrl, // Ссылка на твой Storage
        text: ad.adCopy || ad.adCaption || "Gameplay"
      });
    }

    // АНАЛИЗ GEMINI (Разбор визуальных хуков)
    const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `Analyze 3 visual concepts for brand "${data[0].pageName || 'Brand'}". 
            Break down the Hook (first 2s) and Psychology.
            Data: ${JSON.stringify(processed)}`
          }]
        }]
      })
    });

    const gData = await geminiRes.json();
    const strategy = gData?.candidates?.[0]?.content?.parts?.[0]?.text || "Strategy ready.";

    // СОХРАНЕНИЕ В АРХИВ
    await supabase.from('ads_library').insert([{
      page_id: pageId, brand_name: data[0].pageName || "Brand", strategy_analysis: strategy, creatives: processed
    }]);

    return NextResponse.json({ brand: data[0].pageName || "Brand", strategy, creatives: processed });

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
