import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '');

export const maxDuration = 60; // Лимит Vercel

export async function POST(req: Request) {
  try {
    const { url } = await req.json();
    const token = process.env.APIFY_TOKEN;
    const geminiKey = process.env.GEMINI_API_KEY;

    const idMatch = url.match(/\d{10,}/);
    const pageId = idMatch ? idMatch[0] : url;

    // 1. ЗАПРОС С ТАЙМАУТОМ 60 СЕКУНД (Золотая середина между 30 и 300)
    const apifyUrl = `https://api.apify.com/v2/acts/apify~facebook-ads-scraper/run-sync-get-dataset-items?token=${token}&wait=60`;
    
    const res = await fetch(apifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        "startUrls": [{ "url": `https://www.facebook.com/ads/library/?view_all_page_id=${pageId}&active_status=active&ad_type=all&country=ALL` }], 
        "maxResults": 5,             // СТРОГО 5 штук для скорости
        "searchPageLimit": 1,        // Только 1 страница скролла
        "isDetailedAdsView": true    // Нужно для получения прямых ссылок на видео
      })
    });

    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) throw new Error("Scraper timed out. Try again.");

    const processed = [];

    // 2. ЗАГРУЗКА ВИДЕО В SUPABASE
    for (const ad of data.slice(0, 5)) {
      let finalVideoUrl = null;
      const fbVideo = ad.adCreativeVideoData?.videoUrl;

      if (fbVideo) {
        try {
          const vidRes = await fetch(fbVideo);
          const buffer = await vidRes.arrayBuffer();
          const fileName = `vid_${ad.adId}.mp4`;

          // Загрузка (используем service_role, политики не нужны)
          const { error: upError } = await supabase.storage
            .from('ads_videos')
            .upload(fileName, buffer, { contentType: 'video/mp4', upsert: true });

          if (!upError) {
            finalVideoUrl = supabase.storage.from('ads_videos').getPublicUrl(fileName).data.publicUrl;
          }
        } catch (e) { console.error("Video download failed:", ad.adId); }
      }

      processed.push({
        id: ad.adId,
        thumbnail: ad.adCreativeThumbnails?.[0] || ad.adSnapshotUrl,
        video: finalVideoUrl,
        text: ad.adCopy || ad.adCaption || "Video creative"
      });
    }

    // 3. ПОДРОБНЫЙ АНАЛИЗ ВИДЕО-КОНЦЕПТОВ (Gemini 1.5 Flash)
    const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `You are a UA Expert. Analyze these 5 video creatives for brand "${data[0].pageName}".
            For each of the top 3 concepts, provide:
            1. CONCEPT NAME (e.g., "The Panic Mechanic")
            2. VISUAL HOOK: What visual action happens in the first 2 seconds?
            3. PSYCHOLOGY: Why does this hook force a mobile gamer to click?
            Be specific about VISUALS. Data: ${JSON.stringify(processed)}`
          }]
        }]
      })
    });

    const gData = await geminiRes.json();
    const strategy = gData?.candidates?.[0]?.content?.parts?.[0]?.text || "Teardown failed.";

    await supabase.from('ads_library').insert([{
      page_id: pageId, brand_name: data[0].pageName, strategy_analysis: strategy, creatives: processed
    }]);

    return NextResponse.json({ brand: data[0].pageName, strategy, creatives: processed });

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
