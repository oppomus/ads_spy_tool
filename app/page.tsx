'use client';
import React, { useState } from 'react';
import Link from 'next/link';

export default function VibeSpyFinal() {
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
      else alert(data.error || "Analysis failed");
    } catch (e) { alert("Check Vercel Logs"); }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#020617] text-slate-100 p-8 font-sans">
      <div className="max-w-7xl mx-auto flex justify-between items-center mb-16">
        <h1 className="text-3xl font-black italic uppercase text-blue-500">Spy Pro 2.0</h1>
        <div className="flex gap-2">
          <input 
            value={input} onChange={e => setInput(e.target.value)} 
            placeholder="Page ID..." 
            className="bg-slate-900 border border-slate-800 px-4 py-2 rounded-xl text-sm" 
          />
          <button onClick={handleAnalyze} disabled={loading} className="bg-blue-600 px-6 py-2 rounded-xl font-bold uppercase text-xs">
            {loading ? 'Processing...' : 'Analyze'}
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto space-y-16">
        {results.map((res, i) => (
          <div key={i} className="bg-slate-900/40 border border-slate-800 rounded-[2.5rem] p-10 shadow-2xl">
            <h2 className="text-3xl font-black uppercase mb-8 italic">{res.brand}</h2>
            <div className="grid grid-cols-12 gap-8">
              <div className="col-span-12 lg:col-span-4 bg-black/30 p-6 rounded-2xl text-sm text-slate-300 italic whitespace-pre-wrap border border-slate-800">
                {res.strategy}
              </div>
              <div className="col-span-12 lg:col-span-8 grid grid-cols-2 sm:grid-cols-5 gap-3">
                {res.creatives.map((ad: any) => (
                  <div key={ad.id} className="aspect-[9/16] bg-black rounded-xl overflow-hidden border border-slate-800 relative">
                    {ad.video ? (
                      <video src={ad.video} controls className="h-full w-full object-cover" poster={ad.thumbnail} />
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full p-4 text-center">
                         <img src={ad.thumbnail} className="opacity-30 mb-2" alt="" />
                         <span className="text-[8px] text-red-500 font-bold uppercase italic">Video failed to save</span>
                      </div>
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
