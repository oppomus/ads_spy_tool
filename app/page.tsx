'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';

export default function VibeSpyMain() {
  const [input, setInput] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeFilter, setActiveFilter] = useState('All');

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
        setResults([data, ...results]);
      } else {
        alert("Error: " + (data.error || "Unknown error"));
      }
    } catch (e) { 
      alert("Analysis in progress. Check Archive soon."); 
    }
    setLoading(false);
  };

  const concepts = ['All', 'Misleading', 'Gameplay', 'UGC', 'Cinematic'];

  return (
    <div className="min-h-screen bg-[#020617] text-slate-100 p-8 font-sans">
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
            placeholder="Page ID..." 
            className="bg-slate-900 border border-slate-800 px-6 py-3 rounded-2xl text-sm outline-none focus:ring-2 ring-blue-500 w-80 transition-all" 
          />
          <button 
            onClick={handleAnalyze} 
            disabled={loading} 
            className="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 px-10 py-3 rounded-2xl font-black uppercase text-xs transition-all"
          >
            {loading ? 'Crunching Video...' : 'Spy Now'}
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto space-y-24">
        {results.length === 0 && !loading && (
          <div className="text-center py-40 opacity-10 uppercase font-black text-6xl select-none tracking-tighter">
            Waiting for target
          </div>
        )}

        {results.map((res, i) => (
          <div key={i} className="animate-in fade-in slide-in-from-bottom-8 duration-700">
            <h2 className="text-7xl font-black mb-6 uppercase italic tracking-tighter text-white drop-shadow-2xl">
              {res.brand}
            </h2>

            <div className="flex gap-3 mb-12">
              {concepts.map(c => (
                <button
                  key={c}
                  onClick={() => setActiveFilter(c)}
                  className={`px-6 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all border ${
                    activeFilter === c 
                    ? 'bg-blue-600 border-blue-500 text-white' 
                    : 'bg-slate-900 border-slate-800 text-slate-500'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
              <div className="lg:col-span-7 bg-slate-900/40 border border-slate-800 p-10 rounded-[3.5rem] backdrop-blur-md">
                <div className="prose prose-invert max-w-none text-slate-300 font-sans">
                  <ReactMarkdown
                    components={{
                      h3: ({...props}) => <h3 className="text-xl font-bold text-blue-400 mt-8 mb-4 uppercase" {...props} />,
                      li: ({...props}) => <li className="mb-2 list-disc ml-4 text-slate-400" {...props} />,
                      strong: ({...props}) => <b className="text-white font-black" {...props} />,
                    }}
                  >
                    {res.strategy}
                  </ReactMarkdown>
                </div>
              </div>

              <div className="lg:col-span-5 grid grid-cols-2 gap-4 h-fit">
                {res.creatives
                  ?.filter((ad: any) => activeFilter === 'All' || ad.concept === activeFilter)
                  .map((ad: any) => (
                  <div key={ad.id} className="aspect-[9/16] bg-black rounded-[2.5rem] overflow-hidden border border-slate-800 relative group">
                    {ad.video ? (
                      <video src={ad.video} poster={ad.thumbnail} controls className="h-full w-full object-cover transition-transform group-hover:scale-110" />
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full bg-slate-900/50 p-4">
                        <img src={ad.thumbnail} className="opacity-20 mb-2 w-16 grayscale" alt="Thumb" />
                        <span className="text-[8px] font-black uppercase opacity-30">Processing Media</span>
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
