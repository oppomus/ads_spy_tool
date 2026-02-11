import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '');

export const maxDuration = 60; // Видео-анализ требует времени

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
    const visionParts = []; // Сюда мы положим видео-данные для Gemini

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
          if (!vFetch.ok) throw new Error("Link expired");
          
          const buffer = await vFetch.arrayBuffer();
          
          // ДЛЯ GEMINI: Кодируем первые 2 видео в Base64 для "просмотра"
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
        } catch (e: any) { 
          console.error(`Media fail for ${adId}`); 
        }
      }

      processed.push({
        id: adId,
        thumbnail: thumbUrl || "",
        video: storageUrl,
        title: ad.snapshot?.title || "Mobile Ad",
        body: ad.snapshot?.body?.text || ""
      });
    }

    console.info(`[DEBUG] Sending ${visionParts.length} videos for REAL visual analysis.`);

    // --- ФИКС: ТЕПЕРЬ МЫ ПЕРЕДАЕМ ВИДЕО-ДАННЫЕ ---
    const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${geminiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: `You are a Senior UA Creative Strategist. I have attached the actual video files of the ads. 
                     Watch these videos and analyze their creative strategies for brand: ${data[0]?.snapshot?.page_name}.
            
                     TASKS:
                     1. Group them into logical "CREATIVE CONCEPTS".
                     2. For EACH concept, provide a visual teardown based ONLY on what you see in the videos:
                        - VISUAL HOOK (0-3s): Describe exactly what happens.
                        - MECHANICS: Gameplay actions. Is it real or fake?
                        - PSYCHOLOGY: Why does this work?
            
                     Respond ONLY in English. Be extremely descriptive about the visual elements.` 
            },
            ...visionParts // Это и есть "зрение" — бинарные данные видео
          ]
        }]
      })
    });

    const gData = await geminiRes.json();
    if (gData.error) throw new Error(gData.error.message);

    const strategy = gData?.candidates?.[0]?.content?.parts?.[0]?.text || "Vision analysis failed.";

    await supabase.from('ads_library').insert([{
      page_id: pageId, 
      brand_name: data[0]?.snapshot?.page_name || "Mobile Brand", 
      strategy_analysis: strategy, 
      creatives: processed
    }]);

    return NextResponse.json({ brand: data[0]?.snapshot?.page_name, strategy, creatives: processed });

  } catch (e: any) {
    console.error(`[CRITICAL ERROR] ${e.message}`);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
