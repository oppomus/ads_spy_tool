'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';

export default function ArchivePage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/archive').then(res => res.json()).then(data => { setItems(data); setLoading(false); });
  }, []);

  return (
    <div className="min-h-screen bg-[#020617] text-slate-100 p-8 font-sans">
      <div className="max-w-7xl mx-auto flex justify-between items-center mb-16">
        <div>
          <Link href="/" className="text-blue-500 text-xs font-bold uppercase tracking-widest hover:underline">← Back to Spy Tool</Link>
          <h1 className="text-4xl font-black text-white italic uppercase tracking-tighter mt-2">Intelligence Archive</h1>
        </div>
        <div className="text-right">
          <p className="text-slate-500 text-xs font-bold uppercase tracking-widest italic">Total Analyzed Brands</p>
          <p className="text-4xl font-black text-blue-500">{items.length}</p>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-20 text-slate-500 font-black uppercase tracking-widest animate-pulse">Accessing Secure Storage...</div>
      ) : (
        <div className="max-w-7xl mx-auto space-y-12">
          {items.map((res, i) => (
            <div key={i} className="bg-[#0f172a] border border-slate-800 rounded-[3rem] p-10 shadow-2xl">
              <h2 className="text-4xl font-black uppercase italic mb-10">{res.brand_name}</h2>
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
                <div className="lg:col-span-5">
                  <h3 className="text-blue-500 text-xs font-bold uppercase mb-4 tracking-widest">Archived Strategy Analysis</h3>
                  <div className="bg-slate-900/60 border border-slate-800 p-8 rounded-[2rem] text-slate-300 text-sm leading-relaxed italic whitespace-pre-wrap">{res.strategy_analysis}</div>
                </div>
                <div className="lg:col-span-7">
                  <h3 className="text-slate-500 text-xs font-bold uppercase mb-4 tracking-widest">Creative Snapshot</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                    {res.creatives?.map((ad: any, idx: number) => (
                      <a key={idx} href={ad.link} target="_blank" className="relative aspect-[9/16] bg-black rounded-2xl overflow-hidden border border-slate-800"><img src={ad.thumbnail} alt="" className="w-full h-full object-cover opacity-60" /></a>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
