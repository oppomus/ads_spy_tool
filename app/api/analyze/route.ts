import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '');
// Vercel Pro позволяет нам держать соединение до 5 минут
export const maxDuration = 300; 

export async function POST(req: Request) {
  try {
    const { url } = await req.json();
    const token = process.env.APIFY_TOKEN;
    const geminiKey = process.env.GEMINI_API_KEY;

    const idMatch = url.match(/\d{10,}/);
    const pageId = idMatch ? idMatch[0] : url;

    // 1. Сбор ТОП-10 креативов по показам через Apify
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
    if (!Array.isArray(data)) throw new Error("Apify failed to fetch data.");

    const processed = [];
    let googleFileResource: any = null;

    // Обработка медиа
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

            // «Железный» Resumable Upload
            if (i === 0 && !googleFileResource) {
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
                const finalRes = await fetch(uploadUrl, {
                  method: 'POST',
                  headers: { 'X-Goog-Upload-Offset': '0', 'X-Goog-Upload-Command': 'upload, finalize' },
                  body: Buffer.from(buffer)
                });
                googleFileResource = await finalRes.json();
              }
            }

            const fileName = `vid_${adId}.mp4`;
            await supabase.storage.from('ads_videos').upload(fileName, buffer, { contentType: 'video/mp4', upsert: true });
            storageUrl = supabase.storage.from('ads_videos').getPublicUrl(fileName).data.publicUrl;
          }
        } catch (e: any) { console.error(`[MEDIA ERROR] ${adId}`); }
      }

      processed.push({
        id: adId,
        thumbnail: videoSource?.video_preview_image_url || "",
        video: storageUrl,
        title: ad.snapshot?.title || "Ad",
        body: ad.snapshot?.body?.text || ""
      });
    }

    // 2. ГЛУБОКИЙ АНАЛИЗ ЧЕРЕЗ GEMINI 3 FLASH (TIER 1 POWER)
    let strategy = "Vision analysis unavailable.";
    if (googleFileResource?.file?.name) {
      const gFileName = googleFileResource.file.name;
      
      for (let attempt = 0; attempt < 15; attempt++) {
        await new Promise(r => setTimeout(r, 4000)); 
        const checkRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/${gFileName}?key=${geminiKey}`);
        const checkData = await checkRes.json();
        
        if (checkData.state === 'ACTIVE') {
          console.info("[ULTRA] Video is ACTIVE. Deep indexing (25s)...");
          await new Promise(r => setTimeout(r, 25000)); 

          // Прямой запрос к лучшей модели без циклов перебора
          const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash:generateContent?key=${geminiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{
                parts: [
                  { text: "You are a Senior UA Creative Strategist. Analyze this winning video ad and provide a highly detailed teardown in English: 1. CORE CONCEPT, 2. VISUAL HOOK (first 3s), 3. GAMEPLAY MECHANICS (describe every step), 4. PSYCHOLOGY & TRIGGERS. Be specific about visual elements." },
                  { file_data: { mime_type: "video/mp4", file_uri: googleFileResource.file.uri } }
                ]
              }],
              safetySettings: [
                { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
              ]
            })
          });

          const gData = await geminiRes.json();
          strategy = gData.candidates?.[0]?.content?.parts?.[0]?.text || "AI failed to generate analysis.";
          console.info("[ULTRA SUCCESS] Analysis complete using Gemini 3 Flash.");
          break;
        }
      }
    }

    // 3. Сохранение в базу
    const brandName = data[0]?.snapshot?.page_name || "Brand";
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
