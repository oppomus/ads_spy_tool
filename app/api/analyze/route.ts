import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || '', 
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

// Увеличенный лимит выполнения для Vercel Pro (5 минут)
export const maxDuration = 300; 

export async function POST(req: Request) {
  try {
    const { url } = await req.json();
    const token = process.env.APIFY_TOKEN;
    const geminiKey = process.env.GEMINI_API_KEY;

    // Извлекаем Page ID из ссылки
    const idMatch = url.match(/\d{10,}/);
    const pageId = idMatch ? idMatch[0] : url;

    // 1. СКРЕПИНГ: Топ-10 объявлений по количеству показов
    console.info(`[START] Scraping top 10 ads for Page ID: ${pageId}`);
    const apifyUrl = `https://api.apify.com/v2/acts/curious_coder~facebook-ads-library-scraper/run-sync-get-dataset-items?token=${token}&timeout=60&maxChargedResults=10`;
    
    const res = await fetch(apifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        "urls": [{ 
          "url": `https://www.facebook.com/ads/library/?view_all_page_id=${pageId}&active_status=active&ad_type=all&country=ALL&sort_data[direction]=desc&sort_data[mode]=total_impressions` 
        }], 
        "count": 10,
        "scrapeAdDetails": true 
      })
    });

    const data = await res.json();
    if (!Array.isArray(data)) throw new Error("Apify data extraction failed.");

    const processed = [];
    let googleFileResource: any = null;

    // 2. ОБРАБОТКА МЕДИА: Сохраняем видео в Supabase и готовим одно для AI
    for (let i = 0; i < data.slice(0, 10).length; i++) {
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

            // Загружаем ПЕРВОЕ видео (самое охватное) в Google для анализа
            if (i === 0 && !googleFileResource) {
              console.info(`[MEDIA] Uploading video ${adId} to Google AI Cloud...`);
              const startRes = await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${geminiKey}`, {
                method: 'POST',
                headers: {
                  'X-Goog-Upload-Protocol': 'resumable',
                  'X-Goog-Upload-Command': 'start',
                  'X-Goog-Upload-Header-Content-Type': 'video/mp4',
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({ file: { display_name: `analysis_target_${adId}` } })
              });

              const uploadUrl = startRes.headers.get('x-goog-upload-url');
              if (uploadUrl) {
                const finalRes = await fetch(uploadUrl, {
                  method: 'POST',
                  headers: { 'X-Goog-Upload-Offset': '0', 'X-Goog-Upload-Command': 'upload, finalize' },
                  body: Buffer.from(buffer)
                });
                googleFileResource = await finalRes.json();
              }
            }

            // Загружаем видео в Supabase Storage для отображения на сайте
            const fileName = `vid_${adId}.mp4`;
            await supabase.storage.from('ads_videos').upload(fileName, buffer, { contentType: 'video/mp4', upsert: true });
            storageUrl = supabase.storage.from('ads_videos').getPublicUrl(fileName).data.publicUrl;
          }
        } catch (e: any) { console.error(`[MEDIA ERR] Ad ${adId}: ${e.message}`); }
      }

      processed.push({
        id: adId,
        thumbnail: videoSource?.video_preview_image_url || "",
        video: storageUrl,
        title: ad.snapshot?.title || "Ad Creative",
        body: ad.snapshot?.body?.text || ""
      });
    }

    // 3. АНАЛИЗ КРЕАТИВА (Gemini 1.5 Pro)
    let strategy = "Vision analysis failed.";
    if (googleFileResource?.file?.name) {
      const gFileName = googleFileResource.file.name;
      
      // Поллинг готовности видеофайла
      for (let attempt = 0; attempt < 12; attempt++) {
        await new Promise(r => setTimeout(r, 5000)); 
        const checkRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/${gFileName}?key=${geminiKey}`);
        const checkData = await checkRes.json();
        
        console.info(`[POLLING] Attempt ${attempt + 1}: State is ${checkData.state}`);

        if (checkData.state === 'ACTIVE') {
          // Пауза 5с для финализации индексации перед анализом
          await new Promise(r => setTimeout(r, 5000));
          console.info("[AI] Sending analysis request to Gemini 1.5 Pro...");

          const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${geminiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{
                parts: [
                  { text: "Detailed UA Strategy Analysis. Break down: 1. CORE CONCEPT, 2. VISUAL HOOK (0-3s), 3. GAMEPLAY MECHANICS, 4. PSYCHOLOGICAL TRIGGERS. Output in English." },
                  { file_data: { mime_type: "video/mp4", file_uri: googleFileResource.file.uri } }
                ]
              }],
              // ОТКЛЮЧЕНИЕ ФИЛЬТРОВ: Чтобы не блокировать игровые видео
              safetySettings: [
                { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
              ]
            })
          });

          const gData = await geminiRes.json();

          if (gData.candidates?.[0]?.content?.parts?.[0]?.text) {
            strategy = gData.candidates[0].content.parts[0].text;
            console.info("[AI SUCCESS] Strategy generated.");
            break;
          } else {
            console.error("[GEMINI ERROR DETAILS]", JSON.stringify(gData));
            strategy = `Analysis error: ${gData.candidates?.[0]?.finishReason || "Check Safety Filters"}`;
          }
          break;
        }
      }
    }

    // 4. СОХРАНЕНИЕ: Записываем всё в базу Supabase
    const brandName = data[0]?.snapshot?.page_name || "Unknown Brand";
    await supabase.from('ads_library').insert([{
      page_id: pageId, 
      brand_name: brandName, 
      strategy_analysis: strategy, 
      creatives: processed
    }]);

    console.info(`[FINISH] Successfully processed ${processed.length} ads for ${brandName}`);
    return NextResponse.json({ brand: brandName, strategy, creatives: processed });

  } catch (e: any) {
    console.error(`[CRITICAL ERROR] ${e.message}`);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
