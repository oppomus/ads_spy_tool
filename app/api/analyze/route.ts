import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '');

export async function POST(req: Request) {
  try {
    const { url } = await req.json();
    const token = process.env.APIFY_TOKEN;
    const geminiKey = process.env.GEMINI_API_KEY;

    const idMatch = url.match(/\d{10,}/);
    const pageId = idMatch ? idMatch[0] : url;

    // 1. Снайперский запрос: maxResults 5 и searchPageLimit 1 (Экономим деньги!)
    const apifyRes = await fetch(`https://api.apify.com/v2/acts/apify~facebook-ads-scraper/run-sync-get-dataset-items?token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        "startUrls": [{ "url": `https://www.facebook.com/ads/library/?view_all_page_id=${pageId}&active_status=active&ad_type=all&country=ALL` }], 
        "maxResults": 5, 
        "searchPageLimit": 1, // ЗАПРЕТ СКОЛЛА (Обязательно!)
        "isDetailedAdsView": true
      })
    });

    const data = await apifyRes.json();
    if (!Array.isArray(data)) throw new Error('Apify failed');

    const processed = [];

    for (const ad of data.slice(0, 5)) {
      let videoUrl = null;
      const fbVideo = ad.adCreativeVideoData?.videoUrl;

      if (fbVideo) {
        try {
          const vidRes = await fetch(fbVideo);
          const buffer = await vidRes.arrayBuffer();
          const fileName = `vid_${ad.adId}.mp4`;

          // Загрузка видео (service_role ключ позволяет это делать)
          const { data: upData, error: upError } = await supabase.storage
            .from('ads_videos')
            .upload(fileName, buffer, { contentType: 'video/mp4', upsert: true });

          if (upError) {
            console.error("Upload Error:", upError.message);
          } else {
            videoUrl = supabase.storage.from('ads_videos').getPublicUrl(fileName).data.publicUrl;
          }
        } catch (e) { console.error("Video processing error:", e); }
      }

      processed.push({
        id: ad.adId,
        thumbnail: ad.adCreativeThumbnails?.[0] || ad.adSnapshotUrl,
        video: videoUrl, // Если тут null, в UI будет "NO VIDEO SAVED"
        text: ad.adCopy || ad.adCaption || "Mobile gameplay"
      });
    }

    // Анализ через Gemini
    const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `Analyze these 5 ads for "${data[0]?.pageName || 'Brand'}". 
            Break down 2-3 visual concepts: Name, Hook, Psychology. 
            Data: ${JSON.stringify(processed)}`
          }]
        }]
      })
    });

    const gData = await geminiRes.json();
    const strategy = gData?.candidates?.[0]?.content?.parts?.[0]?.text || "Ready.";

    await supabase.from('ads_library').insert([{
      page_id: pageId, brand_name: data[0]?.pageName || "Brand", strategy_analysis: strategy, creatives: processed
    }]);

    return NextResponse.json({ brand: data[0]?.pageName, strategy, creatives: processed });

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
