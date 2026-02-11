'use client';
import React, { useState } from 'react';
import Link from 'next/link';

export default function VibeSpyPro() {
  const [input, setInput] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const handleAnalyze = async () => {
    setLoading(true);
    const targets = input.split(/[\s,]+/).filter(t => t.trim() !== '');
    for (const target of targets) {
      try {
        const res = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: target }),
        });
        const data = await res.json();
        if (res.ok) setResults(prev => [data, ...prev]);
      } catch (err) { console.error(err); }
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#020617] text-slate-100 p-8">
      <div className="max-w-7xl mx-auto flex justify-between items-center mb-16">
        <div>
          <h1 className="text-4xl font-black text-blue-500 italic uppercase">Spy Pro 2.0</h1>
          <Link href="/archive" className="text-cyan-400 text-xs font-bold uppercase tracking-widest hover:underline block mt-1">
            → Open Intelligence Archive
          </Link>
        </div>
        <div className="flex gap-2">
          <input value={input} onChange={e => setInput(e.target.value)} placeholder="IDs..." className="bg-[#0f172a] border border-slate-800 px-6 py-2 rounded-xl text-sm outline-none" />
          <button onClick={handleAnalyze} disabled={loading} className="bg-blue-600 px-8 py-2 rounded-xl font-bold uppercase text-xs">
            {loading ? 'Analyzing...' : 'Spy Now'}
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto space-y-20">
        {results.map((res, i) => (
          <div key={i} className="bg-[#0f172a] border border-slate-800 rounded-[3rem] p-12 shadow-2xl overflow-hidden">
            <h2 className="text-5xl font-black tracking-tighter uppercase italic mb-10">{res.brand}</h2>
            <div className="grid grid-cols-12 gap-16">
              <div className="col-span-12 lg:col-span-5">
                <h3 className="text-blue-500 text-xs font-black uppercase tracking-widest mb-4">Strategic Teardown</h3>
                <div className="bg-slate-900/60 border border-slate-800 p-8 rounded-[2.5rem] text-slate-300 text-sm leading-relaxed whitespace-pre-wrap font-serif italic">
                  {res.strategy}
                </div>
              </div>
              <div className="col-span-12 lg:col-span-7">
                <h3 className="text-slate-500 text-xs font-black uppercase tracking-widest mb-4">Video Assets (Stored)</h3>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                  {res.creatives.map((ad: any) => (
                    <div key={ad.id} className="relative aspect-[9/16] bg-black rounded-2xl overflow-hidden border border-slate-800 hover:border-blue-500 transition-all group">
                      {ad.video ? (
                        <video src={ad.video} controls className="w-full h-full object-cover" onMouseOver={e => e.currentTarget.play()} onMouseOut={e => e.currentTarget.pause()} />
                      ) : (
                        <div className="flex flex-col items-center justify-center h-full p-2 text-center">
                           <img src={ad.thumbnail} className="opacity-40 mb-2" />
                           <span className="text-[10px] text-red-500 font-bold uppercase">No Video Saved</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
