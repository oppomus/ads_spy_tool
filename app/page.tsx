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
      const res = await fetch('/api/analyze', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: input }) 
      });
      const data = await res.json();
      if (res.ok) {
        setResults([data, ...results]);
      } else {
        alert("Error: " + data.error);
      }
    } catch (e) { 
      alert("Analysis failed. Check your API routes."); 
    }
    setLoading(false);
  };

  const handleGenerateScript = async (brand: string, strategy: string) => {
    setScriptLoading(true);
    try {
      const res = await fetch('/api/generate-script', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand, strategy }) 
      });
      const data = await res.json();
      setGeneratedScript(data.script);
    } catch (e) { 
      alert("Script failed."); 
    }
    setScriptLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#020617] text-white p-8 font-sans">
      {/* HEADER */}
      <div className="max-w-7xl mx-auto flex justify-between items-center mb-16 border-b border-slate-800 pb-8">
        <h1 className="text-4xl font-black italic text-blue-500 uppercase">Spy Pro 2.0</h1>
        <div className="flex gap-4">
          <input 
            value={input} 
            onChange={e => setInput(e.target.value)} 
            placeholder="Page ID..." 
            className="bg-slate-900 border border-slate-800 px-6 py-3 rounded-2xl w-80 outline-none focus:ring-2 ring-blue-500 transition-all" 
          />
          <button 
            onClick={handleAnalyze} 
            disabled={loading} 
            className="bg-blue-600 px-10 py-3 rounded-2xl font-black uppercase text-xs active:scale-95"
          >
            {loading ? 'Crunching...' : 'Spy Now'}
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto space-y-24">
        {results.map((res, i) => (
          <div key={i} className="animate-in fade-in slide-in-from-bottom-4 duration-700">
            <h2 className="text-7xl font-black mb-8 uppercase italic">{res.brand}</h2>
            
            {/* FILTERS */}
            <div className="flex gap-3 mb-12">
              {['All', 'Misleading', 'Gameplay', 'UGC', 'Cinematic'].map(c => (
                <button 
                  key={c} 
                  onClick={() => setActiveFilter(c)} 
                  className={`px-6 py-2 rounded-full text-[10px] font-black uppercase border transition-all ${activeFilter === c ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-900 border-slate-800 text-slate-500'}`}
                >
                  {c}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
              {/* ANALYSIS BLOCK */}
              <div className="lg:col-span-7 bg-slate-900/40 border border-slate-800 p-10 rounded-[3.5rem] backdrop-blur-md">
                <div className="prose prose-invert max-w-none text-slate-300 mb-10">
                  <ReactMarkdown>{res.strategy}</ReactMarkdown>
                </div>
                
                <button 
                  onClick={() => handleGenerateScript(res.brand, res.strategy)} 
                  disabled={scriptLoading}
                  className="w-full bg-blue-600 py-5 rounded-3xl font-black uppercase text-xs hover:bg-blue-500 transition-all shadow-lg"
                >
                  {scriptLoading ? 'Writing...' : '🪄 Generate Ad Script'}
                </button>

                {generatedScript && (
                  <div className="mt-10 p-8 bg-blue-900/20 rounded-3xl border border-blue-500/20 prose prose-invert max-w-none">
                    <ReactMarkdown>{generatedScript}</ReactMarkdown>
                  </div>
                )}
              </div>

              {/* VIDEO GRID */}
              <div className="lg:col-span-5 grid grid-cols-2 gap-4 h-fit sticky top-10">
                {res.creatives
                  ?.filter((ad: any) => activeFilter === 'All' || ad.concept === activeFilter)
                  .map((ad: any) => (
                  <div key={ad.id} className="aspect-[9/16] bg-black rounded-[2.5rem] overflow-hidden border border-slate-800 relative group">
                    <video 
                      src={ad.video} 
                      poster={ad.thumbnail} 
                      controls 
                      className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110" 
                    />
                    <div className="absolute top-4 left-4 bg-blue-600 text-[8px] font-black uppercase px-3 py-1 rounded-full shadow-lg">
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
