import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '');

// ВАЖНО: Для Vercel Hobby лимит 10-15 сек. Поставим 60, но старайся не грузить много
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { url } = await req.json();
    const token = process.env.APIFY_TOKEN;
    const geminiKey = process.env.GEMINI_API_KEY;

    const idMatch = url.match(/\d{10,}/);
    const pageId = idMatch ? idMatch[0] : url;

    // Уменьшаем таймаут запроса к Apify, чтобы уложиться в лимиты сервера
    const apifyUrl = `https://api.apify.com/v2/acts/curious_coder~facebook-ads-library-scraper/run-sync-get-dataset-items?token=${token}&timeout=30&maxChargedResults=10`;
    
    console.log(`[LOG] Starting analysis for Page ID: ${pageId}`);

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

    // ОБРАБОТКА: Сделали поиск видео более гибким (ищем и в videos, и в cards)
    for (const ad of data.slice(0, 5)) {
      const adId = ad.ad_archive_id;
      
      // Проверяем оба возможных места нахождения видео в JSON
      const videoSource = ad.snapshot?.videos?.[0] || ad.snapshot?.cards?.[0];
      const fbVideoUrl = videoSource?.video_hd_url || videoSource?.video_sd_url;
      const thumbUrl = videoSource?.video_preview_image_url || ad.snapshot?.images?.[0]?.resized_image_url;
      
      let storageUrl = null;

      if (fbVideoUrl) {
        try {
          console.log(`[LOG] Downloading video for ad: ${adId}`);
          const vFetch = await fetch(fbVideoUrl);
          if (!vFetch.ok) throw new Error("FB Link Expired");
          
          const buffer = await vFetch.arrayBuffer();
          const fileName = `vid_${adId}.mp4`;

          const { error: upError } = await supabase.storage
            .from('ads_videos')
            .upload(fileName, buffer, { contentType: 'video/mp4', upsert: true });

          if (!upError) {
            storageUrl = supabase.storage.from('ads_videos').getPublicUrl(fileName).data.publicUrl;
            console.log(`[LOG] Uploaded to Supabase: ${storageUrl}`);
          } else {
            console.error(`[STORAGE ERROR] ${upError.message}`);
          }
        } catch (e: any) { 
          console.error(`[MEDIA FAIL] ${adId}: ${e.message}`); 
        }
      }

      processed.push({
        id: adId,
        thumbnail: thumbUrl || "",
        video: storageUrl,
        rawVideoUrl: fbVideoUrl,
        title: ad.snapshot?.title || "Mobile Ad",
        body: ad.snapshot?.body?.text || ""
      });
    }

    // GEMINI: Усилили промпт, чтобы ИИ реально анализировал КОНЦЕПТЫ
    const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `You are a Senior UA Creative Lead. Task: Conduct a visual teardown of these ads: ${JSON.stringify(processed)}. 
            
            Analyze the videos via 'rawVideoUrl' and group them into 2-3 logical "CREATIVE CONCEPTS" (e.g., "Failed Rescue", "ASMR Construction").
            
            For EACH concept, provide:
            1. VISUAL HOOK (0-3s): Explain what happens and the 'Final Hook'.
            2. MECHANICS: Step-by-step gameplay description. Is it Real or Misleading?
            3. PSYCHOLOGY: Why does this hook the player (frustration, satisfaction, etc.)?
            
            Respond ONLY in English. Use clear headers and lists. Do not use generic phrases like "Analysis ready".`
          }]
        }]
      })
    });

    const gData = await geminiRes.json();
    const strategy = gData?.candidates?.[0]?.content?.parts?.[0]?.text || "No concepts detected.";

    // Сохранение в базу
    const brandName = data[0]?.snapshot?.page_name || data[0]?.page_name || "Township Mobile";

    await supabase.from('ads_library').insert([{
      page_id: pageId, 
      brand_name: brandName, 
      strategy_analysis: strategy, 
      creatives: processed
    }]);

    return NextResponse.json({ brand: brandName, strategy, creatives: processed });

  } catch (e: any) {
    console.error(`[CRITICAL ERROR] ${e.message}`);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
