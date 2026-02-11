import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '');

// Vercel будет ждать, но Apify мы принудительно обрубим через 30 сек
export const maxDuration = 60; 

export async function POST(req: Request) {
  try {
    const { url } = await req.json();
    const token = process.env.APIFY_TOKEN;
    const geminiKey = process.env.GEMINI_API_KEY;

    const idMatch = url.match(/\d{10,}/);
    const pageId = idMatch ? idMatch[0] : url;

    // 1. СТРОГИЙ ТАЙМАУТ И ЛИМИТ (Экономим бабки)
    const apifyUrl = `https://api.apify.com/v2/acts/apify~facebook-ads-scraper/run-sync-get-dataset-items?token=${token}&timeout=30`;
    
    const res = await fetch(apifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        "startUrls": [{ "url": `https://www.facebook.com/ads/library/?view_all_page_id=${pageId}&active_status=active&ad_type=all&country=ALL` }], 
        "maxResults": 5, 
        "searchPageLimit": 1,
        "isDetailedAdsView": true // Включаем, чтобы достать прямые ссылки на MP4
      })
    });

    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) throw new Error("Apify timeout or empty data");

    const processed = [];

    // 2. СОХРАНЕНИЕ ВИДЕО В SUPABASE
    for (const ad of data.slice(0, 5)) {
      const fbVideoUrl = ad.adCreativeVideoData?.videoUrl;
      let finalUrl = ad.adCreativeThumbnails?.[0] || ad.adSnapshotUrl || "";
      let isVideoStored = false;

      if (fbVideoUrl) {
        try {
          const vFetch = await fetch(fbVideoUrl);
          const buffer = await vFetch.arrayBuffer();
          const fileName = `vid_${ad.adId}.mp4`;

          const { error: upError } = await supabase.storage
            .from('ads_videos')
            .upload(fileName, buffer, { contentType: 'video/mp4', upsert: true });

          if (!upError) {
            finalUrl = supabase.storage.from('ads_videos').getPublicUrl(fileName).data.publicUrl;
            isVideoStored = true;
          }
        } catch (e) { console.error("Upload fail:", ad.adId); }
      }

      processed.push({
        id: ad.adId,
        thumbnail: ad.adCreativeThumbnails?.[0],
        video: isVideoStored ? finalUrl : null,
        text: ad.adCopy || ad.adCaption || "Visual content"
      });
    }

    // 3. ГЛУБОКИЙ ВИЗУАЛЬНЫЙ АНАЛИЗ GEMINI
    const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `You are a UA Creative Expert. Analyze these 5 videos for "${data[0].pageName}".
            Break down the concepts into:
            1. CONCEPT NAME (e.g. "The Failed Logic").
            2. VISUAL HOOK: Describe what happens in the first 2 seconds.
            3. PSYCHOLOGY: Why does this visual sequence work for mobile gamers?
            Be very detailed. Data: ${JSON.stringify(processed)}`
          }]
        }]
      })
    });

    const gData = await geminiRes.json();
    const strategy = gData?.candidates?.[0]?.content?.parts?.[0]?.text || "Analysis complete.";

    await supabase.from('ads_library').insert([{
      page_id: pageId, brand_name: data[0].pageName, strategy_analysis: strategy, creatives: processed
    }]);

    return NextResponse.json({ brand: data[0].pageName, strategy, creatives: processed });

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
