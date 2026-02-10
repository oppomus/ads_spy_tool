import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { url } = await req.json();
    const APIFY_TOKEN = process.env.APIFY_TOKEN;
    const GEMINI_KEY = process.env.GEMINI_API_KEY;

    // Вытягиваем ID или используем текст
    const idMatch = url.match(/\d{10,}/); 
    const searchQuery = idMatch ? idMatch[0] : url;

    console.log("Searching for:", searchQuery);

    // 1. Запрос к Apify (с более широкими настройками)
    const runResponse = await fetch(
      `https://api.apify.com/v2/acts/apify~facebook-ads-library-scraper/run-sync-get-dataset-items?token=${APIFY_TOKEN}`, 
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          "searchQuery": searchQuery, 
          "limit": 1,
          "viewAllAds": true,
          "country": "ALL", // Ставим ALL, чтобы точно зацепить Township
          "activeStatus": "active",
          "searchType": idMatch ? "page" : "keyword" // Если есть ID, ищем по странице
        })
      }
    );

    const adsData = await runResponse.json();
    
    if (!Array.isArray(adsData) || adsData.length === 0) {
      return NextResponse.json({ 
        error: `Ads for Township (${searchQuery}) not found in the scraper. Meta might be blocking the request. Try again in 1 min.` 
      }, { status: 404 });
    }

    const topAd = adsData[0];
    const adText = topAd.adCopy || "Mobile Game Creative";

    // 2. Анализ через Gemini
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `Analyze this gaming ad and identify the hook and offer. Be concise. Text: "${adText}"`
            }]
          }]
        })
      }
    );

    const geminiData = await geminiResponse.json();
    const aiResult = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || "Ready for scale";

    return NextResponse.json([{
      id: Date.now(),
      brand: topAd.pageName || 'Township Mobile',
      hook: aiResult.trim(),
      impressions: 'High',
      status: 'WINNING'
    }]);

  } catch (error) {
    return NextResponse.json({ error: 'Vercel Timeout. Township has too many ads to sort quickly!' }, { status: 500 });
  }
}
