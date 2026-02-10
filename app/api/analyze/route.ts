import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { url } = await req.json();
    const APIFY_TOKEN = process.env.APIFY_TOKEN;
    const GEMINI_KEY = process.env.GEMINI_API_KEY;

    if (!APIFY_TOKEN || !GEMINI_KEY) {
      return NextResponse.json({ error: 'API Keys missing in Vercel settings' }, { status: 500 });
    }

    // Извлекаем только цифры (ID страницы)
    const idMatch = url.match(/\d{10,}/); 
    const searchQuery = idMatch ? idMatch[0] : url;

    console.log("--- REVERTING TO OFFICIAL SCRAPER ---");
    console.log("Targeting ID:", searchQuery);

    // ВОЗВРАЩАЕМ ОФИЦИАЛЬНЫЙ АДРЕС
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

    if (!runResponse.ok) {
      const errorText = await runResponse.text();
      console.error("Apify Error:", errorText);
      return NextResponse.json({ error: `Apify Official Scraper Error: ${runResponse.status}` }, { status: runResponse.status });
    }

    const adsData = await runResponse.json();
    
    if (!Array.isArray(adsData) || adsData.length === 0) {
      return NextResponse.json({ error: 'No ads found by official scraper' }, { status: 404 });
    }

    // Анализ Gemini
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`;
    const geminiResponse = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `Describe the hook and offer of this ad in 1 short English sentence: "${adsData[0].adCopy || 'Visual ad'}"`
          }]
        }]
      })
    });

    const geminiData = await geminiResponse.json();
    const aiResult = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || "Analysis pending";

    return NextResponse.json([{
      id: Date.now(),
      brand: adsData[0].pageName || 'Brand Found',
      hook: aiResult.trim(),
      impressions: 'Verified High',
      status: 'WINNING'
    }]);

  } catch (error: any) {
    return NextResponse.json({ error: 'Connection busy. Retry in 5s.' }, { status: 500 });
  }
}
