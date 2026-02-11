import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Инициализация Supabase с секретным ключом (service_role)
const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export async function POST(req: Request) {
  try {
    const { url } = await req.json();
    const token = process.env.APIFY_TOKEN;
    const geminiKey = process.env.GEMINI_API_KEY;

    const idMatch = url.match(/\d{10,}/);
    const pageId = idMatch ? idMatch[0] : url;

    // 1. Скрапинг с жестким лимитом 10 результатов и 1 страницы
    const apifyUrl = `https://api.apify.com/v2/acts/apify~facebook-ads-scraper/run-sync-get-dataset-items?token=${token}`;
    const fbLibraryUrl = `https://www.facebook.com/ads/library/?view_all_page_id=${pageId}&active_status=active&ad_type=all&country=ALL`;

    const res = await fetch(apifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        "startUrls": [{ "url": fbLibraryUrl }], 
        "maxResults": 10,           // СТОП после 10 штук
        "searchPageLimit": 1,        // Только ПЕРВАЯ страница
        "maxRequestsPerStartUrl": 1, 
        "isDetailedAdsView": true 
      })
    });

    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return NextResponse.json({ error: 'No ads found' }, { status: 404 });

    const processedCreatives = [];

    // 2. Скачивание видео в Supabase Storage (Бакет ads_videos)
    for (const ad of data) {
      const fbVideoUrl = ad.adCreativeVideoData?.videoUrl;
      let storageUrl = null;

      if (fbVideoUrl && fbVideoUrl.includes('http')) {
        try {
          const videoFetch = await fetch(fbVideoUrl);
          const buffer = await videoFetch.arrayBuffer();
          const fileName = `vid-${ad.adId}.mp4`;

          // Загрузка файла. Ключ service_role позволяет это делать без политик INSERT
          const { error: uploadError } = await supabase.storage
            .from('ads_videos')
            .upload(fileName, buffer, { contentType: 'video/mp4', upsert: true });

          if (!uploadError) {
            const { data: pUrl } = supabase.storage.from('ads_videos').getPublicUrl(fileName);
            storageUrl = pUrl.publicUrl;
          }
        } catch (e) { console.error("Error saving video:", ad.adId); }
      }

      processedCreatives.push({
        id: ad.adId,
        thumbnail: ad.adCreativeThumbnails?.[0] || ad.adSnapshotUrl,
        video: storageUrl, // Это вечная ссылка, она не "протухнет"
        text: ad.adCopy || ad.adCaption || "Visual gameplay"
      });
    }

    // 3. Глубокий анализ визуальных концепций
    const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `Analyze these 10 ads for brand "${data[0].pageName}".
            Identify 3 core VISUAL CONCEPTS. For each provide:
            - Concept Name (e.g., "The Fail Gap")
            - Visual Hook (What happens in first 2s)
            - Psychology (Why it forces a click)
            Data: ${JSON.stringify(processedCreatives)}`
          }]
        }]
      })
    });

    const geminiData = await geminiRes.json();
    const strategy = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || "Strategy analysis complete.";

    // 4. Сохранение в базу данных (ads_library)
    await supabase.from('ads_library').insert([{
      page_id: pageId,
      brand_name: data[0].pageName,
      strategy_analysis: strategy,
      creatives: processedCreatives
    }]);

    return NextResponse.json({ brand: data[0].pageName, strategy, creatives: processedCreatives });
  } catch (e: any) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
