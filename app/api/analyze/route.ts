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
    
    console.log(`[LOG] Starting analysis for Page ID: ${pageId}`);

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

    for (const ad of data.slice(0, 5)) {
      const adId = ad.ad_archive_id;
      const videoSource = ad.snapshot?.videos?.[0] || ad.snapshot?.cards?.[0];
      const fbVideoUrl = videoSource?.video_hd_url || videoSource?.video_sd_url;
      const thumbUrl = videoSource?.video_preview_image_url || ad.snapshot?.images?.[0]?.resized_image_url;
      
      let storageUrl = null;

      if (fbVideoUrl) {
        try {
          const vFetch = await fetch(fbVideoUrl);
          if (!vFetch.ok) throw new Error("FB Link Expired");
          
          const buffer = await vFetch.arrayBuffer();
          const fileName = `vid_${adId}.mp4`;

          const { error: upError } = await supabase.storage
            .from('ads_videos')
            .upload(fileName, buffer, { contentType: 'video/mp4', upsert: true });

          if (!upError) {
            storageUrl = supabase.storage.from('ads_videos').getPublicUrl(fileName).data.publicUrl;
          }
        } catch (e: any) { 
          console.error(`[MEDIA FAIL] ${adId}: ${e.message}`); 
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

    console.info(`[DEBUG] Sending ${processed.length} ads to Gemini.`);

    // --- ФИКС: ПЕРЕКЛЮЧЕНО НА v1 ---
    const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${geminiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `You are a Senior UA Creative Strategist. Analyze these ads: ${JSON.stringify(processed)}.
            
            TASKS:
            1. Group ads into 2-3 logical "CREATIVE CONCEPTS" (e.g., "Failed Rescue", "ASMR Construction").
            2. For EACH concept, provide a detailed breakdown in English:
               - VISUAL HOOK (0-3s): Exactly what happens to stop the scroll?
               - MECHANICS: Gameplay description. Is it real or fake?
               - PSYCHOLOGY: Why does this work?
            
            IMPORTANT: Respond ONLY in English. Be extremely descriptive.`
          }]
        }]
      })
    });

    const gData = await geminiRes.json();
    
    if (gData.error) {
      console.error("[GEMINI API ERROR]", gData.error.message);
      throw new Error(`Gemini Error: ${gData.error.message}`);
    }

    const strategy = gData?.candidates?.[0]?.content?.parts?.[0]?.text || "No analysis generated.";

    const brandName = data[0]?.snapshot?.page_name || data[0]?.page_name || "Mobile Brand";

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
