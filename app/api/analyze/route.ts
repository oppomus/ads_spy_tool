import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { url } = await req.json();
    const token = process.env.APIFY_TOKEN || "";
    const geminiKey = process.env.GEMINI_API_KEY || "";

    // ВЫВОДИМ В ЛОГИ ПРОВЕРКУ ТOКЕНА
    console.log("--- DEBUG START ---");
    console.log("Token Length:", token.length);
    if (token.length > 8) {
      console.log(`Token Check: ${token.substring(0, 4)}...${token.substring(token.length - 4)}`);
    } else {
      console.log("Token Check: TOO SHORT OR EMPTY!");
    }

    const idMatch = url.match(/\d{10,}/); 
    const pageId = idMatch ? idMatch[0] : url;

    // Прямой вызов официального скрапера
    const apifyUrl = `https://api.apify.com/v2/acts/apify~facebook-ads-library-scraper/run-sync-get-dataset-items?token=${token}`;

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

    console.log("Apify Status:", res.status);

    if (res.status === 404) {
      const errorBody = await res.text();
      console.error("Apify Body Error:", errorBody);
      return NextResponse.json({ 
        error: `404: Scraper not found. Verify your Token matches the account where you added the scraper.` 
      }, { status: 404 });
    }

    const data = await res.json();
    
    if (!Array.isArray(data) || data.length === 0) {
      return NextResponse.json({ error: 'No ads found' }, { status: 404 });
    }

    // Простой ответ без Gemini для теста связи
    return NextResponse.json([{
      id: Date.now(),
      brand: data[0].pageName || 'Found',
      hook: "Connection established! Gemini analysis next.",
      impressions: 'High',
      status: 'WINNING'
    }]);

  } catch (e: any) {
    console.error("Critical Error:", e.message);
    return NextResponse.json({ error: 'Server Error' }, { status: 500 });
  }
}
