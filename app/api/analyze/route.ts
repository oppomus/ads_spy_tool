import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { url } = await req.json();
    const token = process.env.APIFY_TOKEN || "";
    const geminiKey = process.env.GEMINI_API_KEY || "";

    const idMatch = url.match(/\d{10,}/);
    const pageId = idMatch ? idMatch[0] : url;

    // Официальный адрес скрапера из твоего списка
    const apifyUrl = `https://api.apify.com/v2/acts/apify~facebook-ads-scraper/run-sync-get-dataset-items?token=${token}`;
    const fbLibraryUrl = `https://www.facebook.com/ads/library/?view_all_page_id=${pageId}&active_status=active&ad_type=all&country=ALL`;

    // Запрос с жесткими лимитами для скорости и экономии
    const res = await fetch(apifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        "startUrls": [{ "url": fbLibraryUrl }], 
        "limit": 1,
        "maxRequestsPerStartUrl": 1,
        "isDetailedAdsView": false // Экономим время и $
      })
    });

    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) {
      return NextResponse.json({ error: 'No ads' }, { status: 404 });
    }

    const ad = data[0];

    // Улучшенный промпт для Gemini, чтобы избежать "Ready to scale"
    const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `Analyze this ad as a growth hacker. Ad text: "${ad.adCopy || 'Visual only'}". 
            Identify the core HOOK and the OFFER. Format: Hook: [text] | Offer: [text]. Max 20 words.`
          }]
        }]
      })
    });

    const geminiData = await geminiRes.json();
    const aiAnalysis = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || "Creative-centric approach";

    return NextResponse.json({
      id: Date.now(),
      brand: ad.pageName || 'Brand',
      hook: aiAnalysis.trim(),
      // Пытаемся достать превью картинки
      image: ad.adCreativeThumbnails?.[0] || ad.adSnapshotUrl, 
      status: 'ACTIVE',
      adUrl: ad.adSnapshotUrl
    });

  } catch (e: any) {
    return NextResponse.json({ error: 'Retry' }, { status: 500 });
  }
}
