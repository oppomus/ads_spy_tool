'use client';
import React, { useState } from 'react';
import Link from 'next/link';

export default function VibeSpyPro() {
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
    } catch (e) { alert("Server Timeout. Check Archive in a moment."); }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#020617] text-slate-100 p-8">
      <div className="max-w-7xl mx-auto flex justify-between items-center mb-16">
        <h1 className="text-4xl font-black italic text-blue-500 uppercase">Spy Pro 2.0</h1>
        <div className="flex gap-2">
          <input value={input} onChange={e => setInput(e.target.value)} placeholder="Page ID..." className="bg-slate-900 border border-slate-800 px-6 py-2 rounded-xl text-sm" />
          <button onClick={handleAnalyze} disabled={loading} className="bg-blue-600 px-8 py-2 rounded-xl font-bold uppercase text-xs transition-all active:scale-95">
            {loading ? 'Analyzing...' : 'Spy Now'}
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto space-y-16">
        {results.map((res, i) => (
          <div key={i} className="bg-slate-900/50 border border-slate-800 rounded-[3rem] p-10 shadow-2xl overflow-hidden">
            <h2 className="text-4xl font-black mb-8 uppercase italic">{res.brand}</h2>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
              <div className="lg:col-span-5 bg-black/40 p-8 rounded-3xl text-sm italic text-slate-300 border border-slate-800 whitespace-pre-wrap leading-relaxed">
                {res.strategy}
              </div>
              <div className="lg:col-span-7 grid grid-cols-2 sm:grid-cols-3 gap-4">
                {res.creatives.map((ad: any) => (
                  <div key={ad.id} className="aspect-[9/16] bg-black rounded-2xl overflow-hidden border border-slate-800 relative">
                    {ad.video ? (
                      <video src={ad.video} controls className="h-full w-full object-cover" poster={ad.thumbnail} />
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full p-4">
                         <img src={ad.thumbnail} className="opacity-30 mb-2" alt="Preview" />
                         <span className="text-[10px] text-red-500 font-bold uppercase">Video Failed</span>
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
