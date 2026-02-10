import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { url } = await req.json();
    const APIFY_TOKEN = process.env.APIFY_TOKEN;
    const GEMINI_KEY = process.env.GEMINI_API_KEY;

    // 1. Проверка наличия ключей в Vercel
    if (!APIFY_TOKEN || !GEMINI_KEY) {
      console.error("CRITICAL: API Keys are missing in Environment Variables!");
      return NextResponse.json({ error: 'Server configuration error (API Keys)' }, { status: 500 });
    }

    // 2. Извлекаем ID из ссылки или используем введённый текст
    const idMatch = url.match(/\d{10,}/); 
    const searchQuery = idMatch ? idMatch[0] : url;

    console.log("--- NEW ANALYSIS REQUEST ---");
    console.log("Query:", searchQuery);
    console.log("Token starts with:", APIFY_TOKEN.substring(0, 4));

    // 3. Запрос к Apify (используем официальное имя скрапера)
    const apifyUrl = `https://api.apify.com/v2/acts/apify~facebook-ads-library-scraper/run-sync-get-dataset-items?token=${APIFY_TOKEN}`;

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

    console.log("Apify Response Status:", runResponse.status);

    if (!runResponse.ok) {
      const errorMsg = await runResponse.text();
      console.error("Apify Error Response:", errorMsg);
      return NextResponse.json({ error: `Apify Error: ${runResponse.status}` }, { status: runResponse.status });
    }

    const adsData = await runResponse.json();
    
    if (!Array.isArray(adsData) || adsData.length === 0) {
      console.log("Result: No ads found for this query.");
      return NextResponse.json({ error: 'No active ads found for this ID' }, { status: 404 });
    }

    // 4. Собираем текст объявления (проверяем разные поля, где он может быть)
    const ad = adsData[0];
    const rawText = ad.adCopy || ad.adTextAreaContent || ad.pageName || "Visual Creative";

    // 5. Отправляем текст в Gemini для маркетингового анализа
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`;
    
    const geminiResponse = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `You are a pro ad buyer. Analyze this ad text and summarize the 'Hook' and 'Main Offer' in one short punchy sentence in English: "${rawText}"`
          }]
        }]
      })
    });

    const geminiData = await geminiResponse.json();
    const aiResult = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || "Ready to scale";

    console.log("Success! Analysis for:", ad.pageName);

    // 6. Возвращаем данные в таблицу
    return NextResponse.json([{
      id: Date.now(),
      brand: ad.pageName || 'Found Brand',
      hook: aiResult.trim(),
      impressions: 'High Volume',
      status: 'WINNING'
    }]);

  } catch (error: any) {
    console.error("Global Server Error:", error.message);
    return NextResponse.json({ error: 'Server is busy, try again in 10s' }, { status: 500 });
  }
}
