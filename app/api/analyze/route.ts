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
      body: JSON.stringify({ "urls": [{ "url": `https://www.facebook.com/ads/library/?view_all_page_id=${pageId}&active_status=active&ad_type=all&country=ALL` }], "count": 10, "scrapeAdDetails": true })
    });

    const data = await res.json();
    if (!Array.isArray(data)) throw new Error("Apify error");

    const processed = [];
    let firstVideoBase64 = null; 

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
            const fullBuffer = await vFetch.arrayBuffer();
            
            // ФИКС: Обрезаем видео до 3.5МБ, чтобы не ломать лимиты Vercel
            if (i === 0) {
              const safeSize = 3.5 * 1024 * 1024;
              const clippedBuffer = fullBuffer.byteLength > safeSize ? fullBuffer.slice(0, safeSize) : fullBuffer;
              firstVideoBase64 = Buffer.from(clippedBuffer).toString('base64');
              console.info(`[DEBUG] Video clipped for AI. Size: ${(firstVideoBase64.length / 1024).toFixed(2)} KB`);
            }

            const fileName = `vid_${adId}.mp4`;
            await supabase.storage.from('ads_videos').upload(fileName, fullBuffer, { contentType: 'video/mp4', upsert: true });
            storageUrl = supabase.storage.from('ads_videos').getPublicUrl(fileName).data.publicUrl;
          }
        } catch (e) { console.error(`Media fail for ${adId}`); }
      }

      processed.push({
        id: adId,
        thumbnail: videoSource?.video_preview_image_url || "",
        video: storageUrl,
        title: ad.snapshot?.title || "Mobile Ad",
        body: ad.snapshot?.body?.text || ""
      });
    }

    // ГОТОВИМ ЗАПРОС К GEMINI (v1beta + gemini-1.5-flash)
    const promptParts: any[] = [
      { text: `You are a Senior UA Creative Strategist. WATCH the attached video footage of the ad hook for brand: ${data[0]?.snapshot?.page_name || "this app"}.
               
               TASKS:
               1. Identify the "CREATIVE CONCEPT" based on visual evidence in the footage.
               2. Describe what happens in the VISUAL HOOK (0-3s).
               3. Explain the MECHANICS (Match-3, Fail, ASMR, etc.) and the PSYCHOLOGY behind the visuals.
               
               Respond ONLY in English. Be highly descriptive about the actions seen in the video.` }
    ];

    if (firstVideoBase64) {
      promptParts.push({ inline_data: { mime_type: "video/mp4", data: firstVideoBase64 } });
    }

    let strategy = "Vision analysis unavailable.";
    try {
      const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: promptParts }] })
      });

      const gData = await geminiRes.json();
      if (gData.candidates?.[0]?.content?.parts?.[0]?.text) {
        strategy = gData.candidates[0].content.parts[0].text;
      } else if (gData.error) {
        console.error("[GEMINI ERROR]", JSON.stringify(gData.error));
        strategy = `AI error: ${gData.error.message}`;
      }
    } catch (aiErr) { console.error("[AI CRASH]", aiErr); }

    await supabase.from('ads_library').insert([{
      page_id: pageId, brand_name: data[0]?.snapshot?.page_name || "Mobile Brand", 
      strategy_analysis: strategy, creatives: processed
    }]);

    return NextResponse.json({ brand: data[0]?.snapshot?.page_name, strategy, creatives: processed });

  } catch (e: any) {
    console.error(`[CRITICAL ERROR] ${e.message}`);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
