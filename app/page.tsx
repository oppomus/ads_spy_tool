// Добавь в начало файла: npm install react-markdown
import ReactMarkdown from 'react-markdown';

// Внутри компонента, где ты выводишь результат (strategy_analysis):
<div className="mt-8 bg-slate-900/50 rounded-2xl border border-slate-800 p-8">
  <div className="flex items-center gap-3 mb-6">
    <div className="w-2 h-8 bg-blue-500 rounded-full" />
    <h2 className="text-2xl font-bold text-white">Strategic Concept Analysis</h2>
  </div>
  
  <div className="prose prose-invert max-w-none text-slate-300">
    {/* Мы используем ReactMarkdown для красивого рендеринга заголовков и списков */}
    <ReactMarkdown 
      components={{
        h3: ({node, ...props}) => <h3 className="text-xl font-semibold text-blue-400 mt-8 mb-4 border-b border-slate-800 pb-2" {...props} />,
        strong: ({node, ...props}) => <span className="text-white font-bold" {...props} />,
        li: ({node, ...props}) => <li className="mb-2 list-disc ml-4" {...props} />,
      }}
    >
      {analysis.strategy}
    </ReactMarkdown>
  </div>
</div>

'use client';
import React, { useState } from 'react';
import Link from 'next/link';

export default function VibeSpyMain() {
  const [input, setInput] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

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
      
      if (res.ok) {
        // Add new result to the top of the stack
        setResults([data, ...results]);
      } else {
        alert("Error: " + (data.error || "Unknown error"));
      }
    } catch (e) { 
      // Fallback for Vercel timeouts - data usually still saves to DB
      alert("Analysis in progress. If this times out, please check the Archive in 1-2 minutes."); 
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#020617] text-slate-100 p-8 font-sans">
      {/* HEADER SECTION */}
      <div className="max-w-7xl mx-auto flex justify-between items-center mb-16 border-b border-slate-800 pb-8">
        <div>
          <h1 className="text-4xl font-black italic uppercase text-blue-500 tracking-tighter">Spy Pro 2.0</h1>
          <Link href="/archive" className="text-cyan-400 text-[10px] font-bold uppercase tracking-widest hover:underline mt-1 block">
            → Open Intelligence Archive
          </Link>
        </div>
        
        <div className="flex gap-4">
          <input 
            value={input} 
            onChange={e => setInput(e.target.value)} 
            placeholder="Page ID (e.g. 101255989141201)..." 
            className="bg-slate-900 border border-slate-800 px-6 py-3 rounded-2xl text-sm outline-none focus:ring-2 ring-blue-500 w-80 transition-all placeholder:opacity-30" 
          />
          <button 
            onClick={handleAnalyze} 
            disabled={loading} 
            className="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:opacity-50 px-10 py-3 rounded-2xl font-black uppercase text-xs transition-all active:scale-95 shadow-lg shadow-blue-900/20"
          >
            {loading ? 'Crunching Video...' : 'Spy Now'}
          </button>
        </div>
      </div>

      {/* RESULTS SECTION */}
      <div className="max-w-7xl mx-auto space-y-24">
        {results.length === 0 && !loading && (
          <div className="text-center py-40 opacity-10 uppercase font-black text-6xl select-none tracking-tighter">
            Waiting for target
          </div>
        )}

        {results.map((res, i) => (
          <div key={i} className="animate-in fade-in slide-in-from-bottom-8 duration-700">
            <h2 className="text-7xl font-black mb-12 uppercase italic tracking-tighter text-white drop-shadow-2xl">
              {res.brand}
            </h2>
            
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
              
              {/* AI Analysis View */}
              <div className="lg:col-span-6 bg-slate-900/40 border border-slate-800 p-10 rounded-[3.5rem] backdrop-blur-md shadow-2xl overflow-hidden border-t-blue-500/20">
                <div className="text-slate-300 text-sm leading-relaxed whitespace-pre-wrap font-sans">
                   {res.strategy}
                </div>
              </div>

              {/* Video Grid View */}
              <div className="lg:col-span-6 grid grid-cols-2 gap-4">
                {res.creatives?.map((ad: any) => (
                  <div key={ad.id} className="aspect-[9/16] bg-black rounded-[2.5rem] overflow-hidden border border-slate-800 shadow-xl group relative">
                    {ad.video ? (
                      <video 
                        src={ad.video} 
                        poster={ad.thumbnail} // Fixes the black squares by using the Meta preview image
                        controls 
                        preload="metadata"
                        className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110" 
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full bg-slate-900/50">
                        <img src={ad.thumbnail} className="opacity-20 mb-2 w-24 grayscale" alt="Thumbnail" />
                        <span className="text-[10px] font-bold uppercase opacity-30 italic">Media Link Only</span>
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
