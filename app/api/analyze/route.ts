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

    console.info(`[1] Starting Apify for Page: ${pageId}`);

    const apifyUrl = `https://api.apify.com/v2/acts/curious_coder~facebook-ads-library-scraper/run-sync-get-dataset-items?token=${token}&timeout=50&maxChargedResults=10`;
    
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
    if (!Array.isArray(data)) throw new Error("Apify failed to return data array");

    const processed = [];

    // ОБРАБОТКА ПО ТВОЕМУ JSON: ищем в snapshot.videos
    for (const ad of data.slice(0, 5)) {
      const adId = ad.ad_archive_id;
      const videoData = ad.snapshot?.videos?.[0]; 
      const fbVideoUrl = videoData?.video_hd_url || videoData?.video_sd_url;
      const thumbUrl = videoData?.video_preview_image_url;
      
      let storageUrl = null;

      if (fbVideoUrl) {
        try {
          console.info(`[2] Downloading video: ${adId}`);
          const vFetch = await fetch(fbVideoUrl);
          const buffer = await vFetch.arrayBuffer();
          const fileName = `vid_${adId}.mp4`;

          const { error: upError } = await supabase.storage
            .from('ads_videos')
            .upload(fileName, buffer, { contentType: 'video/mp4', upsert: true });

          if (!upError) {
            storageUrl = supabase.storage.from('ads_videos').getPublicUrl(fileName).data.publicUrl;
            console.info(`[3] Video stored for ${adId}`);
          }
        } catch (e) { console.error("Media upload failed for:", adId); }
      }

      processed.push({
        id: adId,
        thumbnail: thumbUrl || "",
        video: storageUrl,
        rawVideoUrl: fbVideoUrl, // Direct link for Gemini multimodal analysis
        title: ad.snapshot?.title || "Mobile Ad",
        body: ad.snapshot?.body?.text || ""
      });
    }

    console.info(`[4] Sending ${processed.length} items to Gemini for Concept Analysis`);

    // GEMINI: Глубокий визуальный анализ концептов
    const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `You are a Senior UA Creative Strategist. Analyze the following ad data visually and contextually: ${JSON.stringify(processed)}.

            TASK:
            1. Group these videos into 2-3 logical "CREATIVE CONCEPTS" (e.g., "Failed Rescue", "ASMR Construction", "Story Choice").
            2. For EACH concept, provide a detailed breakdown:
               - VISUAL HOOK (0-3s): Describe the exact visual action. Break it down into "Early Hook" and "Final Hook".
               - MECHANICS: Describe the gameplay action step-by-step. Is it real gameplay or Misleading/Fake? 
               - PSYCHOLOGY: Why does this hook convert? (e.g., frustration from failure, satisfaction from order, curiosity).
            
            IMPORTANT:
            - Respond ONLY in ENGLISH.
            - Do not analyze each video separately; analyze the underlying CONCEPTS.
            - Be highly descriptive about the visual elements seen in the videos.`
          }]
        }]
      })
    });

    const gData = await geminiRes.json();
    const strategy = gData?.candidates?.[0]?.content?.parts?.[0]?.text || "No concepts detected.";

    console.info("[5] AI Analysis complete. Saving to Database...");

    // BRAND NAME: берем из snapshot
    const brandName = data[0]?.snapshot?.page_name || "Mobile Brand";

    await supabase.from('ads_library').insert([{
      page_id: pageId, 
      brand_name: brandName, 
      strategy_analysis: strategy, 
      creatives: processed
    }]);

    return NextResponse.json({ brand: brandName, strategy, creatives: processed });

  } catch (e: any) {
    console.error("[CRITICAL ERROR]:", e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
