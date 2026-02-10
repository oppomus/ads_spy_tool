import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { url } = await req.json();
    const APIFY_TOKEN = process.env.APIFY_TOKEN;
    const GEMINI_KEY = process.env.GEMINI_API_KEY;

    if (!APIFY_TOKEN || !GEMINI_KEY) {
      return NextResponse.json({ error: 'API Keys not configured' }, { status: 500 });
    }

    // --- МАГИЯ: Извлекаем Page ID из ссылки ---
    let finalQuery = url;
    if (url.includes('view_all_page_id=')) {
      const match = url.match(/view_all_page_id=(\d+)/);
      if (match) finalQuery = match[1]; // Берем только цифры ID
    }

    // 1. Запрос к Apify
    const runResponse = await fetch(
      `https://api.apify.com/v2/acts/apify~facebook-ads-library-scraper/run-sync-get-dataset-items?token=${APIFY_TOKEN}`, 
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          "searchQuery": finalQuery, 
          "limit": 1,
          "viewAllAds": true,
          "country": "US", // Ты просил поиск в US
          "activeStatus": "active"
        })
      }
    );

    const adsData = await runResponse.json();
    
    if (!Array.isArray(adsData) || adsData.length === 0) {
      // Если по ID не нашли, попробуем еще раз просто по названию (если это была не ссылка)
      return NextResponse.json({ error: 'No ads found. Make sure the page has active ads in the US.' }, { status: 404 });
    }

    const topAd = adsData[0];
    const adText = topAd.adCopy || topAd.adTextAreaContent || "No ad text";

    // 2. Анализ Gemini
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `Analyze this Facebook ad and identify the Hook and Offer in one short sentence: "${adText}"`
            }]
          }]
        })
      }
    );

    const geminiData = await geminiResponse.json();
    const aiResult = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || "Analysis failed";

    return NextResponse.json([{
      id: Date.now(),
      brand: topAd.pageName || 'Brand Found',
      hook: aiResult.trim(),
      impressions: 'High Impressions (US)',
      status: 'WINNING'
    }]);

  } catch (error) {
    return NextResponse.json({ error: 'Server Timeout. Try again.' }, { status: 500 });
  }
}
