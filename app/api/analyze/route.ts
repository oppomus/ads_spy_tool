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

    // Скрапинг с защитой от лишних трат
    const apifyUrl = `https://api.apify.com/v2/acts/apify~facebook-ads-scraper/run-sync-get-dataset-items?token=${token}`;
    const fbLibraryUrl = `https://www.facebook.com/ads/library/?view_all_page_id=${pageId}&active_status=active&ad_type=all&country=ALL`;

    const res = await fetch(apifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        "startUrls": [{ "url": fbLibraryUrl }], 
        "maxResults": 10,           // СТРОГО 10 объявлений
        "searchPageLimit": 1,        // Только 1 страница скролла
        "maxRequestsPerStartUrl": 1, // Никаких лишних переходов
        "isDetailedAdsView": true 
      })
    });

    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return NextResponse.json({ error: 'No ads' }, { status: 404 });

    const processedCreatives = [];

    // Скачивание видео в Supabase Storage
    for (const ad of data) {
      const fbVideoUrl = ad.adCreativeVideoData?.videoUrl;
      let storageUrl = ad.adCreativeThumbnails?.[0] || "";

      if (fbVideoUrl && fbVideoUrl.includes('http')) {
        try {
          const videoFetch = await fetch(fbVideoUrl);
          const buffer = await videoFetch.arrayBuffer();
          const fileName = `video-${ad.adId}.mp4`;

          const { error: uploadError } = await supabase.storage
            .from('ads_videos') // Убедись, что создал Bucket в Supabase!
            .upload(fileName, buffer, { contentType: 'video/mp4', upsert: true });

          if (!uploadError) {
            const { data: publicUrl } = supabase.storage.from('ads_videos').getPublicUrl(fileName);
            storageUrl = publicUrl.publicUrl;
          }
        } catch (e) { console.error("Download fail:", e); }
      }

      processedCreatives.push({
        id: ad.adId,
        thumbnail: ad.adCreativeThumbnails?.[0],
        video: storageUrl, // Теперь это постоянная ссылка из твоего Supabase
        text: ad.adCopy || "Video ad"
      });
    }

    // Анализ визуальных концепций
    const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `Analyze the visual strategy of these 5 videos for brand "${data[0].pageName}". 
            Describe 2-3 CORE VIDEO CONCEPTS (e.g., "Pin-Pull Fail", "Emotional Storytelling"). 
            For each concept, specify the VISUAL HOOK (first 2s) and WHY IT WORKS.
            Data: ${JSON.stringify(processedCreatives)}`
          }]
        }]
      })
    });

    const geminiData = await geminiRes.json();
    const strategy = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || "Strategy teardown complete.";

    await supabase.from('ads_library').insert([{
      page_id: pageId, brand_name: data[0].pageName, strategy_analysis: strategy, creatives: processedCreatives
    }]);

    return NextResponse.json({ brand: data[0].pageName, strategy, creatives: processedCreatives });

  } catch (e: any) {
    return NextResponse.json({ error: 'System Error' }, { status: 500 });
  }
}
