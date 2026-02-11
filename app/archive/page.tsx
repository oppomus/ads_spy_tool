'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';

export default function ArchiveListPage() {
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Получаем историю через наш обновленный роут
    fetch('/api/archive')
      .then(res => res.json())
      .then(data => {
        setHistory(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-[#020617] text-white p-8 font-sans">
      <div className="max-w-5xl mx-auto">
        
        {/* HEADER: В стиле Spy Pro 2.0 */}
        <div className="flex justify-between items-center mb-16 border-b border-slate-800 pb-10">
          <div>
            <h1 className="text-4xl font-black italic uppercase text-blue-500 tracking-tighter leading-none">
              Intelligence Archive
            </h1>
            <p className="text-slate-500 text-[10px] font-bold uppercase tracking-[0.2em] mt-2">
              Historical Creative Database
            </p>
          </div>
          <Link href="/" className="text-cyan-400 text-xs font-bold uppercase tracking-widest hover:underline px-6 py-2 border border-cyan-400/20 rounded-xl transition-all hover:bg-cyan-400/5">
            ← Back to Scanner
          </Link>
        </div>

        {/* CONTENT SECTION */}
        {loading ? (
          <div className="text-center py-40">
            <div className="text-blue-500 font-black italic uppercase text-xs animate-pulse tracking-[0.3em]">
              Accessing Database...
            </div>
          </div>
        ) : history.length === 0 ? (
          <div className="text-center py-40 opacity-10 uppercase font-black text-6xl tracking-tighter select-none">
            No Intel Found
          </div>
        ) : (
          <div className="grid gap-6">
            {history.map((item, index) => (
              <Link 
                key={item.id} 
                href={`/archive/${item.id}`}
                className="group relative bg-slate-900/30 border border-slate-800 p-8 rounded-[2rem] hover:border-blue-500/50 transition-all duration-500 flex justify-between items-center overflow-hidden animate-in fade-in slide-in-from-bottom-4"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                {/* Фоновый градиент при наведении */}
                <div className="absolute inset-0 bg-gradient-to-r from-blue-600/0 to-blue-600/0 group-hover:to-blue-600/5 transition-all duration-500" />

                <div className="relative z-10">
                  <h2 className="text-3xl font-black uppercase italic tracking-tighter text-white group-hover:text-blue-400 transition-colors duration-300">
                    {item.brand_name || 'Unknown Brand'}
                  </h2>
                  <div className="flex gap-4 mt-2">
                    <p className="text-slate-500 text-[10px] font-mono uppercase tracking-widest">
                      ID: {item.page_id}
                    </p>
                    <p className="text-slate-600 text-[10px] font-mono uppercase">
                      • {new Date(item.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>

                <div className="relative z-10 flex items-center gap-6">
                  <div className="text-right">
                    <span className="block text-[10px] font-black uppercase text-slate-500 tracking-widest mb-1">Status</span>
                    <span className="text-blue-500 text-xs font-bold uppercase italic border border-blue-500/20 px-3 py-1 rounded-lg bg-blue-500/5">
                      Analyzed
                    </span>
                  </div>
                  
                  <div className="bg-slate-800 group-hover:bg-blue-600 px-6 py-4 rounded-2xl transition-all duration-300 transform group-hover:translate-x-2">
                    <span className="block text-[10px] font-black uppercase text-slate-400 group-hover:text-white leading-none mb-1">
                      {item.creatives?.length || 0} Ads
                    </span>
                    <span className="text-white font-black text-sm tracking-tighter">OPEN →</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
