import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Используем SERVICE_ROLE_KEY для обхода RLS, но политики из Шага 1 всё равно нужны для надежности
const supabase = createClient(process.env.SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '');

export const maxDuration = 60; 

export async function POST(req: Request) {
  try {
    const { url } = await req.json();
    const token = process.env.APIFY_TOKEN;
    const geminiKey = process.env.GEMINI_API_KEY;

    const idMatch = url.match(/\d{10,}/);
    const pageId = idMatch ? idMatch[0] : url;

    // ПРИМЕНЕНО: Структура curious_coder (urls + count)
    // maxChargedResults=10 — это условие этого актора
    const apifyUrl = `https://api.apify.com/v2/acts/curious_coder~facebook-ads-library-scraper/run-sync-get-dataset-items?token=${token}&timeout=50&maxChargedResults=10`;
    
    console.log("--- STARTING ANALYSIS FOR ID:", pageId);

    const res = await fetch(apifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        "urls": [{ "url": `https://www.facebook.com/ads/library/?view_all_page_id=${pageId}&active_status=active&ad_type=all&country=ALL` }], 
        "count": 10,
        "scrapeAdDetails": true // ОБЯЗАТЕЛЬНО для ссылок на видео
      })
    });

    const data = await res.json();
    if (!Array.isArray(data)) throw new Error(`Apify Error: ${JSON.stringify(data)}`);

    const processed = [];

    // ОБРАБОТКА ВИДЕО С ЛОГИРОВАНИЕМ
    for (const ad of data.slice(0, 5)) {
      // ПРОВЕРКА: скрапер curious_coder может отдавать видео в разных ключах
      const videoSource = ad.adCreativeVideoData?.videoUrl || ad.videoUrl;
      let storageUrl = null;

      if (videoSource) {
        try {
          console.log(`[LOG] Downloading video for ad: ${ad.adId}`);
          const vFetch = await fetch(videoSource);
          const buffer = await vFetch.arrayBuffer();
          const fileName = `vid_${ad.adId}.mp4`;

          const { error: upError } = await supabase.storage
            .from('ads_videos')
            .upload(fileName, buffer, { contentType: 'video/mp4', upsert: true });

          if (upError) {
            console.error(`[ERROR] Supabase Upload failed for ${ad.adId}:`, upError.message);
          } else {
            console.log(`[SUCCESS] Video uploaded for ${ad.adId}`);
            storageUrl = supabase.storage.from('ads_videos').getPublicUrl(fileName).data.publicUrl;
          }
        } catch (err: any) {
          console.error(`[ERROR] Fetching video failed:`, err.message);
        }
      } else {
        console.warn(`[WARN] No video source found for ad ${ad.adId}`);
      }

      processed.push({
        id: ad.adId,
        thumbnail: ad.adCreativeThumbnails?.[0] || ad.thumbnailUrl,
        video: storageUrl,
        text: ad.adCopy || "No text"
      });
    }

    // GEMINI ANALYSIS
    const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `Quick teardown of visual hooks: ${JSON.stringify(processed)}` }] }]
      })
    });

    const gData = await geminiRes.json();
    const strategy = gData?.candidates?.[0]?.content?.parts?.[0]?.text || "Strategy generated.";

    // SAVE TO DB
    await supabase.from('ads_library').insert([{
      page_id: pageId, brand_name: data[0]?.pageName || "Brand", strategy_analysis: strategy, creatives: processed
    }]);

    console.log("--- ANALYSIS COMPLETE ---");
    return NextResponse.json({ brand: data[0]?.pageName, strategy, creatives: processed });

  } catch (e: any) {
    console.error("[CRITICAL ERROR]:", e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
