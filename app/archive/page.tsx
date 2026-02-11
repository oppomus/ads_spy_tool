'use client';
import React, { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import ReactMarkdown from 'react-markdown';
import Link from 'next/link';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

export default function ArchivePage() {
  const [history, setHistory] = useState<any[]>([]);

  useEffect(() => {
    const fetchHistory = async () => {
      const { data } = await supabase
        .from('ads_library')
        .select('*')
        .order('created_at', { ascending: false });
      if (data) setHistory(data);
    };
    fetchHistory();
  }, []);

  return (
    <div className="min-h-screen bg-[#020617] text-white p-8">
      <div className="max-w-7xl mx-auto mb-16 flex items-center justify-between">
        <Link href="/" className="text-cyan-400 uppercase text-[10px] font-bold tracking-widest hover:underline">
          ← Back to Scanner
        </Link>
        <h1 className="text-2xl font-black italic uppercase text-blue-500">Intelligence Archive</h1>
      </div>

      <div className="max-w-7xl mx-auto space-y-32">
        {history.map((item) => (
          <div key={item.id} className="border-t border-slate-800 pt-16">
            <div className="flex justify-between items-baseline mb-12">
              <h2 className="text-5xl font-black uppercase italic">{item.brand_name}</h2>
              <span className="text-slate-500 text-xs font-mono">{new Date(item.created_at).toLocaleDateString()}</span>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
              <div className="lg:col-span-6 bg-slate-900/40 p-10 rounded-[3rem] border border-slate-800 shadow-2xl">
                <div className="prose prose-invert prose-sm">
                  <ReactMarkdown>{item.strategy_analysis}</ReactMarkdown>
                </div>
              </div>
              
              <div className="lg:col-span-6 grid grid-cols-2 gap-4">
                {item.creatives?.map((ad: any) => (
                  <div key={ad.id} className="aspect-[9/16] bg-black rounded-[2rem] overflow-hidden border border-slate-800">
                    <video src={ad.video} poster={ad.thumbnail} controls preload="metadata" className="h-full w-full object-cover" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
