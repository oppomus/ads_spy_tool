'use client';
import React, { useState } from 'react';
import Link from 'next/link';

export default function VibeSpyMain() {
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
    <div className="min-h-screen bg-[#020617] text-slate-100 p-8 font-sans">
      <div className="max-w-7xl mx-auto flex justify-between items-center mb-16">
        <div>
          <h1 className="text-4xl font-black text-blue-500 italic uppercase">Spy Pro 2.0</h1>
          <Link href="/archive" className="text-blue-400 text-xs font-bold uppercase tracking-widest hover:underline mt-1 block">
            → Open Intelligence Archive
          </Link>
        </div>
        <div className="flex gap-2">
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Enter IDs (comma separated)..." className="bg-[#0f172a] border border-slate-800 px-6 py-3 rounded-2xl w-96 text-sm outline-none focus:ring-2 ring-blue-600" />
          <button onClick={handleAnalyze} disabled={loading} className="bg-blue-600 px-8 py-3 rounded-2xl font-black uppercase text-xs active:scale-95 transition-all disabled:opacity-50">
            {loading ? 'Analyzing Top 10...' : 'Spy Now'}
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto space-y-16">
        {results.map((res, i) => (
          <div key={i} className="bg-[#0f172a] border border-slate-800 rounded-[3rem] p-12 shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4">
            <h2 className="text-5xl font-black tracking-tighter uppercase mb-12 italic">{res.brand}</h2>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-16">
              <div className="lg:col-span-5 space-y-4">
                <h3 className="text-blue-500 text-xs font-black uppercase tracking-widest">Video Concepts Teardown</h3>
                <div className="bg-slate-900/60 border border-slate-800 p-8 rounded-[2.5rem] text-slate-300 text-sm leading-relaxed italic whitespace-pre-wrap">{res.strategy}</div>
              </div>
              <div className="lg:col-span-7 space-y-4">
                <h3 className="text-slate-500 text-xs font-black uppercase tracking-widest">Visual Evidence</h3>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                  {res.creatives.map((ad: any) => (
                    <a key={ad.id} href={ad.link} target="_blank" className="relative aspect-[9/16] bg-black rounded-2xl overflow-hidden group border border-slate-800 hover:border-blue-500 transition-all">
                      <img src={ad.thumbnail} alt="" className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity" />
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-white">
                        <svg className="w-8 h-8 opacity-70 group-hover:scale-110 transition-transform" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                      </div>
                    </a>
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
