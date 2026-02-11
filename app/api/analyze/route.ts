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

    // ПРИМЕНЕНО ПО ИНСТРУКЦИИ: Используем 'urls' и 'count' для curious_coder
    const apifyUrl = `https://api.apify.com/v2/acts/curious_coder~facebook-ads-library-scraper/run-sync-get-dataset-items?token=${token}&timeout=55`;
    
    console.log("Starting Scraper for ID:", pageId);

    const res = await fetch(apifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        "urls": [{ "url": `https://www.facebook.com/ads/library/?view_all_page_id=${pageId}&active_status=active&ad_type=all&country=ALL` }], 
        "count": 5,                  // ЖЕСТКИЙ ЛИМИТ: 5 штук
        "limitPerSource": 5,         // Лимит на один URL
        "scrapeAdDetails": true,     // Чтобы достать видео
        "scrapePageAds.activeStatus": "active"
      })
    });

    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) throw new Error("Apify returned 0 ads or timed out.");

    const processed = [];

    // СОХРАНЕНИЕ ВИДЕО В SUPABASE
    for (const ad of data.slice(0, 5)) {
      const fbVideoUrl = ad.adCreativeVideoData?.videoUrl || ad.videoUrl;
      let storageUrl = null;

      if (fbVideoUrl) {
        try {
          const vFetch = await fetch(fbVideoUrl);
          const buffer = await vFetch.arrayBuffer();
          const fileName = `vid_${ad.adId || Math.random().toString(36).substring(7)}.mp4`;

          // Service Role Key игнорирует RLS, загрузка пройдет 100%
          const { error: upError } = await supabase.storage
            .from('ads_videos')
            .upload(fileName, buffer, { contentType: 'video/mp4', upsert: true });

          if (!upError) {
            storageUrl = supabase.storage.from('ads_videos').getPublicUrl(fileName).data.publicUrl;
          }
        } catch (e) { console.error("Upload error for ad:", ad.adId); }
      }

      processed.push({
        id: ad.adId || Math.random().toString(36).substring(7),
        thumbnail: ad.adCreativeThumbnails?.[0] || ad.thumbnailUrl || "",
        video: storageUrl,
        text: ad.adCopy || ad.adCaption || "Mobile gameplay"
      });
    }

    // ВИЗУАЛЬНЫЙ АНАЛИЗ GEMINI
    const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `Analyze visuals for brand "${data[0].pageName || 'Ads'}". 
            Break down 2-3 visual concepts: Hook (first 2s) and Psychology. 
            Data: ${JSON.stringify(processed)}`
          }]
        }]
      })
    });

    const gData = await geminiRes.json();
    const strategy = gData?.candidates?.[0]?.content?.parts?.[0]?.text || "Strategy generated.";

    // ПИШЕМ В БАЗУ (АРХИВ)
    await supabase.from('ads_library').insert([{
      page_id: pageId, 
      brand_name: data[0].pageName || "Brand", 
      strategy_analysis: strategy, 
      creatives: processed
    }]);

    return NextResponse.json({ brand: data[0].pageName, strategy, creatives: processed });

  } catch (e: any) {
    console.error("CRITICAL:", e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
