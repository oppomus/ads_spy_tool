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

    const apifyUrl = `https://api.apify.com/v2/acts/apify~facebook-ads-scraper/run-sync-get-dataset-items?token=${token}`;
    const fbLibraryUrl = `https://www.facebook.com/ads/library/?view_all_page_id=${pageId}&active_status=active&ad_type=all&country=ALL`;

    // 1. Скрапим ТОП-10 видео (Экономим баланс!)
    const res = await fetch(apifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        "startUrls": [{ "url": fbLibraryUrl }], 
        "limit": 10, 
        "maxRequestsPerStartUrl": 1,
        "isDetailedAdsView": true 
      })
    });

    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return NextResponse.json({ error: 'No ads' }, { status: 404 });

    const combinedTexts = data.map((ad, i) => `[Ad ${i+1}]: ${ad.adCopy}`).join("\n\n");

    // 2. Глубокий разбор ВИДЕО-КОНЦЕПЦИЙ БРЕНДА
    const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `Analyze the top 10 VIDEO ads for brand "${data[0].pageName}".
            Identify 2-3 core "VIDEO CONCEPTS" being scaled (e.g., "Fail Motivation", "ASMR Cleanup").
            For each concept: Name, Visual Hook (first 3s), Core Mechanic, and Psychology.
            Provide a Brand Strategy Teardown at the end. Data: "${combinedTexts}"`
          }]
        }]
      })
    });

    const geminiData = await geminiRes.json();
    const strategy = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || "Analysis complete.";

    const creatives = data.map(ad => ({
      id: ad.adId,
      thumbnail: ad.adCreativeThumbnails?.[0] || ad.adSnapshotUrl,
      link: ad.adSnapshotUrl,
      isVideo: true 
    }));

    // 3. Сохранение в Supabase
    await supabase.from('ads_library').insert([{
      page_id: pageId, brand_name: data[0].pageName, strategy_analysis: strategy, creatives: creatives
    }]);

    return NextResponse.json({ brand: data[0].pageName, strategy, creatives });
  } catch (e: any) {
    return NextResponse.json({ error: 'Server Error' }, { status: 500 });
  }
}
