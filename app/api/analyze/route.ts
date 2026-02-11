import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '');

// МАКСИМУМ для Vercel Hobby — 60 секунд.
export const maxDuration = 60; 

export async function POST(req: Request) {
  try {
    const { url } = await req.json();
    const token = process.env.APIFY_TOKEN;
    const geminiKey = process.env.GEMINI_API_KEY;

    const idMatch = url.match(/\d{10,}/);
    const pageId = idMatch ? idMatch[0] : url;

    // ПРИМЕНЕНА ИНСТРУКЦИЯ API: Добавляем лимит прямо в URL и ставим таймаут меньше Vercel
    const apifyUrl = `https://api.apify.com/v2/acts/apify~facebook-ads-scraper/run-sync-get-dataset-items?token=${token}&timeout=45&limit=5`;
    
    const res = await fetch(apifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        "startUrls": [{ "url": `https://www.facebook.com/ads/library/?view_all_page_id=${pageId}&active_status=active&ad_type=all&country=ALL` }], 
        "maxResults": 5,           // Берем ТОЛЬКО 5 объявлений для скорости
        "searchPageLimit": 1,        // СТРОГО ПЕРВАЯ СТРАНИЦА
        "maxRequestsPerStartUrl": 1,
        "isDetailedAdsView": true    // Нужно для видео
      })
    });

    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) throw new Error("Apify failed or too slow");

    const processed = [];

    // СОХРАНЕНИЕ ВИДЕО
    for (const ad of data.slice(0, 5)) {
      const fbVideoUrl = ad.adCreativeVideoData?.videoUrl;
      let storageUrl = null;

      if (fbVideoUrl) {
        try {
          const vFetch = await fetch(fbVideoUrl);
          const buffer = await vFetch.arrayBuffer();
          const fileName = `vid_${ad.adId}.mp4`;

          // Используем service_role ключ, он запишет файл без проблем
          const { error: upError } = await supabase.storage
            .from('ads_videos')
            .upload(fileName, buffer, { contentType: 'video/mp4', upsert: true });

          if (!upError) {
            storageUrl = supabase.storage.from('ads_videos').getPublicUrl(fileName).data.publicUrl;
          }
        } catch (e) { console.error("Video fail:", ad.adId); }
      }

      processed.push({
        id: ad.adId,
        thumbnail: ad.adCreativeThumbnails?.[0] || ad.adSnapshotUrl || "",
        video: storageUrl,
        text: ad.adCopy || "Gameplay"
      });
    }

    // АНАЛИЗ GEMINI
    const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `Analyze 2-3 visual hooks for brand "${data[0].pageName}". Explain Hook (first 2s) and Psychology. Data: ${JSON.stringify(processed)}`
          }]
        }]
      })
    });

    const gData = await geminiRes.json();
    const strategy = gData?.candidates?.[0]?.content?.parts?.[0]?.text || "Strategy ready.";

    // Сохранение в архив
    await supabase.from('ads_library').insert([{
      page_id: pageId, brand_name: data[0].pageName, strategy_analysis: strategy, creatives: processed
    }]);

    return NextResponse.json({ brand: data[0].pageName, strategy, creatives: processed });

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
