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

    // ПРИМЕНЕНО: maxChargedResults=10 (минимум для этого актора)
    // ПРИМЕНЕНО: Синхронный вызов curious_coder
    const apifyUrl = `https://api.apify.com/v2/acts/curious_coder~facebook-ads-library-scraper/run-sync-get-dataset-items?token=${token}&timeout=55&maxChargedResults=10`;
    
    console.log("--- STARTING ANALYSIS FOR ID:", pageId);

    const res = await fetch(apifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        "urls": [{ "url": `https://www.facebook.com/ads/library/?view_all_page_id=${pageId}&active_status=active&ad_type=all&country=ALL` }], 
        "count": 10,                 // Ключ из инструкции CLI
        "scrapeAdDetails": true      // Обязательно для видео
      })
    });

    const data = await res.json();
    
    // Проверка на массив, чтобы избежать ошибки "undefined" из логов
    if (!Array.isArray(data)) {
        console.error("Apify did not return an array:", data);
        throw new Error("Invalid data format from Scraper");
    }

    const processed = [];

    for (const ad of data.slice(0, 5)) {
      // Ищем видео в разных полях, которые поддерживает этот актор
      const videoSource = ad.videoUrl || ad.adCreativeVideoData?.videoUrl || ad.snapshotUrl;
      let storageUrl = null;

      if (videoSource && videoSource.includes('mp4')) {
        try {
          console.log(`[LOG] Downloading video for adId: ${ad.adId}`);
          const vFetch = await fetch(videoSource);
          const buffer = await vFetch.arrayBuffer();
          const fileName = `vid_${ad.adId || Math.random().toString(36).substring(7)}.mp4`;

          const { error: upError } = await supabase.storage
            .from('ads_videos')
            .upload(fileName, buffer, { contentType: 'video/mp4', upsert: true });

          if (!upError) {
            storageUrl = supabase.storage.from('ads_videos').getPublicUrl(fileName).data.publicUrl;
            console.log(`[SUCCESS] Uploaded to: ${storageUrl}`);
          } else {
            console.error(`[STORAGE ERROR] ${upError.message}`);
          }
        } catch (err: any) {
          console.error(`[FETCH ERROR] ${err.message}`);
        }
      } else {
        // Вот тут вылетало твоё предупреждение "ad undefined"
        console.warn(`[WARN] No valid video source for ad: ${ad.adId || 'unknown ID'}`);
      }

      processed.push({
        id: ad.adId || Math.random().toString(36).substring(7),
        thumbnail: ad.adCreativeThumbnails?.[0] || ad.thumbnailUrl || "",
        video: storageUrl,
        text: ad.adCopy || ad.adCaption || "Ad creative"
      });
    }

    // Анализ через Gemini
    const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `Analyze 3 visual concepts for this brand. Data: ${JSON.stringify(processed)}` }] }]
      })
    });

    const gData = await geminiRes.json();
    const strategy = gData?.candidates?.[0]?.content?.parts?.[0]?.text || "Ready.";

    await supabase.from('ads_library').insert([{
      page_id: pageId, brand_name: data[0]?.pageName || "Brand", strategy_analysis: strategy, creatives: processed
    }]);

    return NextResponse.json({ brand: data[0]?.pageName, strategy, creatives: processed });

  } catch (e: any) {
    console.error("[CRITICAL ERROR]:", e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
