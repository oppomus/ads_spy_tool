import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { url } = await req.json();
    const token = process.env.APIFY_TOKEN || "";
    const geminiKey = process.env.GEMINI_API_KEY || "";

    const idMatch = url.match(/\d{10,}/); 
    const pageId = idMatch ? idMatch[0] : url;

    console.log("--- ATTEMPTING CONNECTION ---");
    console.log("Targeting ID:", pageId);

    // ВНИМАНИЕ: Исправленный адрес (убрали слово library, как на твоем скрине!)
    const apifyUrl = `https://api.apify.com/v2/acts/apify~facebook-ads-scraper/run-sync-get-dataset-items?token=${token}`;

    const res = await fetch(apifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        "searchQuery": pageId, 
        "limit": 1,
        "viewAllAds": true,
        "country": "ALL",
        "activeStatus": "active"
      })
    });

    if (!res.ok) {
      const errorBody = await res.text();
      console.error("Apify Error Body:", errorBody);
      return NextResponse.json({ error: `Apify Error: ${res.status}` }, { status: res.status });
    }

    const data = await res.json();
    
    if (!Array.isArray(data) || data.length === 0) {
      return NextResponse.json({ error: 'No ads found' }, { status: 404 });
    }

    // Анализ Gemini
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`;
    const geminiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `Analyze this ad hook and offer: "${data[0].adCopy || 'Visual ad'}"` }] }]
      })
    });
    const geminiData = await geminiRes.json();
    const aiResult = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || "Ready to scale";

    return NextResponse.json([{
      id: Date.now(),
      brand: data[0].pageName || 'Found Brand',
      hook: aiResult.trim(),
      impressions: 'High',
      status: 'WINNING'
    }]);

  } catch (e: any) {
    return NextResponse.json({ error: 'System Busy' }, { status: 500 });
  }
}
