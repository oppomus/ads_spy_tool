import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { url } = await req.json();
    const APIFY_TOKEN = process.env.APIFY_TOKEN;
    const GEMINI_KEY = process.env.GEMINI_API_KEY;

    if (!APIFY_TOKEN || !GEMINI_KEY) {
      return NextResponse.json({ error: 'API Keys missing' }, { status: 500 });
    }

    const idMatch = url.match(/\d{10,}/); 
    const searchQuery = idMatch ? idMatch[0] : url;

    // ВНИМАНИЕ: Поменял адрес на curious.coder (как у тебя на скриншоте!)
    const apifyUrl = `https://api.apify.com/v2/acts/curious.coder~facebook-ads-library-scraper/run-sync-get-dataset-items?token=${APIFY_TOKEN}`;

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
      return NextResponse.json({ error: `Apify Error: ${runResponse.status}` }, { status: runResponse.status });
    }

    const adsData = await runResponse.json();
    
    if (!Array.isArray(adsData) || adsData.length === 0) {
      return NextResponse.json({ error: 'No ads found' }, { status: 404 });
    }

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`;
    const geminiResponse = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `Analyze ad: "${adsData[0].adCopy || 'Visual'}"`
          }]
        }]
      })
    });

    const geminiData = await geminiResponse.json();
    const aiResult = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || "Ready";

    return NextResponse.json([{
      id: Date.now(),
      brand: adsData[0].pageName || 'Found Brand',
      hook: aiResult.trim(),
      impressions: 'High Volume',
      status: 'WINNING'
    }]);

  } catch (error: any) {
    return NextResponse.json({ error: 'Server Busy' }, { status: 500 });
  }
}
