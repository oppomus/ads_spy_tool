import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || '', 
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export const maxDuration = 300; 

export async function POST(req: Request) {
  console.log(">>> [STATION START] Incoming request...");
  try {
    const { url } = await req.json();
    const token = process.env.APIFY_TOKEN;
    
    // ТЕПЕРЬ БЕРЕМ ИЗ VERCEL, А НЕ ИЗ ТЕКСТА
    const geminiKey = process.env.NEXT_PUBLIC_NEW_TOTAL_SECRET_KEY; 

    if (!geminiKey) {
       // ИСПРАВЛЕНО: Теперь лог пишет правду про имя переменной
       console.error(">>> [CRITICAL] NEW_TOTAL_SECRET_KEY is missing in Vercel Env Vars!");
       throw new Error("API Key configuration error");
    }
    
    // ИСПРАВЛЕНО: Убран дубликат (было объявлено дважды)
    const idMatch = url.match(/\d{10,}/);
    const pageId = idMatch ? idMatch[0] : url;

    console.log(`>>> [STEP 1] Scraping Page ID: ${pageId}`);
    
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
    if (!Array.isArray(data)) {
        console.error(">>> [APIFY FAIL] Data is not an array:", data);
        throw new Error("Apify response invalid");
    }
    console.log(`>>> [STEP 2] Found ${data.length} ads. Starting asset transfer...`);

    const processedCreatives = [];
    const googleFiles = [];

    // --- ЦИКЛ ОБРАБОТКИ 10 ВИДЕО ---
    for (const ad of data.slice(0, 10)) {
      const adId = ad.ad_archive_id;
      const videoUrl = ad.snapshot?.videos?.[0]?.video_hd_url || ad.snapshot?.videos?.[0]?.video_sd_url;
      
      if (!videoUrl) {
        console.log(`>>> [SKIP] No video link for Ad ID ${adId}`);
        continue;
      }

      console.log(`>>> [DOWNLOAD] Fetching video buffer for ${adId}...`);
      try {
        const vFetch = await fetch(videoUrl);
        const buffer = await vFetch.arrayBuffer();
        const uint8 = new Uint8Array(buffer);
        const fileSize = uint8.byteLength.toString();

        // 1. Google Upload Handshake
        console.log(`>>> [GOOGLE] Starting Handshake for ${adId}...`);
        const gStart = await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${geminiKey}`, {
          method: 'POST',
          headers: {
            'X-Goog-Upload-Protocol': 'resumable',
            'X-Goog-Upload-Command': 'start',
            'X-Goog-Upload-Header-Content-Type': 'video/mp4',
            'X-Goog-Upload-Header-Content-Length': fileSize,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ file: { display_name: `ads_${adId}` } })
        });

        if (!gStart.ok) {
          const errorMsg = await gStart.text();
          console.error(`>>> [GOOGLE HANDSHAKE ERROR] Status: ${gStart.status} | Body: ${errorMsg}`);
          throw new Error(`Google handshake failed: ${gStart.status}`);
        }

        const uploadUrl = gStart.headers.get('x-goog-upload-url');
        if (!uploadUrl) {
          console.error(`>>> [GOOGLE ERROR] No upload URL in headers for ${adId}`);
          throw new Error("Missing upload URL");
        }

        // 2. Google Actual Upload
        console.log(`>>> [GOOGLE] Pushing bytes for ${adId}...`);
        const gFinal = await fetch(uploadUrl, {
          method: 'POST',
          headers: { 
            'X-Goog-Upload-Offset': '0', 
            'X-Goog-Upload-Command': 'upload, finalize' 
          },
          body: uint8
        });

        const gRes = await gFinal.json();
        console.log(`>>> [GOOGLE SUCCESS] Ad ${adId} registered as: ${gRes.file.name}`);
        googleFiles.push({ uri: gRes.file.uri, name: gRes.file.name, id: adId });

        // 3. Supabase Upload
        console.log(`>>> [SUPABASE] Uploading video for ${adId}...`);
        const fileName = `vid_${adId}.mp4`;
        const { error: storageError } = await supabase.storage
          .from('ads_videos')
          .upload(fileName, uint8, { contentType: 'video/mp4', upsert: true });

        if (storageError) console.error(`>>> [SUPABASE ERROR] ${storageError.message}`);

        const publicUrl = supabase.storage.from('ads_videos').getPublicUrl(fileName).data.publicUrl;
        
        processedCreatives.push({ 
          id: adId, 
          video: publicUrl, 
          thumbnail: ad.snapshot?.videos?.[0]?.video_preview_image_url || "",
          concept: 'All'
        });

      } catch (err: any) {
        console.error(`>>> [FAILED CREATIVE ${adId}] ${err.message}`);
      }
    }

    // --- ЦИКЛ ПРОВЕРКИ ГОТОВНОСТИ (ВОССТАНОВЛЕН) ---
    console.log(`>>> [POLLING] Checking status of ${googleFiles.length} files...`);
    for (const file of googleFiles) {
      let active = false;
      let attempts = 0;
      const maxAttempts = 12; // 1 минута на файл максимум

      while (!active && attempts < maxAttempts) {
        console.log(`>>> [POLLING] File ${file.id} attempt ${attempts + 1}...`);
        const checkRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/${file.name}?key=${geminiKey}`);
        const status = await checkRes.json();
        
        if (status.state === 'ACTIVE') {
          console.log(`>>> [READY] File ${file.id} is ACTIVE`);
          active = true;
        } else {
          console.log(`>>> [WAIT] File ${file.id} is ${status.state}. Sleeping 5s...`);
          attempts++;
          await new Promise(r => setTimeout(r, 5000));
        }
      }
    }

    // --- АНАЛИЗ GEMINI 2.0 / 3 ---
    console.log(">>> [AI] Sending files to model for strategy analysis...");
    let finalStrategy = "Strategy analysis was not possible.";

    if (googleFiles.length > 0) {
      const promptParts = [
        { text: "Analyze these video ads. Group them into Concepts: Misleading, Gameplay, UGC, Cinematic. For each concept describe The Hook, Value Prop, and Psychology. Mention video IDs. Use Markdown." },
        ...googleFiles.map(f => ({ file_data: { mime_type: "video/mp4", file_uri: f.uri } }))
      ];

      const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: promptParts }],
          safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
          ]
        })
      });

      const gData = await geminiRes.json();
      
      if (gData.error) {
        console.error(">>> [AI CRITICAL ERROR]", JSON.stringify(gData.error));
        finalStrategy = `Error from AI: ${gData.error.message}`;
      } else {
        finalStrategy = gData.candidates?.[0]?.content?.parts?.[0]?.text || "No strategy generated.";
        console.log(">>> [AI SUCCESS] Strategy text received.");
      }

      // Тегирование
      processedCreatives.forEach(ad => {
        const stratLower = finalStrategy.toLowerCase();
        if (stratLower.includes('misleading')) ad.concept = 'Misleading';
        else if (stratLower.includes('ugc')) ad.concept = 'UGC';
        else if (stratLower.includes('cinematic')) ad.concept = 'Cinematic';
        else ad.concept = 'Gameplay';
      });
    }

    const brandName = data[0]?.snapshot?.page_name || "Brand";
    
    // --- СОХРАНЕНИЕ ---
    console.log(`>>> [DB] Saving report for ${brandName}...`);
    const { error: dbError } = await supabase.from('ads_library').insert([{ 
      page_id: pageId, 
      brand_name: brandName, 
      strategy_analysis: finalStrategy, 
      creatives: processedCreatives 
    }]);

    if (dbError) console.error(`>>> [DB ERROR] ${dbError.message}`);

    console.log(">>> [ALL DONE] Returning results to client.");
    return NextResponse.json({ 
      brand: brandName, 
      strategy: finalStrategy, 
      creatives: processedCreatives 
    });

  } catch (e: any) { 
    console.error(`>>> [GLOBAL CRITICAL FAIL] ${e.message}`);
    return NextResponse.json({ error: e.message }, { status: 500 }); 
  }
}
