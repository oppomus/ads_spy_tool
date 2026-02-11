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

    // Сверх-экономичный запрос: лимиты из твоего UI
    const res = await fetch(`https://api.apify.com/v2/acts/apify~facebook-ads-scraper/run-sync-get-dataset-items?token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        "startUrls": [{ "url": `https://www.facebook.com/ads/library/?view_all_page_id=${pageId}&active_status=active&ad_type=all&country=ALL` }], 
        "maxResults": 10,           // Лимит 10 объявлений
        "searchPageLimit": 1,        // Только 1-я страница
        "isDetailedAdsView": true 
      })
    });

    const data = await res.json();
    if (!Array.isArray(data)) return NextResponse.json({ error: 'Apify empty' }, { status: 404 });

    const processedCreatives = [];

    // Обработка видео: скачиваем в твой Bucket
    for (const ad of data.slice(0, 10)) {
      const fbVideoUrl = ad.adCreativeVideoData?.videoUrl;
      let finalUrl = ad.adCreativeThumbnails?.[0] || ad.adSnapshotUrl || "";
      let hasVideo = false;

      if (fbVideoUrl) {
        try {
          const vRes = await fetch(fbVideoUrl);
          const buffer = await vRes.arrayBuffer();
          const fileName = `vid-${ad.adId}.mp4`;

          // Загрузка (через service_role ключи)
          const { error: upError } = await supabase.storage
            .from('ads_videos')
            .upload(fileName, buffer, { contentType: 'video/mp4', upsert: true });

          if (!upError) {
            finalUrl = supabase.storage.from('ads_videos').getPublicUrl(fileName).data.publicUrl;
            hasVideo = true;
          }
        } catch (e) { console.error("Download fail:", ad.adId); }
      }

      processedCreatives.push({
        id: ad.adId,
        thumbnail: ad.adCreativeThumbnails?.[0] || finalUrl,
        video: hasVideo ? finalUrl : null,
        text: ad.adCopy || ad.adCaption || "Gameplay"
      });
    }

    // Полноценный разбор стратегии через Gemini
    const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `You are a Senior UA Strategist. Analyze these 10 ads for brand "${data[0].pageName}".
            Identify the top 3 visual concepts. For each provide:
            1. Concept Name (e.g., "The Fail Motivation")
            2. Visual Hook (First 2s description)
            3. Psychology (Why it forces a click)
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
  } catch (e) { return NextResponse.json({ error: 'Busy' }, { status: 500 }); }
}
