import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '');

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  try {
    if (id) {
      // Если передан ID, отдаем один конкретный отчет
      const { data, error } = await supabase.from('ads_library').select('*').eq('id', id).single();
      if (error) throw error;
      return NextResponse.json(data);
    } else {
      // Иначе отдаем весь список для главной страницы архива
      const { data, error } = await supabase.from('ads_library').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return NextResponse.json(data);
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
