'use client';
import React, { useState } from 'react';
import Link from 'next/link';

export default function VibeSpyMain() {
  const [input, setInput] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const handleAnalyze = async () => {
    if (!input) return;
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
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6 mb-16">
        <div>
          <h1 className="text-4xl font-black text-blue-500 italic uppercase">Spy Pro 2.0</h1>
          <Link href="/archive" className="text-cyan-400 text-xs font-bold uppercase tracking-widest hover:underline mt-1 block">
            → Open Intelligence Archive
          </Link>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <input 
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="IDs (e.g. 131427027065541)" 
            className="bg-[#0f172a] border border-slate-800 px-6 py-3 rounded-2xl w-full md:w-96 text-sm outline-none focus:ring-2 ring-blue-600"
          />
          <button onClick={handleAnalyze} disabled={loading} className="bg-blue-600 hover:bg-blue-500 px-10 py-3 rounded-2xl font-black uppercase text-[10px] tracking-widest disabled:opacity-50">
            {loading ? 'Processing...' : 'Spy Now'}
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto space-y-20">
        {results.map((res, i) => (
          <div key={i} className="bg-[#0f172a] border border-slate-800 rounded-[3rem] p-12 shadow-2xl overflow-hidden">
            <h2 className="text-5xl font-black tracking-tighter uppercase mb-12 italic">{res.brand}</h2>
            
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-16">
              <div className="lg:col-span-5">
                <h3 className="text-blue-500 text-[10px] font-black uppercase tracking-[0.3em] mb-4 italic">Concept Teardown</h3>
                <div className="bg-slate-900/60 border border-slate-800 p-8 rounded-[2rem] shadow-inner">
                  <div className="text-slate-300 text-sm leading-relaxed whitespace-pre-wrap font-serif">
                    {res.strategy}
                  </div>
                </div>
              </div>

              <div className="lg:col-span-7">
                <h3 className="text-slate-500 text-[10px] font-black uppercase tracking-[0.3em] mb-4 italic">Stored Visuals</h3>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                  {res.creatives.map((ad: any) => (
                    <div key={ad.id} className="relative aspect-[9/16] bg-black rounded-2xl overflow-hidden group border border-slate-800 hover:border-blue-500 transition-all shadow-xl">
                      {ad.video ? (
                        <video 
                          src={ad.video} 
                          poster={ad.thumbnail}
                          controls 
                          className="w-full h-full object-cover opacity-80 group-hover:opacity-100" 
                        />
                      ) : (
                        <img src={ad.thumbnail} alt="Fallback" className="w-full h-full object-cover opacity-50" />
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
