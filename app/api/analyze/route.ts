import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { url } = await req.json();
    const APIFY_TOKEN = process.env.APIFY_TOKEN;
    const GEMINI_KEY = process.env.GEMINI_API_KEY;

    // 1. Запускаем скрапер и ЖДЕМ (добавляем параметр wait=60)
    // Мы просим Apify поработать 60 секунд и сразу отдать результат
    const runResponse = await fetch(
      `https://api.apify.com/v2/acts/apify~facebook-ads-library-scraper/run-sync-get-dataset-items?token=${APIFY_TOKEN}&limit=1`, 
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ "searchQuery": url, "limit": 1 })
      }
    );

    const adsData = await runResponse.json();
    const topAd = adsData[0]; // Берем самое первое (топовое) объявление

    if (!topAd) {
      return NextResponse.json({ error: 'Реклама не найдена' }, { status: 404 });
    }

    // 2. Теперь отправляем данные в Gemini
    // Мы просим ИИ проанализировать текст объявления
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `Ты эксперт по рекламе. Проанализируй этот текст объявления из Facebook и определи: 
              1. Тип хука (зацепки). 
              2. Главный оффер. 
              Ответь коротко. 
              Текст объявления: ${topAd.adCopy}`
            }]
          }]
        })
      }
    );

    const geminiData = await geminiResponse.json();
    const aiAnalysis = geminiData.candidates[0].content.parts[0].text;

    // 3. Возвращаем результат на твой сайт
// Временно замени логику в route.ts для проверки связи:
return NextResponse.json([{
  id: Date.now(),
  brand: 'ТЕСТОВАЯ СВЯЗЬ',
  hook: 'Если ты это видишь, значит кнопки работают! Можно подключать скрапер.',
  impressions: '100k',
  status: 'SUCCESS'
}]);

  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Ошибка в процессе анализа' }, { status: 500 });
  }
}