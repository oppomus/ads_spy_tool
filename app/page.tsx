'use client';
import React, { useState } from 'react';
import Link from 'next/link';

export default function SpyMainPage() {
  const [input, setInput] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const handleAnalyze = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: input }),
      });
      const data = await res.json();
      if (res.ok) setResults([data, ...results]);
      else alert("Error: " + data.error);
    } catch (e) { alert("Timeout. Check Archive in a few mins."); }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#020617] text-slate-100 p-8">
      <div className="max-w-7xl mx-auto flex justify-between items-center mb-16 border-b border-slate-800 pb-8">
        <div>
          <h1 className="text-4xl font-black italic uppercase text-blue-500 tracking-tighter">Spy Pro 2.0</h1>
          <Link href="/archive" className="text-cyan-400 text-[10px] font-bold uppercase tracking-widest hover:underline mt-1 block">
            → Open Intelligence Archive
          </Link>
        </div>
        <div className="flex gap-4">
          <input value={input} onChange={e => setInput(e.target.value)} placeholder="Enter Page ID..." className="bg-slate-900 border border-slate-800 px-6 py-3 rounded-2xl text-sm outline-none focus:ring-2 ring-blue-500 w-80" />
          <button onClick={handleAnalyze} disabled={loading} className="bg-blue-600 hover:bg-blue-500 px-10 py-3 rounded-2xl font-black uppercase text-xs transition-all">
            {loading ? 'Analyzing...' : 'Spy Now'}
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto space-y-24">
        {results.map((res, i) => (
          <div key={i} className="animate-in fade-in slide-in-from-bottom-8">
            <h2 className="text-5xl font-black mb-12 uppercase italic text-white">{res.brand}</h2>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
              <div className="lg:col-span-6 bg-slate-900/40 border border-slate-800 p-10 rounded-[3rem] shadow-2xl overflow-hidden">
                <div className="text-slate-300 text-sm leading-relaxed whitespace-pre-wrap">
                   {res.strategy}
                </div>
              </div>
              <div className="lg:col-span-6 grid grid-cols-2 gap-4">
                {res.creatives.map((ad: any) => (
                  <div key={ad.id} className="aspect-[9/16] bg-black rounded-[2rem] overflow-hidden border border-slate-800 shadow-xl relative">
                    {ad.video ? (
                      <video src={ad.video} poster={ad.thumbnail} controls preload="metadata" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex items-center justify-center h-full bg-slate-900 uppercase italic opacity-20 text-[10px]">No Media</div>
                    )}
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
