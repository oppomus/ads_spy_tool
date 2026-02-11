import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '');

// Лимит Vercel на выполнение функции
export const maxDuration = 60; 

export async function POST(req: Request) {
  try {
    const { url } = await req.json();
    const token = process.env.APIFY_TOKEN;
    const geminiKey = process.env.GEMINI_API_KEY;

    const idMatch = url.match(/\d{10,}/);
    const pageId = idMatch ? idMatch[0] : url;

    // ИНСТРУКЦИЯ APIFY ПРИМЕНЕНА: run-sync с параметрами в body
    // Установлен таймаут 120с, но скрапер СТОПНЕТСЯ после 10 штук
    const apifyUrl = `https://api.apify.com/v2/acts/apify~facebook-ads-scraper/run-sync-get-dataset-items?token=${token}&timeout=120`;
    
    const res = await fetch(apifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        "startUrls": [{ "url": `https://www.facebook.com/ads/library/?view_all_page_id=${pageId}&active_status=active&ad_type=all&country=ALL` }], 
        "maxResults": 10,           // СТРОГИЙ ЛИМИТ: 10 штук
        "searchPageLimit": 1,        // СТРОГИЙ ЛИМИТ: 1 страница (Экономия денег)
        "maxRequestsPerStartUrl": 1, // Не уходить с основной страницы
        "isDetailedAdsView": true    // Нужно для прямых ссылок на видео
      })
    });

    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) throw new Error("Apify timed out or zero results.");

    const processed = [];

    // СОХРАНЕНИЕ ВИДЕО В ТВОЙ SUPABASE
    for (const ad of data.slice(0, 10)) {
      const fbVideoUrl = ad.adCreativeVideoData?.videoUrl;
      let finalUrl = ad.adCreativeThumbnails?.[0] || ad.adSnapshotUrl || "";
      let isVideoSaved = false;

      if (fbVideoUrl) {
        try {
          const vFetch = await fetch(fbVideoUrl);
          const buffer = await vFetch.arrayBuffer();
          const fileName = `vid_${ad.adId}.mp4`;

          // Загрузка в Storage (service_role ключ игнорирует RLS)
          const { error: upError } = await supabase.storage
            .from('ads_videos')
            .upload(fileName, buffer, { contentType: 'video/mp4', upsert: true });

          if (!upError) {
            finalUrl = supabase.storage.from('ads_videos').getPublicUrl(fileName).data.publicUrl;
            isVideoSaved = true;
          }
        } catch (e) { console.error("Upload error:", ad.adId); }
      }

      processed.push({
        id: ad.adId,
        thumbnail: ad.adCreativeThumbnails?.[0] || finalUrl,
        video: isVideoSaved ? finalUrl : null,
        text: ad.adCopy || ad.adCaption || "Visual concept"
      });
    }

    // РАЗБОР ВИЗУАЛЬНЫХ ХУКОВ ЧЕРЕЗ GEMINI
    const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `As a UA Creative Expert, analyze these 10 ads for brand "${data[0].pageName}".
            Describe 3 visual concepts: Hook (first 2s) and the Psychology behind it.
            Data: ${JSON.stringify(processed)}`
          }]
        }]
      })
    });

    const gData = await geminiRes.json();
    const strategy = gData?.candidates?.[0]?.content?.parts?.[0]?.text || "Strategy teardown complete.";

    // Пишем в базу (Архив)
    await supabase.from('ads_library').insert([{
      page_id: pageId, brand_name: data[0].pageName, strategy_analysis: strategy, creatives: processed
    }]);

    return NextResponse.json({ brand: data[0].pageName, strategy, creatives: processed });

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
