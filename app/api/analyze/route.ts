import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '');

export const maxDuration = 60; // Максимум для Hobby

export async function POST(req: Request) {
  try {
    const { url } = await req.json();
    const token = process.env.APIFY_TOKEN;
    const geminiKey = process.env.GEMINI_API_KEY;

    const idMatch = url.match(/\d{10,}/);
    const pageId = idMatch ? idMatch[0] : url;

    // 1. ПРИНУДИТЕЛЬНЫЙ ЛИМИТ: Запускаем задачу с жесткими параметрами
    // Мы используем run, а не run-sync, чтобы не зависеть от тормозов Apify
    const runRes = await fetch(`https://api.apify.com/v2/acts/apify~facebook-ads-scraper/runs?token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        "startUrls": [{ "url": `https://www.facebook.com/ads/library/?view_all_page_id=${pageId}&active_status=active&ad_type=all&country=ALL` }], 
        "maxResults": 10,           // СТРОГО 10 штук
        "searchPageLimit": 1,        // ТОЛЬКО 1 СТРАНИЦА
        "isDetailedAdsView": true 
      })
    });

    const runData = await runRes.json();
    const runId = runData.data.id;

    // 2. ЖДЕМ 20 СЕКУНД И ЗАБИРАЕМ ЧТО ЕСТЬ
    await new Promise(resolve => setTimeout(resolve, 20000));

    const itemsRes = await fetch(`https://api.apify.com/v2/acts/apify~facebook-ads-scraper/runs/${runId}/dataset/items?token=${token}`);
    const data = await itemsRes.json();

    if (!Array.isArray(data) || data.length === 0) throw new Error("Apify failed to collect data in 20s.");

    const processed = [];

    // 3. БЫСТРАЯ ЗАГРУЗКА ВИДЕО (Берем только первые 5 для надежности)
    for (const ad of data.slice(0, 5)) {
      const fbVideo = ad.adCreativeVideoData?.videoUrl;
      let storageUrl = null;

      if (fbVideo) {
        try {
          const vRes = await fetch(fbVideo);
          const buffer = await vRes.arrayBuffer();
          const fileName = `vid_${ad.adId}.mp4`;

          // Загрузка через service_role_key (игнорирует политики INSERT)
          const { error: upError } = await supabase.storage
            .from('ads_videos')
            .upload(fileName, buffer, { contentType: 'video/mp4', upsert: true });

          if (!upError) {
            storageUrl = supabase.storage.from('ads_videos').getPublicUrl(fileName).data.publicUrl;
          }
        } catch (e) { console.error("Upload error:", ad.adId); }
      }

      processed.push({
        id: ad.adId,
        thumbnail: ad.adCreativeThumbnails?.[0] || ad.adSnapshotUrl,
        video: storageUrl, // Будет null, если не успели сохранить
        text: ad.adCopy || "Ad creative"
      });
    }

    // 4. ГЛУБОКИЙ АНАЛИЗ GEMINI
    const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `You are a UA Expert. Analyze these 5 videos for brand "${data[0].pageName}".
            Break down 3 visual concepts: Hook (first 2s) and Psychology.
            Data: ${JSON.stringify(processed)}`
          }]
        }]
      })
    });

    const gData = await geminiRes.json();
    const strategy = gData?.candidates?.[0]?.content?.parts?.[0]?.text || "Strategy ready.";

    // 5. ПИШЕМ В БАЗУ
    await supabase.from('ads_library').insert([{
      page_id: pageId, brand_name: data[0].pageName, strategy_analysis: strategy, creatives: processed
    }]);

    return NextResponse.json({ brand: data[0].pageName, strategy, creatives: processed });

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
