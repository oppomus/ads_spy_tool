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

    // СТРУКТУРА: urls + count + maxChargedResults=10
    const apifyUrl = `https://api.apify.com/v2/acts/curious_coder~facebook-ads-library-scraper/run-sync-get-dataset-items?token=${token}&timeout=50&maxChargedResults=10`;
    
    console.log("--- STARTING ANALYSIS ---");

    const res = await fetch(apifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        "urls": [{ "url": `https://www.facebook.com/ads/library/?view_all_page_id=${pageId}&active_status=active&ad_type=all&country=ALL` }], 
        "count": 10,
        "scrapeAdDetails": true // Обязательно для видео
      })
    });

    const data = await res.json();
    if (!Array.isArray(data)) throw new Error("Apify failed: " + JSON.stringify(data));

    const processed = [];

    for (const ad of data.slice(0, 5)) {
      // КРИТИЧЕСКИЙ ФИКС: Ищем ID и Видео во всех возможных полях скрапера curious_coder
      const currentId = ad.id || ad.adId || ad.ad_id || Math.random().toString(36).substring(7);
      const videoSource = ad.videoUrl || ad.adCreativeVideoData?.videoUrl || ad.snapshotUrl;
      const thumb = ad.thumbnailUrl || ad.adCreativeThumbnails?.[0] || ad.snapshotUrl;
      
      let storageUrl = null;

      // Проверяем, что ссылка ведет именно на видео
      if (videoSource && (videoSource.includes('.mp4') || videoSource.includes('video'))) {
        try {
          console.log(`[LOG] Found video for ad: ${currentId}`);
          const vFetch = await fetch(videoSource);
          const buffer = await vFetch.arrayBuffer();
          const fileName = `vid_${currentId}.mp4`;

          const { error: upError } = await supabase.storage
            .from('ads_videos')
            .upload(fileName, buffer, { contentType: 'video/mp4', upsert: true });

          if (!upError) {
            storageUrl = supabase.storage.from('ads_videos').getPublicUrl(fileName).data.publicUrl;
            console.log(`[SUCCESS] Video stored: ${storageUrl}`);
          } else {
            console.error(`[STORAGE ERROR] ${upError.message}`);
          }
        } catch (err: any) {
          console.error(`[FETCH ERROR] ${err.message}`);
        }
      } else {
        console.warn(`[WARN] No valid video found for ad: ${currentId}. Field values: videoUrl=${ad.videoUrl}, adId=${ad.adId}`);
      }

      processed.push({
        id: currentId,
        thumbnail: thumb,
        video: storageUrl,
        text: ad.adCopy || ad.adCaption || "Creative content"
      });
    }

    // GEMINI ANALYSIS
    const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `Analyze visual strategy: ${JSON.stringify(processed)}` }] }]
      })
    });

    const gData = await geminiRes.json();
    const strategy = gData?.candidates?.[0]?.content?.parts?.[0]?.text || "Analyzed.";

    // SAVE TO ARCHIVE
    await supabase.from('ads_library').insert([{
      page_id: pageId, brand_name: data[0]?.pageName || "Brand", strategy_analysis: strategy, creatives: processed
    }]);

    return NextResponse.json({ brand: data[0]?.pageName, strategy, creatives: processed });

  } catch (e: any) {
    console.error("[CRITICAL]:", e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
