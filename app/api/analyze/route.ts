import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '');

export const maxDuration = 60; 

export async function POST(req: Request) {
  try {
    const { url } = await req.json();
    const token = process.env.APIFY_TOKEN;
    const geminiKey = process.env.GEMINI_API_KEY;

    const idMatch = url.match(/\d{10,}/);
    const pageId = idMatch ? idMatch[0] : url;

    // ПРИМЕНЕНО ПО ТВОЕЙ ИНСТРУКЦИИ: Синхронный запуск с лимитом 10
    const apifyUrl = `https://api.apify.com/v2/acts/curious_coder~facebook-ads-library-scraper/run-sync-get-dataset-items?token=${token}&timeout=50&maxChargedResults=10`;
    
    const res = await fetch(apifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        "urls": [{ "url": `https://www.facebook.com/ads/library/?view_all_page_id=${pageId}&active_status=active&ad_type=all&country=ALL` }], 
        "count": 10,
        "scrapeAdDetails": true 
      })
    });

    const data = await res.json();
    if (!Array.isArray(data)) throw new Error("Apify error: " + JSON.stringify(data));

    const processed = [];

    // ОБРАБОТКА ПО ТВОЕМУ JSON
    for (const ad of data.slice(0, 5)) {
      const adId = ad.ad_archive_id; // Точный ключ из JSON
      const card = ad.snapshot?.cards?.[0]; // Видео лежит в карточках
      const fbVideoUrl = card?.video_hd_url || card?.video_sd_url;
      const thumbUrl = card?.video_preview_image_url;
      
      let storageUrl = null;

      if (fbVideoUrl) {
        try {
          console.log(`[LOG] Скачиваю видео для объявления: ${adId}`);
          const vFetch = await fetch(fbVideoUrl);
          const buffer = await vFetch.arrayBuffer();
          const fileName = `vid_${adId}.mp4`;

          // Загрузка через service_role_key
          const { error: upError } = await supabase.storage
            .from('ads_videos')
            .upload(fileName, buffer, { contentType: 'video/mp4', upsert: true });

          if (!upError) {
            storageUrl = supabase.storage.from('ads_videos').getPublicUrl(fileName).data.publicUrl;
            console.log(`[SUCCESS] Сохранено: ${storageUrl}`);
          } else {
            console.error(`[STORAGE ERROR] ${upError.message}`);
          }
        } catch (e) { console.error("Media fetch fail:", adId); }
      }

      processed.push({
        id: adId,
        thumbnail: thumbUrl || "",
        video: storageUrl,
        text: ad.snapshot?.body?.text || "Mobile Ad"
      });
    }

    // GEMINI: Анализ визуальной стратегии
    const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `As a UA UA Expert, teardown these Township ads: ${JSON.stringify(processed)}. 
            Explain: Visual Hook, Core Concept, and Psychology.`
          }]
        }]
      })
    });

    const gData = await geminiRes.json();
    const strategy = gData?.candidates?.[0]?.content?.parts?.[0]?.text || "Ready.";

    // ПИШЕМ В БАЗУ
    await supabase.from('ads_library').insert([{
      page_id: pageId, 
      brand_name: data[0]?.snapshot?.page_name || "Township", 
      strategy_analysis: strategy, 
      creatives: processed
    }]);

    return NextResponse.json({ brand: data[0]?.snapshot?.page_name, strategy, creatives: processed });

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
