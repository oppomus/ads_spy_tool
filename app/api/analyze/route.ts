import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '');

// Vercel Pro позволяет выставить до 300 секунд
export const maxDuration = 300; 

export async function POST(req: Request) {
  try {
    const { url } = await req.json();
    const token = process.env.APIFY_TOKEN;
    const geminiKey = process.env.GEMINI_API_KEY;

    const idMatch = url.match(/\d{10,}/);
    const pageId = idMatch ? idMatch[0] : url;

    // 1. СБОР ДАННЫХ ЧЕРЕЗ APIFY (Увеличили таймаут до 60с)
    const apifyUrl = `https://api.apify.com/v2/acts/curious_coder~facebook-ads-library-scraper/run-sync-get-dataset-items?token=${token}&timeout=60&maxChargedResults=10`;
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
    if (!Array.isArray(data)) throw new Error("Apify collection failed or timed out.");

    const processed = [];
    let googleFileResource: any = null;

    // ОБРАБОТКА ПЕРВЫХ 5 ОБЪЯВЛЕНИЙ
    for (let i = 0; i < data.slice(0, 5).length; i++) {
      const ad = data[i];
      const adId = ad.ad_archive_id;
      const videoSource = ad.snapshot?.videos?.[0] || ad.snapshot?.cards?.[0];
      const fbVideoUrl = videoSource?.video_hd_url || videoSource?.video_sd_url;
      
      let storageUrl = null;
      if (fbVideoUrl) {
        try {
          const vFetch = await fetch(fbVideoUrl);
          if (vFetch.ok) {
            const buffer = await vFetch.arrayBuffer();

            // 2. ЖЕЛЕЗНАЯ ЗАГРУЗКА В GOOGLE (Resumable Upload)
            if (i === 0 && !googleFileResource) {
              console.info(`[IRON] Initializing Upload for ${(buffer.byteLength / 1024 / 1024).toFixed(2)}MB...`);
              
              // Регистрация загрузки
              const startRes = await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${geminiKey}`, {
                method: 'POST',
                headers: {
                  'X-Goog-Upload-Protocol': 'resumable',
                  'X-Goog-Upload-Command': 'start',
                  'X-Goog-Upload-Header-Content-Type': 'video/mp4',
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({ file: { display_name: `creative_${adId}` } })
              });

              const uploadUrl = startRes.headers.get('x-goog-upload-url');
              if (uploadUrl) {
                // Отправка байтов
                const finalRes = await fetch(uploadUrl, {
                  method: 'POST',
                  headers: {
                    'X-Goog-Upload-Offset': '0',
                    'X-Goog-Upload-Command': 'upload, finalize'
                  },
                  body: Buffer.from(buffer)
                });
                googleFileResource = await finalRes.json();
                console.info(`[IRON] SUCCESS: File uploaded to Google.`);
              }
            }

            // ЗАГРУЗКА В SUPABASE ДЛЯ UI
            const fileName = `vid_${adId}.mp4`;
            await supabase.storage.from('ads_videos').upload(fileName, buffer, { contentType: 'video/mp4', upsert: true });
            storageUrl = supabase.storage.from('ads_videos').getPublicUrl(fileName).data.publicUrl;
          }
        } catch (e: any) { console.error(`[MEDIA ERR] ${adId}: ${e.message}`); }
      }

      processed.push({
        id: adId,
        thumbnail: videoSource?.video_preview_image_url || "",
        video: storageUrl,
        title: ad.snapshot?.title || "Ad",
        body: ad.snapshot?.body?.text || ""
      });
    }

    // 3. ПОЛЛИНГ И ВИЗУАЛЬНЫЙ АНАЛИЗ
    let strategy = "Vision analysis unavailable.";
    if (googleFileResource?.file?.name) {
      const gFileName = googleFileResource.file.name;
      
      for (let attempt = 0; attempt < 15; attempt++) {
        await new Promise(r => setTimeout(r, 4000)); 
        const checkRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/${gFileName}?key=${geminiKey}`);
        const checkData = await checkRes.json();
        
        if (checkData.state === 'ACTIVE') {
          // ФИКС: Увеличили задержку до 15с, чтобы видео точно проиндексировалось
          console.info("[IRON] Video is ACTIVE. Waiting 15s for indexing...");
          await new Promise(r => setTimeout(r, 15000)); 
          
          const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{
                parts: [
                  { text: "You are a Senior UA Creative Strategist. WATCH this full video and provide a visual teardown. Identify: 1. CORE CONCEPT, 2. VISUAL HOOK (0-3s), 3. MECHANICS (step-by-step), 4. PSYCHOLOGY. Respond in English only with high detail." },
                  { file_data: { mime_type: "video/mp4", file_uri: googleFileResource.file.uri } }
                ]
              }],
              // ФИКС: Отключаем фильтры безопасности (BLOCK_NONE)
              safetySettings: [
                { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
              ]
            })
          });

          const gData = await geminiRes.json();
          strategy = gData.candidates?.[0]?.content?.parts?.[0]?.text || "AI returned empty result. Check Safety Filters.";
          
          if (gData.promptFeedback?.blockReason) {
             console.warn(`[AI BLOCKED] Reason: ${gData.promptFeedback.blockReason}`);
             strategy = `Analysis blocked: ${gData.promptFeedback.blockReason}`;
          }
          break;
        }
        console.info(`[IRON] Polling ${gFileName}: ${checkData.state}`);
      }
    }

    // 4. СОХРАНЕНИЕ В БАЗУ
    const brandName = data[0]?.snapshot?.page_name || "Brand Name";
    await supabase.from('ads_library').insert([{
      page_id: pageId, 
      brand_name: brandName, 
      strategy_analysis: strategy, 
      creatives: processed
    }]);

    return NextResponse.json({ brand: brandName, strategy, creatives: processed });

  } catch (e: any) {
    console.error(`[CRITICAL] ${e.message}`);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
