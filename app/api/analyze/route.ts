import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '');

// Лимит Vercel Pro
export const maxDuration = 300; 

export async function POST(req: Request) {
  try {
    const { url } = await req.json();
    const token = process.env.APIFY_TOKEN;
    const geminiKey = process.env.GEMINI_API_KEY;

    const idMatch = url.match(/\d{10,}/);
    const pageId = idMatch ? idMatch[0] : url;

    // Скрапинг
    const apifyUrl = `https://api.apify.com/v2/acts/curious_coder~facebook-ads-library-scraper/run-sync-get-dataset-items?token=${token}&timeout=30&maxChargedResults=10`;
    const res = await fetch(apifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ "urls": [{ "url": `https://www.facebook.com/ads/library/?view_all_page_id=${pageId}&active_status=active&ad_type=all&country=ALL` }], "count": 10, "scrapeAdDetails": true })
    });

    const data = await res.json();
    if (!Array.isArray(data)) throw new Error("Apify failed");

    const processed = [];
    let googleFileResource: any = null;

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
            const arrayBuffer = await vFetch.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);

            // --- ШАГ 1: MULTIPART UPLOAD В GOOGLE (Для обхода ошибки 400) ---
            if (i === 0 && !googleFileResource) {
              console.info(`[PRO] Attempting Multipart Upload: ${(buffer.length / 1024 / 1024).toFixed(2)}MB`);
              
              const boundary = 'spy_pro_boundary';
              const metadata = JSON.stringify({ file: { display_name: `creative_${adId}` } });
              
              // Собираем пакет данных вручную для гарантированной стабильности
              const multipartBody = Buffer.concat([
                Buffer.from(`--${boundary}\r\nContent-Type: application/json\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: video/mp4\r\n\r\n`),
                buffer,
                Buffer.from(`\r\n--${boundary}--`)
              ]);

              const uploadRes = await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${geminiKey}`, {
                method: 'POST',
                headers: {
                  'X-Goog-Upload-Protocol': 'multipart',
                  'Content-Type': `multipart/related; boundary=${boundary}`
                },
                body: multipartBody
              });

              if (uploadRes.ok) {
                googleFileResource = await uploadRes.json();
                console.info(`[PRO] Google Upload SUCCESS: ${googleFileResource.file?.name}`);
              } else {
                const errText = await uploadRes.text();
                console.error(`[PRO] Google Upload CRITICAL FAIL: ${uploadRes.status} - ${errText}`);
              }
            }

            // --- ШАГ 2: В ТВОЙ SUPABASE ---
            const fileName = `vid_${adId}.mp4`;
            await supabase.storage.from('ads_videos').upload(fileName, buffer, { contentType: 'video/mp4', upsert: true });
            storageUrl = supabase.storage.from('ads_videos').getPublicUrl(fileName).data.publicUrl;
          }
        } catch (e: any) { console.error(`[MEDIA ERROR] ${adId}: ${e.message}`); }
      }

      processed.push({
        id: adId,
        thumbnail: videoSource?.video_preview_image_url || "",
        video: storageUrl,
        title: ad.snapshot?.title || "Ad",
        body: ad.snapshot?.body?.text || ""
      });
    }

    // --- ШАГ 3: ПОЛЛИНГ И ВИЗУАЛЬНЫЙ АНАЛИЗ ---
    let strategy = "Vision analysis could not be started (Upload Failed).";

    if (googleFileResource?.file?.name) {
      const gFileName = googleFileResource.file.name;
      
      // Ждем готовности (Polling)
      for (let attempt = 0; attempt < 12; attempt++) {
        await new Promise(r => setTimeout(r, 5000)); // На Pro тарифе можем ждать долго
        const checkRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/${gFileName}?key=${geminiKey}`);
        const checkData = await checkRes.json();
        
        if (checkData.state === 'ACTIVE') {
          console.info("[PRO] Video is ACTIVE. Requesting Teardown...");
          
          const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{
                parts: [
                  { text: "You are a Senior UA Creative Strategist. WATCH this full video and provide a visual teardown of: 1. CORE CONCEPT, 2. VISUAL HOOK (0-3s), 3. MECHANICS (step-by-step), 4. PSYCHOLOGY. Respond in English only with high detail." },
                  { file_data: { mime_type: "video/mp4", file_uri: googleFileResource.file.uri } }
                ]
              }]
            })
          });

          const gData = await geminiRes.json();
          strategy = gData.candidates?.[0]?.content?.parts?.[0]?.text || "AI returned empty result.";
          break;
        }
        console.info(`[PRO] Polling ${gFileName}: ${checkData.state}`);
      }
    }

    // Сохранение в базу
    const brandName = data[0]?.snapshot?.page_name || "Mobile Brand";
    await supabase.from('ads_library').insert([{
      page_id: pageId, brand_name: brandName, 
      strategy_analysis: strategy, creatives: processed
    }]);

    return NextResponse.json({ brand: brandName, strategy, creatives: processed });

  } catch (e: any) {
    console.error(`[CRITICAL ERROR] ${e.message}`);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
