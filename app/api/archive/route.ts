import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Используем анонимный ключ для чтения, так как политики SELECT мы уже настроили
const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

// Для простых GET-запросов лимит времени не так важен, но поставим 30с для стабильности
export const maxDuration = 30;

export async function GET() {
  try {
    // Вытягиваем всю историю запусков, сортируя от новых к старым
    const { data, error } = await supabase
      .from('ads_library')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error("[ARCHIVE ERROR] Fetch failed:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Возвращаем данные. На фронте они попадут в переменную и отрисуются
    return NextResponse.json(data);

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
