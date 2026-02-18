import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '');
export const maxDuration = 300; 

export async function POST(req: Request) {
  console.log(">>> [START] New Analysis Request Received");
  try {
    const { url } = await req.json();
    const token = process.env.APIFY_TOKEN;
    const geminiKey = "AIzaSyB2Jc3tFV5cwYLjUBDqwAjgClGhwMv8cB8"; 
    const idMatch = url.match(/\d{10,}/);
    const pageId = idMatch ? idMatch[0] : url;

    console.log(`>>> [STEP 1] Scrapping Ads for PageID: ${pageId}`);
    const apifyRes = await fetch(`https://api.apify.com/v2/acts/curious_coder~facebook-ads-library-scraper/run-sync-get-dataset-items?token=${token}&timeout=60&maxChargedResults=10`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        "urls": [{ "url": `https://www.facebook.com/ads/library/?view_all_page_id=${pageId}&active_status=active&ad_type=all&country=ALL&sort_data[direction]=desc&sort_data[mode]=total_impressions` }], 
        "count": 10, 
        "scrapeAdDetails": true 
      })
    });

    const data = await apifyRes.json();
    console.log(`>>> [DATA] Apify returned ${data?.length || 0} ads`);

    const processedCreatives = [];
    const googleFiles = []; // Храним полные объекты ответов Google

    // 2. ЦИКЛ ЗАГРУЗКИ
    for (const ad of data.slice(0, 10)) {
      const adId = ad.ad_archive_id;
      const videoUrl = ad.snapshot?.videos?.[0]?.video_hd_url || ad.snapshot?.videos?.[0]?.video_sd_url;
      
      if (!videoUrl) {
        console.log(`>>> [SKIP] No video for AdID: ${adId}`);
        continue;
      }

      console.log(`>>> [UPLOAD] Starting AdID: ${adId}`);
      try {
        const vFetch = await fetch(videoUrl);
        const buffer = await vFetch.arrayBuffer();
        const uint8 = new Uint8Array(buffer);

        // Загрузка в Google
        console.log(`>>> [GOOGLE] Uploading ${adId} (${uint8.byteLength} bytes)...`);
        const gStart = await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${geminiKey}`, {
          method: 'POST',
          headers: {
            'X-Goog-Upload-Protocol': 'resumable',
            'X-Goog-Upload-Command': 'start',
            'X-Goog-Upload-Header-Content-Type': 'video/mp4',
            'X-Goog-Upload-Header-Content-Length': uint8.byteLength.toString(),
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ file: { display_name: `creative_${adId}` } })
        });

        const uploadUrl = gStart.headers.get('x-goog-upload-url');
        if (!uploadUrl) throw new Error(`Failed to get Google Upload URL for ${adId}`);

        const gFinal = await fetch(uploadUrl, {
          method: 'POST',
          headers: { 'X-Goog-Upload-Offset': '0', 'X-Goog-Upload-Command': 'upload, finalize' },
          body: uint8
        });

        const gRes = await gFinal.json();
        console.log(`>>> [GOOGLE DONE] AdID: ${adId} -> Google Name: ${gRes.file.name}`);
        googleFiles.push({ uri: gRes.file.uri, name: gRes.file.name, id: adId });

        // Сохранение в Supabase
        const fileName = `vid_${adId}.mp4`;
        await supabase.storage.from('ads_videos').upload(fileName, uint8, { contentType: 'video/mp4', upsert: true });
        
        processedCreatives.push({ 
          id: adId, 
          video: supabase.storage.from('ads_videos').getPublicUrl(fileName).data.publicUrl, 
          thumbnail: ad.snapshot?.videos?.[0]?.video_preview_image_url || "",
          concept: 'All'
        });
      } catch (e: any) {
        console.error(`>>> [ERROR] Failed to process ${adId}: ${e.message}`);
      }
    }

    // 3. ПОЛЛИНГ (ПРОВЕРКА ГОТОВНОСТИ)
    console.log(">>> [POLLING] Waiting for Google to index videos...");
    for (const file of googleFiles) {
      let ready = false;
      let attempts = 0;
      while (!ready && attempts < 10) {
        const check = await fetch(`https://generativelanguage.googleapis.com/v1beta/${file.name}?key=${geminiKey}`);
        const cData = await check.json();
        console.log(`>>> [STATUS] File ${file.id}: ${cData.state}`);
        if (cData.state === 'ACTIVE') {
          ready = true;
        } else {
          attempts++;
          await new Promise(r => setTimeout(r, 5000));
        }
      }
    }

    // 4. АНАЛИЗ (Модель 2.0 Flash - самая быстрая и стабильная для видео)
    console.log(`>>> [AI] Calling Gemini 2.0 Flash with ${googleFiles.length} videos...`);
    let finalStrategy = "Analysis failed.";
    
    if (googleFiles.length > 0) {
      const promptParts = [
        { text: "Analyze these video ads. Group into Concepts: Misleading, Gameplay, UGC, Cinematic. Use professional Markdown." },
        ...googleFiles.map(f => ({ file_data: { mime_type: "video/mp4", file_uri: f.uri } }))
      ];

      const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          contents: [{ parts: promptParts }],
          safetySettings: [{ category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }]
        })
      });

      const gData = await geminiRes.json();
      
      if (gData.error) {
        console.error(">>> [AI ERROR]", JSON.stringify(gData.error));
        finalStrategy = `AI Error: ${gData.error.message}`;
      } else {
        finalStrategy = gData.candidates?.[0]?.content?.parts?.[0]?.text || "No analysis text returned.";
        console.log(">>> [AI SUCCESS] Strategy generated.");
      }

      // Примитивное тегирование
      processedCreatives.forEach(ad => {
        const lowText = finalStrategy.toLowerCase();
        if (lowText.includes('misleading')) ad.concept = 'Misleading';
        else if (lowText.includes('ugc')) ad.concept = 'UGC';
        else ad.concept = 'Gameplay';
      });
    }

    const brandName = data[0]?.snapshot?.page_name || "Brand";
    console.log(`>>> [SAVE] Saving to DB: ${brandName}`);
    await supabase.from('ads_library').insert([{ 
      page_id: pageId, 
      brand_name: brandName, 
      strategy_analysis: finalStrategy, 
      creatives: processedCreatives 
    }]);

    console.log(">>> [COMPLETE] Success!");
    return NextResponse.json({ brand: brandName, strategy: finalStrategy, creatives: processedCreatives });
    
  } catch (e: any) { 
    console.error(`>>> [CRITICAL ERROR] ${e.message}`);
    return NextResponse.json({ error: e.message }, { status: 500 }); 
  }
}
