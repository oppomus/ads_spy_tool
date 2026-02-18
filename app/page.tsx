'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';

export default function VibeSpyMain() {
  const [input, setInput] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeFilter, setActiveFilter] = useState('All');
  const [scriptLoading, setScriptLoading] = useState(false);
  const [generatedScript, setGeneratedScript] = useState('');

  const handleAnalyze = async () => {
    if (!input) return alert("Please enter a Page ID");
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
    } catch (e) { alert("Timeout. Check Archive in 2 mins."); }
    setLoading(false);
  };

  const handleGenerateScript = async (brandName: string, strategyText: string) => {
    setScriptLoading(true);
    setGeneratedScript('');
    try {
      const res = await fetch('/api/generate-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand: brandName, strategy: strategyText }),
      });
      const data = await res.json();
      if (data.script) setGeneratedScript(data.script);
    } catch (e) { alert("Failed."); }
    setScriptLoading(false);
  };

  const concepts = ['All', 'Misleading', 'Gameplay', 'UGC', 'Cinematic'];

  return (
    <div className="min-h-screen bg-[#020617] text-slate-100 p-8 font-sans pb-40">
      <div className="max-w-7xl mx-auto flex justify-between items-center mb-16 border-b border-slate-800 pb-8">
        <div>
          <h1 className="text-4xl font-black italic uppercase text-blue-500 tracking-tighter leading-none">Spy Pro 2.0</h1>
          <Link href="/archive" className="text-cyan-400 text-[10px] font-bold uppercase tracking-widest mt-2 block">→ Archive</Link>
        </div>
        <div className="flex gap-4">
          <input value={input} onChange={e => setInput(e.target.value)} placeholder="Page ID..." className="bg-slate-900 border border-slate-800 px-6 py-3 rounded-2xl text-sm outline-none focus:ring-2 ring-blue-500 w-80" />
          <button onClick={handleAnalyze} disabled={loading} className="bg-blue-600 px-10 py-3 rounded-2xl font-black uppercase text-xs active:scale-95 transition-all">
            {loading ? 'Analyzing...' : 'Spy Now'}
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto space-y-32">
        {results.map((res, i) => (
          <div key={i} className="animate-in fade-in slide-in-from-bottom-8 duration-700">
            <h2 className="text-8xl font-black mb-8 uppercase italic tracking-tighter text-white">{res.brand}</h2>

            <div className="flex gap-3 mb-12">
              {concepts.map(c => (
                <button key={c} onClick={() => setActiveFilter(c)} className={`px-6 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all border ${activeFilter === c ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-900 border-slate-800 text-slate-500'}`}>
                  {c}
                </button>
              ))}
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-16">
              {/* ANALYSIS BLOCK */}
              <div className="lg:col-span-7">
                <div className="bg-slate-900/60 border border-slate-800 p-12 rounded-[3.5rem] shadow-2xl">
                  <div className="prose prose-invert max-w-none text-slate-300 mb-12">
                    <ReactMarkdown components={{
                      h3: ({...props}) => <h3 className="text-2xl font-black text-blue-400 mb-4 uppercase" {...props} />,
                      li: ({...props}) => <li className="mb-2 list-disc ml-4" {...props} />,
                      strong: ({...props}) => <b className="text-white font-black" {...props} />,
                    }}>
                      {res.strategy}
                    </ReactMarkdown>
                  </div>

                  <button onClick={() => handleGenerateScript(res.brand, res.strategy)} disabled={scriptLoading} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black uppercase text-xs py-6 rounded-3xl shadow-xl shadow-blue-900/40">
                    {scriptLoading ? '🪄 Writing...' : '🪄 Generate New Ad Script'}
                  </button>

                  {generatedScript && (
                    <div className="mt-12 p-8 bg-blue-900/20 border-2 border-blue-500/20 rounded-3xl animate-in zoom-in-95">
                      <h3 className="text-xl font-black mb-6 uppercase text-white">Ad Script</h3>
                      <div className="prose prose-invert max-w-none text-sm"><ReactMarkdown>{generatedScript}</ReactMarkdown></div>
                    </div>
                  )}
                </div>
              </div>

              {/* VIDEO GRID */}
              <div className="lg:col-span-5 grid grid-cols-2 gap-4 h-fit sticky top-10">
                {res.creatives?.filter((ad: any) => activeFilter === 'All' || ad.concept === activeFilter).map((ad: any) => (
                  <div key={ad.id} className="aspect-[9/16] bg-black rounded-[2.5rem] overflow-hidden border border-slate-800 relative group">
                    <video src={ad.video} poster={ad.thumbnail} controls className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110" />
                    <div className="absolute top-4 left-4 bg-blue-600 text-[8px] font-black uppercase px-2 py-1 rounded-full">{ad.concept}</div>
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
