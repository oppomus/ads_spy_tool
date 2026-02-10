import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { url } = await req.json();
    const APIFY_TOKEN = process.env.APIFY_TOKEN;
    const GEMINI_KEY = process.env.GEMINI_API_KEY;

    // Логируем проверку ключей
    console.log("Token check:", APIFY_TOKEN ? `Present (Starts with: ${APIFY_TOKEN.substring(0, 4)})` : "MISSING!");

    const idMatch = url.match(/\d{10,}/); 
    const searchQuery = idMatch ? idMatch[0] : url;
    console.log("Targeting ID:", searchQuery);

    const runResponse = await fetch(
      `https://api.apify.com/v2/acts/apify~facebook-ads-library-scraper/run-sync-get-dataset-items?token=${APIFY_TOKEN}`, 
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          "searchQuery": searchQuery, 
          "limit": 1,
          "viewAllAds": true,
          "country": "ALL",
          "activeStatus": "active"
        })
      }
    );

    console.log("Apify Response Status:", runResponse.status);
    const adsData = await runResponse.json();
    
    if (!runResponse.ok) {
      console.error("Apify Error Detail:", adsData);
      return NextResponse.json({ error: `Apify Error: ${runResponse.statusText}` }, { status: runResponse.status });
    }

    if (!Array.isArray(adsData) || adsData.length === 0) {
      return NextResponse.json({ error: 'No ads found for this ID. Try a brand name instead.' }, { status: 404 });
    }

    // Анализ Gemini (оставляем как было)
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `Analyze this ad: "${adsData[0].adCopy}"` }] }]
        })
      }
    );
    const geminiData = await geminiResponse.json();

    return NextResponse.json([{
      id: Date.now(),
      brand: adsData[0].pageName || 'Township',
      hook: geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || "Ready",
      impressions: 'High',
      status: 'WINNING'
    }]);

  } catch (e: any) {
    console.error("Critical Catch:", e.message);
    return NextResponse.json({ error: 'System Error' }, { status: 500 });
  }
}
