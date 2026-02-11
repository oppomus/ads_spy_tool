'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';

export default function ArchivePage() {
  const [history, setHistory] = useState<any[]>([]);

  useEffect(() => {
    const fetchHistory = async () => {
      const res = await fetch('/api/archive');
      const data = await res.json();
      if (res.ok) setHistory(data);
    };
    fetchHistory();
  }, []);

  return (
    <div className="min-h-screen bg-[#020617] text-white p-8">
      <div className="max-w-7xl mx-auto mb-16 flex items-center justify-between border-b border-slate-800 pb-8">
        <Link href="/" className="text-cyan-400 uppercase text-[10px] font-bold tracking-widest hover:underline">
          ← Back to Scanner
        </Link>
        <h1 className="text-3xl font-black italic uppercase text-blue-500">Intelligence Archive</h1>
      </div>

      <div className="max-w-7xl mx-auto space-y-32">
        {history.map((item) => (
          <div key={item.id} className="animate-in fade-in duration-1000">
            <div className="flex justify-between items-baseline mb-12">
              <h2 className="text-6xl font-black uppercase italic">{item.brand_name}</h2>
              <span className="text-slate-500 text-xs font-mono">{new Date(item.created_at).toLocaleDateString()}</span>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
              <div className="lg:col-span-6 bg-slate-900/40 p-10 rounded-[3rem] border border-slate-800 shadow-2xl">
                <div className="text-slate-300 text-sm leading-relaxed whitespace-pre-wrap font-sans">
                  {item.strategy_analysis}
                </div>
              </div>
              <div className="lg:col-span-6 grid grid-cols-2 gap-4">
                {item.creatives?.map((ad: any) => (
                  <div key={ad.id} className="aspect-[9/16] bg-black rounded-[2.5rem] overflow-hidden border border-slate-800">
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
