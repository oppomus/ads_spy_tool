// ... (начало кода с загрузкой в Google File API остается прежним, оно работает идеально)

        if (checkData.state === 'ACTIVE') {
          console.info("[ULTRA] Video is ACTIVE. Indexing (20s)...");
          await new Promise(r => setTimeout(r, 20000)); 
          
          // СПИСОК МОДЕЛЕЙ 2026 ГОДА: От Gemini 3 до проверенных 2.0
          const modelsToTry = [
            'gemini-3-flash',        // Тот самый "Fast" — идеален для видео
            'gemini-3-pro',         // Самый умный для сложного анализа
            'gemini-2.0-flash-001',  // Быстрый стандарт прошлого года
            'gemini-1.5-pro-latest'  // Стабильный олдскул
          ];

          for (const model of modelsToTry) {
            console.info(`[ULTRA DEBUG] Trying model: ${model}...`);
            try {
              const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  contents: [{
                    parts: [
                      { text: "INSTRUCTION: You are a professional UA Creative Strategist. WATCH this video and provide: 1. CORE CONCEPT, 2. VISUAL HOOK (0-3s), 3. MECHANICS, 4. PSYCHOLOGY. Respond ONLY in English." },
                      { file_data: { mime_type: "video/mp4", file_uri: googleFileResource.file.uri } }
                    ]
                  }],
                  safetySettings: [
                    { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                    { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                    { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
                    { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
                  ]
                })
              });

              const gData = await geminiRes.json();

              if (gData.candidates?.[0]?.content?.parts?.[0]?.text) {
                strategy = gData.candidates[0].content.parts[0].text;
                winnerModel = model;
                console.info(`[ULTRA SUCCESS] Win with: ${model}`);
                break; 
              } else {
                console.warn(`[ULTRA FAIL] ${model}: ${gData.error?.message || "Blocked"}`);
              }
            } catch (e) {
              console.error(`[ULTRA CRASH] ${model} unreachable.`);
            }
          }
          break; 
        }
// ...
