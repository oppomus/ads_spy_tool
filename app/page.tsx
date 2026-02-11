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
        // Добавляем новый результат в начало списка
        setResults([data, ...results]);
      } else {
        alert("Error: " + (data.error || "Unknown error"));
      }
    } catch (e) { 
      // Если Vercel отвалится по таймауту (60с), данные всё равно сохранятся в базу
      alert("Timeout or Network Error. Please wait a minute and check the Archive."); 
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#020617] text-slate-100 p-8 font-sans">
      {/* HEADER SECTION */}
      <div className="max-w-7xl mx-auto flex justify-between items-center mb-16 border-b border-slate-800 pb-8">
        <div>
          <h1 className="text-4xl font-black italic uppercase text-blue-500 tracking-tighter">Spy Pro 2.0</h1>
          {/* Ссылка на архив, которую мы возвращали */}
          <Link href="/archive" className="text-cyan-400 text-[10px] font-bold uppercase tracking-widest hover:underline mt-1 block">
            → Open Intelligence Archive
          </Link>
        </div>
        
        <div className="flex gap-4">
          <input 
            value={input} 
            onChange={e => setInput(e.target.value)} 
            placeholder="Page ID (e.g. 131427027065541)..." 
            className="bg-slate-900 border border-slate-800 px-6 py-3 rounded-2xl text-sm outline-none focus:ring-2 ring-blue-500 w-80 transition-all" 
          />
          <button 
            onClick={handleAnalyze} 
            disabled={loading} 
            className="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 px-10 py-3 rounded-2xl font-black uppercase text-xs transition-all active:scale-95 shadow-lg shadow-blue-900/20"
          >
            {loading ? 'Analyzing Videos...' : 'Spy Now'}
          </button>
        </div>
      </div>

      {/* RESULTS SECTION */}
      <div className="max-w-7xl mx-auto space-y-24">
        {results.length === 0 && !loading && (
          <div className="text-center py-40 opacity-10 uppercase font-black text-6xl select-none">
            Ready for Intel
          </div>
        )}

        {results.map((res, i) => (
          <div key={i} className="animate-in fade-in slide-in-from-bottom-8 duration-700">
            <h2 className="text-6xl font-black mb-12 uppercase italic tracking-tighter text-white">{res.brand}</h2>
            
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
              
              {/* AI Analysis (Markdown-like formatting via CSS) */}
              <div className="lg:col-span-6 bg-slate-900/40 border border-slate-800 p-10 rounded-[3rem] backdrop-blur-sm shadow-2xl overflow-hidden">
                <div className="text-slate-300 text-sm leading-relaxed whitespace-pre-wrap font-sans">
                   {res.strategy}
                </div>
              </div>

              {/* Video Grid Section */}
              <div className="lg:col-span-6 grid grid-cols-2 gap-4">
                {res.creatives?.map((ad: any) => (
                  <div key={ad.id} className="aspect-[9/16] bg-black rounded-[2.5rem] overflow-hidden border border-slate-800 shadow-xl group relative">
                    {ad.video ? (
                      <video 
                        src={ad.video} 
                        poster={ad.thumbnail} // ФИКС: Убирает черные квадраты
                        controls 
                        preload="metadata"
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" 
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full bg-slate-900">
                        <img src={ad.thumbnail} className="opacity-20 mb-2 w-20" alt="Preview" />
                        <span className="text-[10px] font-bold uppercase opacity-30 italic">Processing Video...</span>
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
