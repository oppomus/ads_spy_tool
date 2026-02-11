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

    // 1. Скрапим 5 топовых видео (для глубокого анализа лучше меньше, но качественнее)
    const apifyUrl = `https://api.apify.com/v2/acts/apify~facebook-ads-scraper/run-sync-get-dataset-items?token=${token}`;
    const res = await fetch(apifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        "startUrls": [{ "url": `https://www.facebook.com/ads/library/?view_all_page_id=${pageId}&active_status=active&ad_type=all&country=ALL` }], 
        "maxResults": 5, 
        "isDetailedAdsView": true 
      })
    });

    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return NextResponse.json({ error: 'No ads' }, { status: 404 });

    const processedCreatives = [];

    // 2. ЦИКЛ ОБРАБОТКИ ВИДЕО
    for (const ad of data) {
      const videoUrl = ad.adCreativeVideoData?.videoUrl || ad.adSnapshotUrl;
      let finalMediaUrl = ad.adCreativeThumbnails?.[0] || "";

      if (videoUrl && videoUrl.includes('http')) {
        try {
          // СКАЧИВАЕМ ВИДЕО В SUPABASE, ЧТОБЫ ОНО НЕ СГОРЕЛО
          const videoFetch = await fetch(videoUrl);
          const videoBlob = await videoFetch.blob();
          const fileName = `${ad.adId}.mp4`;

          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('ads_videos')
            .upload(fileName, videoBlob, { contentType: 'video/mp4', upsert: true });

          if (!uploadError) {
            const { data: publicUrl } = supabase.storage.from('ads_videos').getPublicUrl(fileName);
            finalMediaUrl = publicUrl.publicUrl;
          }
        } catch (e) { console.error("Video Download Error:", e); }
      }

      processedCreatives.push({
        id: ad.adId,
        thumbnail: ad.adCreativeThumbnails?.[0] || finalMediaUrl,
        video: finalMediaUrl,
        text: ad.adCopy || "No text"
      });
    }

    // 3. ГИПЕР-АНАЛИЗ ВИЗУАЛА ЧЕРЕЗ GEMINI
    const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `You are a Visual Ad Analyst. I am sending you descriptions of 5 videos for brand "${data[0].pageName}".
            Based on the creative trends in this niche, describe the VISUAL STRATEGY:
            1. VISUAL HOOK: What visual action happens in the first 2 seconds to grab attention?
            2. GAMEPLAY MECHANIC: What puzzle or scene is shown? (e.g., pulling pins, choosing wrong tools).
            3. EMOTIONAL ARC: How does the video make the viewer feel?
            4. WINNING CONCEPT: Why is this specific visual sequence scaling?
            
            Focus on VISUALS, not just text. Data: ${JSON.stringify(processedCreatives)}`
          }]
        }]
      })
    });

    const geminiData = await geminiRes.json();
    const strategy = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || "Video analysis failed.";

    // 4. СОХРАНЯЕМ ВСЁ В БАЗУ
    await supabase.from('ads_library').insert([{
      page_id: pageId,
      brand_name: data[0].pageName,
      strategy_analysis: strategy,
      creatives: processedCreatives
    }]);

    return NextResponse.json({ brand: data[0].pageName, strategy, creatives: processedCreatives });

  } catch (e: any) {
    return NextResponse.json({ error: 'System Error' }, { status: 500 });
  }
}
