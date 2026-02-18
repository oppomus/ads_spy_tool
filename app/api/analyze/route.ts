import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '');
export const maxDuration = 300; 

export async function POST(req: Request) {
  try {
    const { url } = await req.json();
    const token = process.env.APIFY_TOKEN;
    const geminiKey = "AIzaSyB2Jc3tFV5cwYLjUBDqwAjgClGhwMv8cB8"; 
    const idMatch = url.match(/\d{10,}/);
    const pageId = idMatch ? idMatch[0] : url;

    const apifyRes = await fetch(`https://api.apify.com/v2/acts/curious_coder~facebook-ads-library-scraper/run-sync-get-dataset-items?token=${token}&timeout=60&maxChargedResults=10`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ "urls": [{ "url": `https://www.facebook.com/ads/library/?view_all_page_id=${pageId}&active_status=active&ad_type=all&country=ALL&sort_data[direction]=desc&sort_data[mode]=total_impressions` }], "count": 10, "scrapeAdDetails": true })
    });
    const data = await apifyRes.json();
    
    const processedCreatives = [];
    const googleFileUris = [];

    for (const ad of data.slice(0, 10)) {
      const adId = ad.ad_archive_id;
      const videoUrl = ad.snapshot?.videos?.[0]?.video_hd_url || ad.snapshot?.videos?.[0]?.video_sd_url;
      if (!videoUrl) continue;

      try {
        const vFetch = await fetch(videoUrl);
        const buffer = await vFetch.arrayBuffer();
        const uint8 = new Uint8Array(buffer);

        const gStart = await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${geminiKey}`, {
          method: 'POST',
          headers: { 'X-Goog-Upload-Protocol': 'resumable', 'X-Goog-Upload-Command': 'start', 'X-Goog-Upload-Header-Content-Type': 'video/mp4', 'X-Goog-Upload-Header-Content-Length': uint8.byteLength.toString(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ file: { display_name: `id_${adId}` } }) 
        });

        const uploadUrl = gStart.headers.get('x-goog-upload-url');
        if (uploadUrl) {
          const gFinal = await fetch(uploadUrl, { method: 'POST', headers: { 'X-Goog-Upload-Offset': '0', 'X-Goog-Upload-Command': 'upload, finalize' }, body: uint8 });
          const gRes = await gFinal.json();
          googleFileUris.push({ uri: gRes.file.uri, name: gRes.file.name, id: adId });
        }

        const fileName = `vid_${adId}.mp4`;
        await supabase.storage.from('ads_videos').upload(fileName, uint8, { contentType: 'video/mp4', upsert: true });
        processedCreatives.push({ 
          id: adId, 
          video: supabase.storage.from('ads_videos').getPublicUrl(fileName).data.publicUrl, 
          thumbnail: ad.snapshot?.videos?.[0]?.video_preview_image_url || "",
          concept: 'Gameplay' // Заглушка, чтобы фильтр не ломался
        });
      } catch (e) { console.error(`Err: ${adId}`); }
    }

    if (googleFileUris.length > 0) await new Promise(r => setTimeout(r, 15000));

    let finalStrategy = "Strategic Analysis Unavailable.";
    if (googleFileUris.length > 0) {
      const promptParts: any[] = [
        { text: `INSTRUCTION: You are a Senior UA Lead. Analyze these 10 videos.
          1. Provide a detailed Strategic Report in Markdown (Concepts, Hooks, Psychology).
          2. Classify each video into ONE of these: Misleading, Gameplay, UGC, Cinematic.
          3. At the end of your response, list EXACTLY this format for tagging:
          [TAGS]
          ID: [video_id] -> CONCEPT: [ConceptName]
          [TAGS_END]` }
      ];
      googleFileUris.forEach(f => promptParts.push({ file_data: { mime_type: "video/mp4", file_uri: f.uri } }));

      const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${geminiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: promptParts }] })
      });

      const gData = await geminiRes.json();
      const rawText = gData.candidates?.[0]?.content?.parts?.[0]?.text || "No text returned.";
      finalStrategy = rawText; // ТЕКСТ ТЕПЕРЬ ВСЕГДА СОХРАНЯЕТСЯ

      // Мягкий парсинг тегов без удаления текста
      processedCreatives.forEach(ad => {
        if (rawText.includes(ad.id)) {
          if (rawText.toLowerCase().includes('misleading')) ad.concept = 'Misleading';
          else if (rawText.toLowerCase().includes('ugc')) ad.concept = 'UGC';
          else if (rawText.toLowerCase().includes('cinematic')) ad.concept = 'Cinematic';
          else ad.concept = 'Gameplay';
        }
      });
    }

    const brandName = data[0]?.snapshot?.page_name || "Brand";
    await supabase.from('ads_library').insert([{ page_id: pageId, brand_name: brandName, strategy_analysis: finalStrategy, creatives: processedCreatives }]);
    return NextResponse.json({ brand: brandName, strategy: finalStrategy, creatives: processedCreatives });

  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
