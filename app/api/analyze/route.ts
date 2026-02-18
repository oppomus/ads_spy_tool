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

    // 1. Скрапинг
    const apifyRes = await fetch(`https://api.apify.com/v2/acts/curious_coder~facebook-ads-library-scraper/run-sync-get-dataset-items?token=${token}&timeout=60&maxChargedResults=10`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ "urls": [{ "url": `https://www.facebook.com/ads/library/?view_all_page_id=${pageId}&active_status=active&ad_type=all&country=ALL&sort_data[direction]=desc&sort_data[mode]=total_impressions` }], "count": 10, "scrapeAdDetails": true })
    });
    const data = await apifyRes.json();
    
    const processedCreatives = [];
    const googleFileUris = [];

    // 2. Загрузка (Google + Supabase)
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
          body: JSON.stringify({ file: { display_name: `id_${adId}` } }) // ID в имени для ИИ
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
          concept: 'All' // По умолчанию
        });
      } catch (e) { console.error(`Err: ${adId}`); }
    }

    // 3. Ждем готовности
    if (googleFileUris.length > 0) {
      await new Promise(r => setTimeout(r, 15000));
    }

    // 4. Анализ с ТЕГИРОВАНИЕМ
    let finalStrategy = "Analysis failed.";
    if (googleFileUris.length > 0) {
      const promptParts: any[] = [
        { text: `INSTRUCTION: Analyze these videos. 
          1. Create a Strategic Report in Markdown.
          2. Group them into Concepts: Misleading, Gameplay, UGC, or Cinematic.
          3. IMPORTANT: At the very end of your response, provide a JSON mapping exactly like this:
          TAGS_START
          [{"id": "video_id", "concept": "ConceptName"}]
          TAGS_END
          Use the actual Ad IDs provided in the file names.` }
      ];
      googleFileUris.forEach(f => promptParts.push({ file_data: { mime_type: "video/mp4", file_uri: f.uri } }));

      const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${geminiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: promptParts }] })
      });

      const gData = await geminiRes.json();
      const rawText = gData.candidates?.[0]?.content?.parts?.[0]?.text || "";

      // Вытаскиваем JSON теги из текста
      const jsonMatch = rawText.match(/TAGS_START([\s\S]*?)TAGS_END/);
      if (jsonMatch) {
        try {
          const tags = JSON.parse(jsonMatch[1].trim());
          // Присваиваем концепты нашим видео
          processedCreatives.forEach(ad => {
            const tag = tags.find((t: any) => t.id.includes(ad.id));
            if (tag) ad.concept = tag.concept;
          });
          // Очищаем основной текст от JSON-блока для красоты
          finalStrategy = rawText.replace(/TAGS_START[\s\S]*?TAGS_END/, "").trim();
        } catch (e) { 
          finalStrategy = rawText; 
        }
      } else {
        finalStrategy = rawText;
      }
    }

    const brandName = data[0]?.snapshot?.page_name || "Brand";
    await supabase.from('ads_library').insert([{ page_id: pageId, brand_name: brandName, strategy_analysis: finalStrategy, creatives: processedCreatives }]);

    return NextResponse.json({ brand: brandName, strategy: finalStrategy, creatives: processedCreatives });

  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
