import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { url } = await req.json();
    const APIFY_TOKEN = process.env.APIFY_TOKEN;
    const GEMINI_KEY = process.env.GEMINI_API_KEY;

    if (!APIFY_TOKEN || !GEMINI_KEY) {
      return NextResponse.json({ error: 'API Keys not configured in Vercel' }, { status: 500 });
    }

    const runResponse = await fetch(
      `https://api.apify.com/v2/acts/apify~facebook-ads-library-scraper/run-sync-get-dataset-items?token=${APIFY_TOKEN}`, 
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          "searchQuery": url, 
          "limit": 1,
          "viewAllAds": true 
        })
      }
    );

    const adsData = await runResponse.json();
    
    if (!Array.isArray(adsData) || adsData.length === 0) {
      return NextResponse.json({ error: 'No ads found. Check your URL.' }, { status: 404 });
    }

    const topAd = adsData[0];
    const adText = topAd.adCopy || topAd.adTextAreaContent || "No text found";

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `You are a world-class direct response marketer. 
              Analyze this Facebook ad copy and identify: 
              1. The "Hook" tactic used. 
              2. The main Offer. 
              Respond with ONE short sentence only (max 15 words) for a dashboard view.
              
              Ad Copy: "${adText}"`
            }]
          }]
        })
      }
    );

    const geminiData = await geminiResponse.json();
    const aiResult = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || "Analysis failed";

    return NextResponse.json([{
      id: Date.now(),
      brand: topAd.pageName || 'Found Brand',
      hook: aiResult.trim(),
      impressions: 'High Performance',
      status: 'WINNING'
    }]);

  } catch (error: any) {
    return NextResponse.json({ error: 'Timeout or Server Error. Try again.' }, { status: 500 });
  }
}
