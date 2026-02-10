import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { url } = await req.json();
    const token = process.env.APIFY_TOKEN || "";
    const geminiKey = process.env.GEMINI_API_KEY || "";

    // 1. Определяем, что пришло: ссылка или ID
    let finalUrl = "";
    const idMatch = url.match(/\d{10,}/); // Ищем длинную последовательность цифр

    if (url.includes('facebook.com/ads/library')) {
      // Если это уже ссылка на библиотеку — берем её
      finalUrl = url;
    } else if (idMatch) {
      // Если это просто ID (как твой Township) — собираем ссылку сами
      finalUrl = `https://www.facebook.com/ads/library/?view_all_page_id=${idMatch[0]}&active_status=active&ad_type=all&country=ALL`;
    } else {
      // Если это просто название бренда — тоже пытаемся сделать ссылку через поиск (но лучше ID)
      finalUrl = `https://www.facebook.com/ads/library/?q=${encodeURIComponent(url)}&active_status=active&ad_type=all&country=ALL`;
    }

    console.log("--- STARTING ANALYSIS ---");
    console.log("Input received:", url);
    console.log("Final URL for Scraper:", finalUrl);

    // Адрес скрапера, который мы подтвердили в твоем аккаунте
    const apifyUrl = `https://api.apify.com/v2/acts/apify~facebook-ads-scraper/run-sync-get-dataset-items?token=${token}`;

    // 2. Запрос к Apify с обязательным полем startUrls
    const res = await fetch(apifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        "startUrls": [{ "url": finalUrl }], 
        "limit": 1,
        "maxRequestsPerStartUrl": 1
      })
    });

    if (!res.ok) {
      const errorBody = await res.text();
      console.error("Apify Error Body:", errorBody);
      return NextResponse.json({ error: `Apify Error: ${res.status}` }, { status: res.status });
    }

    const data = await res.json();
    
    if (!Array.isArray(data) || data.length === 0) {
      return NextResponse.json({ error: 'No ads found. Check if the page has active ads.' }, { status: 404 });
    }

    const ad = data[0];

    // 3. Анализ через Gemini
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`;
    const geminiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `Analyze this Facebook ad text. Give me a short summary of the 'Hook' and the 'Offer' in English (max 20 words): "${ad.adCopy || 'Visual ad content'}"`
          }]
        }]
      })
    });

    const geminiData = await geminiRes.json();
    const aiResult = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || "Ready to scale";

    return NextResponse.json([{
      id: Date.now(),
      brand: ad.pageName || 'Found Page',
      hook: aiResult.trim(),
      impressions: 'High',
      status: 'WINNING'
    }]);

  } catch (e: any) {
    console.error("Global Error:", e.message);
    return NextResponse.json({ error: 'Server error, try again' }, { status: 500 });
  }
}
