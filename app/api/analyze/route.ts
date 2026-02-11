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

    const fbLibraryUrl = `https://www.facebook.com/ads/library/?view_all_page_id=${pageId}&active_status=active&ad_type=all&country=ALL`;

    // 1. СНАЙПЕРСКИЙ ЗАПРОС (Экономия 95% бюджета)
    const apifyRes = await fetch(`https://api.apify.com/v2/acts/apify~facebook-ads-scraper/run-sync-get-dataset-items?token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        "startUrls": [{ "url": fbLibraryUrl }], 
        "maxResults": 5, 
        "searchPageLimit": 1, 
        "isDetailedAdsView": true 
      })
    });

    const data = await apifyRes.json();
    if (!Array.isArray(data)) throw new Error('Apify error');

    const processed = [];

    // 2. СОХРАНЕНИЕ ВИДЕО
    for (const ad of data.slice(0, 5)) {
      let finalUrl = ad.adCreativeThumbnails?.[0] || ad.adSnapshotUrl || "";
      let videoStored = false;

      const videoLink = ad.adCreativeVideoData?.videoUrl;
      if (videoLink) {
        try {
          const vFetch = await fetch(videoLink);
          const buffer = await vFetch.arrayBuffer();
          const fileName = `video_${ad.adId}.mp4`;

          const { error: upError } = await supabase.storage
            .from('ads_videos')
            .upload(fileName, buffer, { contentType: 'video/mp4', upsert: true });

          if (!upError) {
            finalUrl = supabase.storage.from('ads_videos').getPublicUrl(fileName).data.publicUrl;
            videoStored = true;
          }
        } catch (e) { console.error("Media failed:", ad.adId); }
      }

      processed.push({
        id: ad.adId,
        thumbnail: ad.adCreativeThumbnails?.[0],
        video: videoStored ? finalUrl : null,
        text: ad.adCopy || "Ad creative"
      });
    }

    // 3. АНАЛИЗ GEMINI
    const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `Analyze visual hooks for brand "${data[0]?.pageName}". Data: ${JSON.stringify(processed)}` }] }]
      })
    });

    const gData = await geminiRes.json();
    const strategy = gData?.candidates?.[0]?.content?.parts?.[0]?.text || "Ready.";

    await supabase.from('ads_library').insert([{
      page_id: pageId, brand_name: data[0]?.pageName, strategy_analysis: strategy, creatives: processed
    }]);

    return NextResponse.json({ brand: data[0]?.pageName, strategy, creatives: processed });

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
