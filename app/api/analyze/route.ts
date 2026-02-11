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

    const apifyUrl = `https://api.apify.com/v2/acts/curious_coder~facebook-ads-library-scraper/run-sync-get-dataset-items?token=${token}&timeout=30&maxChargedResults=10`;
    
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
    if (!Array.isArray(data)) throw new Error("Apify error");

    const processed = [];
    const visionParts = []; 

    for (let i = 0; i < data.slice(0, 5).length; i++) {
      const ad = data[i];
      const adId = ad.ad_archive_id;
      const videoSource = ad.snapshot?.videos?.[0] || ad.snapshot?.cards?.[0];
      const fbVideoUrl = videoSource?.video_hd_url || videoSource?.video_sd_url;
      const thumbUrl = videoSource?.video_preview_image_url;
      
      let storageUrl = null;

      if (fbVideoUrl) {
        try {
          const vFetch = await fetch(fbVideoUrl);
          if (vFetch.ok) {
            const buffer = await vFetch.arrayBuffer();
            
            // ПЕРЕДАЕМ ПЕРВЫЕ 2 ВИДЕО ДЛЯ РЕАЛЬНОГО ПРОСМОТРА
            if (i < 2) {
              const base64Video = Buffer.from(buffer).toString('base64');
              visionParts.push({
                inline_data: {
                  mime_type: "video/mp4",
                  data: base64Video
                }
              });
            }

            const fileName = `vid_${adId}.mp4`;
            const { error: upError } = await supabase.storage
              .from('ads_videos')
              .upload(fileName, buffer, { contentType: 'video/mp4', upsert: true });

            if (!upError) {
              storageUrl = supabase.storage.from('ads_videos').getPublicUrl(fileName).data.publicUrl;
            }
          }
        } catch (e: any) { console.error(`Media fail for ${adId}`); }
      }

      processed.push({
        id: adId,
        thumbnail: thumbUrl || "",
        video: storageUrl,
        title: ad.snapshot?.title || "Mobile Ad",
        body: ad.snapshot?.body?.text || ""
      });
    }

    console.info(`[DEBUG] Sending ${visionParts.length} videos to Gemini v1beta.`);

    // --- ФИКС: ПРАВИЛЬНЫЙ ЭНДПОИНТ И СТРУКТУРА ДЛЯ VISION ---
    let strategy = "Vision analysis failed.";
    try {
      const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: `You are a Senior UA Creative Strategist. I have attached actual video files. 
                       WATCH these videos and provide a visual teardown for the brand: ${data[0]?.snapshot?.page_name || "this app"}.
                       
                       1. Group them into logical "CREATIVE CONCEPTS".
                       2. For EACH concept, describe what specifically happens in the VISUAL HOOK (0-3s), the STEP-BY-STEP MECHANICS (real or fake?), and the PSYCHOLOGY (why it converts).
                       
                       Be extremely descriptive about visual details. Respond ONLY in English.` 
              },
              ...visionParts
            ]
          }]
        })
      });

      const gData = await geminiRes.json();
      if (gData.candidates?.[0]?.content?.parts?.[0]?.text) {
        strategy = gData.candidates[0].content.parts[0].text;
      } else if (gData.error) {
        console.error("[GEMINI ERROR DETAILS]", JSON.stringify(gData.error));
      }
    } catch (aiErr) {
      console.error("[AI CRASH]", aiErr);
    }

    // Сохраняем результат в базу даже если ИИ выдал ошибку
    const brandName = data[0]?.snapshot?.page_name || "Mobile Brand";
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
