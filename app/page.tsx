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
    if (!input) return alert("Enter Page ID");
    setLoading(true);
    try {
      const res = await fetch('/api/analyze', { method: 'POST', body: JSON.stringify({ url: input }) });
      const data = await res.json();
      if (res.ok) setResults([data, ...results]);
    } catch (e) { alert("Timeout. Check archive."); }
    setLoading(false);
  };

  const handleGenerateScript = async (brand: string, strategy: string) => {
    setScriptLoading(true);
    setGeneratedScript('');
    try {
      const res = await fetch('/api/generate-script', { method: 'POST', body: JSON.stringify({ brand, strategy }) });
      const data = await res.json();
      if (data.script) setGeneratedScript(data.script);
    } catch (e) { alert("Failed to generate."); }
    setScriptLoading(false);
  };

  const concepts = ['All', 'Misleading', 'Gameplay', 'UGC', 'Cinematic'];

  return (
    <div className="min-h-screen bg-[#020617] text-slate-100 p-8 font-sans pb-40">
      <div className="max-w-7xl mx-auto flex justify-between items-center mb-16 border-b border-slate-800 pb-8">
        <h1 className="text-4xl font-black italic uppercase text-blue-500 tracking-tighter">Spy Pro 2.0</h1>
        <div className="flex gap-4">
          <input value={input} onChange={e => setInput(e.target.value)} placeholder="Page ID..." className="bg-slate-900 border border-slate-800 px-6 py-3 rounded-2xl w-80 outline-none focus:ring-2 ring-blue-500 transition-all" />
          <button onClick={handleAnalyze} disabled={loading} className="bg-blue-600 px-10 py-3 rounded-2xl font-black uppercase text-xs hover:bg-blue-500 transition-all">
            {loading ? 'Crunching...' : 'Spy Now'}
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto space-y-32">
        {results.map((res, i) => (
          <div key={i} className="animate-in fade-in slide-in-from-bottom-8 duration-700">
            <h2 className="text-8xl font-black mb-12 uppercase italic tracking-tighter text-white">{res.brand}</h2>

            {/* ТАБЫ ФИЛЬТРОВ */}
            <div className="flex gap-3 mb-12">
              {concepts.map(c => (
                <button key={c} onClick={() => setActiveFilter(c)} className={`px-8 py-3 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all ${activeFilter === c ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-900 border-slate-800 text-slate-500'}`}>
                  {c}
                </button>
              ))}
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
              {/* АНАЛИЗ */}
              <div className="lg:col-span-7">
                <div className="bg-slate-900/40 border border-slate-800 p-12 rounded-[4rem] shadow-2xl backdrop-blur-md">
                  <div className="prose prose-invert max-w-none text-slate-300 mb-10">
                    <ReactMarkdown components={{
                      h3: ({...props}) => <h3 className="text-2xl font-black text-blue-400 mt-8 mb-4 uppercase italic" {...props} />,
                      li: ({...props}) => <li className="mb-2 list-disc ml-4 text-slate-400" {...props} />,
                      strong: ({...props}) => <b className="text-white font-black" {...props} />,
                    }}>
                      {res.strategy}
                    </ReactMarkdown>
                  </div>

                  <button 
                    onClick={() => handleGenerateScript(res.brand, res.strategy)}
                    disabled={scriptLoading}
                    className="w-full bg-gradient-to-r from-blue-600 to-cyan-500 py-6 rounded-3xl font-black uppercase text-xs shadow-xl shadow-blue-900/20 active:scale-95 transition-all"
                  >
                    {scriptLoading ? '🪄 Writing...' : '🪄 Generate Ad Script'}
                  </button>

                  {generatedScript && (
                    <div className="mt-12 p-10 bg-blue-900/20 border-2 border-blue-500/20 rounded-[2.5rem] animate-in zoom-in-95">
                      <h3 className="text-xl font-black mb-6 uppercase text-white flex items-center gap-3">
                        <span>📝</span> New Ad Script
                      </h3>
                      <div className="prose prose-invert max-w-none text-sm"><ReactMarkdown>{generatedScript}</ReactMarkdown></div>
                    </div>
                  )}
                </div>
              </div>

              {/* СЕТКА ВИДЕО */}
              <div className="lg:col-span-5 grid grid-cols-2 gap-4 h-fit sticky top-10">
                {res.creatives?.filter((ad: any) => activeFilter === 'All' || ad.concept === activeFilter).map((ad: any) => (
                  <div key={ad.id} className="aspect-[9/16] bg-black rounded-[2.5rem] overflow-hidden border border-slate-800 relative group shadow-2xl">
                    <video src={ad.video} poster={ad.thumbnail} controls className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110" />
                    <div className="absolute top-4 left-4 bg-blue-600/90 text-[8px] font-black uppercase px-3 py-1 rounded-full backdrop-blur-sm">
                      {ad.concept}
                    </div>
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
