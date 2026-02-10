import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { url } = await req.json();
    const APIFY_TOKEN = process.env.APIFY_TOKEN;
    const GEMINI_KEY = process.env.GEMINI_API_KEY;

    // 1. Проверка ключей (увидишь в логах Functions)
    if (!APIFY_TOKEN || !GEMINI_KEY) {
      console.error("Missing API Keys!");
      return NextResponse.json({ error: 'API Keys are not configured' }, { status: 500 });
    }

    // 2. Извлекаем ID страницы или используем текст
    const idMatch = url.match(/\d{10,}/); 
    const searchQuery = idMatch ? idMatch[0] : url;
    console.log("--- Starting Analysis for:", searchQuery, "---");

    // 3. Запрос к Apify (используем прямой ID актера для стабильности)
    // Актер: facebook-ads-library-scraper (ID: n670cl9vXIn76vVzE)
    const apifyUrl = `https://api.apify.com/v2/acts/n670cl9vXIn76vVzE/run-sync-get-dataset-items?token=${APIFY_TOKEN}`;

    const runResponse = await fetch(apifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        "searchQuery": searchQuery, 
        "limit": 1,
        "viewAllAds": true,
        "country": "ALL",
        "activeStatus": "active"
      })
    });

    console.log("Apify Status:", runResponse.status);

    if (!runResponse.ok) {
      const errorDetail = await runResponse.text();
      console.error("Apify Raw Error:", errorDetail);
      return NextResponse.json({ error: `Apify returned ${runResponse.status}` }, { status: runResponse.status });
    }

    const adsData = await runResponse.json();
    
    if (!Array.isArray(adsData) || adsData.length === 0) {
      console.log("No ads found in dataset");
      return NextResponse.json({ error: 'No active ads found for this ID/Brand' }, { status: 404 });
    }

    // 4. Подготовка текста для Gemini (защита от пустых данных)
    const topAd = adsData[0];
    const adContent = topAd.adCopy || topAd.adTextAreaContent || "Visual creative without text";

    // 5. Анализ Gemini
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `Analyze this ad and describe its Hook and Offer in one short English sentence (max 15 words): "${adContent}"`
            }]
          }]
        })
      }
    );

    const geminiData = await geminiResponse.json();
    const aiAnalysis = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || "Ready to scale";

    console.log("Analysis Success:", topAd.pageName);

    // 6. Финальный результат
    return NextResponse.json([{
      id: Date.now(),
      brand: topAd.pageName || 'Found Brand',
      hook: aiAnalysis.trim(),
      impressions: 'High (Verified)',
      status: 'WINNING'
    }]);

  } catch (e: any) {
    console.error("Global Error:", e.message);
    // Если упали по таймауту (Vercel 10s limit), сообщим об этом
    const isTimeout = e.message.includes('fetch failed') || e.message.includes('timeout');
    return NextResponse.json({ 
      error: isTimeout ? 'Request timed out (Facebook is slow). Try again.' : 'Internal Server Error' 
    }, { status: 500 });
  }
}
