import { NextResponse } from 'next/server';

export const maxDuration = 60; // Сценарии пишутся быстро

export async function POST(req: Request) {
  try {
    const { brand, strategy } = await req.json();
    const geminiKey = "AIzaSyB2Jc3tFV5cwYLjUBDqwAjgClGhwMv8cB8";

    if (!strategy) {
      return NextResponse.json({ error: "No strategy provided" }, { status: 400 });
    }

    console.info(`[SCRIPT] Generating ad script for ${brand}...`);

    // Используем Thinking-модель для креатива
    const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-thinking-exp:generateContent?key=${geminiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `ACT AS A SENIOR CREATIVE COPYWRITER. 
            Based on this UA Analysis of ${brand}: 
            "${strategy}"
            
            TASK: Write a high-converting 30-second video ad script.
            STRUCTURE:
            1. VISUAL HOOK (0-3s): Describe a scroll-stopping visual.
            2. THE PROBLEM/SETTING: Engaging the viewer.
            3. THE GAMEPLAY/SOLUTION: Showcasing the best concept from the analysis.
            4. CALL TO ACTION: Direct and punchy.
            
            FORMAT: Provide the output in Markdown. Use a table for "Visuals" vs "Audio/Voiceover". 
            LANGUAGE: English.`
          }]
        }],
        safetySettings: [
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" }
        ]
      })
    });

    const gData = await geminiRes.json();
    const script = gData.candidates?.[0]?.content?.parts?.[0]?.text || "Failed to generate script.";

    return NextResponse.json({ script });

  } catch (e: any) {
    console.error(`[SCRIPT ERR] ${e.message}`);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
