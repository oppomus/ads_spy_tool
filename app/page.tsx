'use client';
import React, { useState } from 'react';
import Link from 'next/link';

export default function VibeSpyPro() {
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
      } catch (err) {
        console.error("Analysis error:", err);
      }
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#020617] text-slate-100 p-8 font-sans">
      {/* Header Section */}
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6 mb-16">
        <div>
          <h1 className="text-5xl font-black text-blue-500 italic uppercase tracking-tighter">Vibe Spy Pro</h1>
          <div className="flex gap-4 mt-2">
            <p className="text-slate-500 text-xs font-bold tracking-[0.3em] uppercase">Visual Concept Intel</p>
            <Link href="/archive" className="text-cyan-400 text-xs font-bold uppercase tracking-widest hover:underline">
              → Intelligence Archive
            </Link>
          </div>
        </div>
        
        <div className="flex gap-2 w-full md:w-auto">
          <input 
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Paste IDs (comma separated)..." 
            className="bg-[#0f172a] border border-slate-800 px-6 py-4 rounded-2xl w-full md:w-[450px] text-sm focus:ring-2 ring-blue-600 outline-none transition-all shadow-2xl"
          />
          <button 
            onClick={handleAnalyze} 
            disabled={loading} 
            className="bg-blue-600 hover:bg-blue-500 px-10 py-4 rounded-2xl font-black uppercase text-xs transition-all active:scale-95 disabled:opacity-50 shadow-xl shadow-blue-600/20"
          >
            {loading ? 'Analyzing Videos...' : 'Spy Now'}
          </button>
        </div>
      </div>

      {/* Main Feed */}
      <div className="max-w-7xl mx-auto space-y-20">
        {results.length === 0 && !loading && (
          <div className="text-center py-40 border-2 border-dashed border-slate-800 rounded-[3rem]">
            <p className="text-slate-600 font-bold uppercase tracking-widest">No active analysis. Enter IDs to start spying.</p>
          </div>
        )}

        {results.map((res, i) => (
          <div key={i} className="bg-[#0f172a] border border-slate-800 rounded-[4rem] p-12 shadow-2xl relative overflow-hidden animate-in fade-in slide-in-from-bottom-6 duration-1000">
            <div className="flex flex-col md:flex-row justify-between items-baseline mb-12 gap-4">
              <h2 className="text-6xl font-black tracking-tighter uppercase italic">{res.brand}</h2>
              <span className="bg-blue-600/10 text-blue-500 text-[10px] px-4 py-2 rounded-full border border-blue-500/20 font-black uppercase tracking-[0.2em]">
                Video Concept Analysis
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-16">
              {/* Left: AI Visual Teardown */}
              <div className="lg:col-span-5">
                <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-6">Strategic Concepts</h3>
                <div className="bg-slate-900/80 border border-slate-800 p-10 rounded-[3rem] shadow-inner">
                  <div className="text-slate-300 text-sm leading-relaxed whitespace-pre-wrap font-serif italic">
                    {res.strategy}
                  </div>
                </div>
              </div>

              {/* Right: Video Grid */}
              <div className="lg:col-span-7">
                <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-6">Visual Evidence (Stored in Archive)</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
                  {res.creatives.map((ad: any) => (
                    <div key={ad.id} className="relative aspect-[9/16] bg-black rounded-3xl overflow-hidden group border border-slate-800 hover:border-blue-500 transition-all duration-500 shadow-2xl">
                      {ad.video ? (
                        <video 
                          src={ad.video} 
                          poster={ad.thumbnail}
                          controls
                          className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                        />
                      ) : (
                        <img src={ad.thumbnail} alt="Creative" className="w-full h-full object-cover opacity-60" />
                      )}
                      
                      {!ad.video && (
                        <div className="absolute inset-0 flex items-center justify-center">
                           <div className="bg-red-500/20 text-red-500 text-[8px] font-bold px-2 py-1 rounded uppercase">Image Only</div>
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
