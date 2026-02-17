import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '');
export const maxDuration = 300; 

export async function POST(req: Request) {
  try {
    const { url } = await req.json();
    const token = process.env.APIFY_TOKEN;
    
    // ХАРДКОД КЛЮЧА ДЛЯ ТЕСТА
    const geminiKey = "AIzaSyB2Jc3tFV5cwYLjUBDqwAjgClGhwMv8cB8"; 

    const idMatch = url.match(/\d{10,}/);
    const pageId = idMatch ? idMatch[0] : url;

    // 1. Apify: Скрепим топ-10 по показам
    const apifyUrl = `https://api.apify.com/v2/acts/curious_coder~facebook-ads-library-scraper/run-sync-get-dataset-items?token=${token}&timeout=60&maxChargedResults=10`;
    const res = await fetch(apifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        "urls": [{ "url": `https://www.facebook.com/ads/library/?view_all_page_id=${pageId}&active_status=active&ad_type=all&country=ALL&sort_data[direction]=desc&sort_data[mode]=total_impressions` }], 
        "count": 10, 
        "scrapeAdDetails": true 
      })
    });

    const data = await res.json();
    if (!Array.isArray(data)) throw new Error("Apify failure");

    const processed = [];
    let googleFileResource: any = null;

    // 2. Обработка видео
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
            const arrayBuffer = await vFetch.arrayBuffer();
            const uint8Array = new Uint8Array(arrayBuffer); 

            // GOOGLE UPLOAD (Step 1 & 2)
            if (i === 0 && !googleFileResource) {
              const fileSize = uint8Array.byteLength.toString();
              console.info(`[DEBUG] New Key Test. File size: ${fileSize}`);

              // Step 1: Start
              const startRes = await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${geminiKey}`, {
                method: 'POST',
                headers: {
                  'X-Goog-Upload-Protocol': 'resumable',
                  'X-Goog-Upload-Command': 'start',
                  'X-Goog-Upload-Header-Content-Type': 'video/mp4',
                  'X-Goog-Upload-Header-Content-Length': fileSize,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({ file: { display_name: `creative_${adId}` } })
              });

              const uploadUrl = startRes.headers.get('x-goog-upload-url');
              
              if (uploadUrl) {
                console.info(`[DEBUG] Step 1 OK. Uploading to Step 2...`);
                // Step 2: Finalize
                const finalRes = await fetch(uploadUrl, {
                  method: 'POST',
                  headers: { 
                    'X-Goog-Upload-Offset': '0', 
                    'X-Goog-Upload-Command': 'upload, finalize'
                  },
                  body: uint8Array 
                });

                if (finalRes.ok) {
                  googleFileResource = await finalRes.json();
                  console.info(`[DEBUG] Step 2 SUCCESS! URI: ${googleFileResource.file.uri}`);
                } else {
                  const errorBody = await finalRes.text();
                  console.error(`[DEBUG] Step 2 FAILED. Body: ${errorBody}`);
                }
              } else {
                const errorBody = await startRes.text();
                console.error(`[DEBUG] Step 1 FAILED. Body: ${errorBody}`);
              }
            }

            // Загрузка в Supabase
            const fileName = `vid_${adId}.mp4`;
            await supabase.storage.from('ads_videos').upload(fileName, uint8Array, { contentType: 'video/mp4', upsert: true });
            storageUrl = supabase.storage.from('ads_videos').getPublicUrl(fileName).data.publicUrl;
          }
        } catch (e: any) { console.error(`Media err: ${e.message}`); }
      }
      processed.push({ id: adId, thumbnail: videoSource?.video_preview_image_url || "", video: storageUrl, title: ad.snapshot?.title || "Ad", body: ad.snapshot?.body?.text || "" });
    }

    // 3. Анализ (Gemini 1.5 Pro)
    let strategy = "Vision analysis unavailable.";
    if (googleFileResource?.file?.name) {
      const gFileName = googleFileResource.file.name;
      for (let attempt = 0; attempt < 12; attempt++) {
        await new Promise(r => setTimeout(r, 5000)); 
        const checkRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/${gFileName}?key=${geminiKey}`);
        const checkData = await checkRes.json();
        
        console.info(`[DEBUG] Polling: ${checkData.state}`);
        
        if (checkData.state === 'ACTIVE') {
          await new Promise(r => setTimeout(r, 5000));
          const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${geminiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{
                parts: [
                  { text: "Detailed UA Strategy Analysis: 1. CORE CONCEPT, 2. VISUAL HOOK, 3. MECHANICS, 4. PSYCHOLOGY. English only." },
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
          strategy = gData.candidates?.[0]?.content?.parts?.[0]?.text || "Analysis generated empty result.";
          break;
        }
      }
    }

    await supabase.from('ads_library').insert([{
      page_id: pageId, brand_name: data[0]?.snapshot?.page_name || "Brand", 
      strategy_analysis: strategy, creatives: processed
    }]);

    return NextResponse.json({ brand: data[0]?.snapshot?.page_name, strategy, creatives: processed });

  } catch (e: any) {
    console.error(`[CRITICAL] ${e.message}`);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
