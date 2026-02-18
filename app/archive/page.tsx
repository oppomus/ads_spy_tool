'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';

export default function ArchiveListPage() {
  const [history, setHistory] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState(''); // Поиск по бренду
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/archive')
      .then(res => res.json())
      .then(data => {
        setHistory(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Фильтрация списка по поиску
  const filteredHistory = history.filter(item => 
    item.brand_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-[#020617] text-white p-8 font-sans">
      <div className="max-w-5xl mx-auto">
        
        {/* HEADER */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-16 border-b border-slate-800 pb-10 gap-6">
          <div>
            <h1 className="text-5xl font-black italic uppercase text-blue-500 tracking-tighter leading-none">
              Intelligence Archive
            </h1>
            <p className="text-slate-500 text-[10px] font-bold uppercase tracking-[0.2em] mt-3">
              Historical Creative Database • Spy Pro 2.0
            </p>
          </div>
          <Link href="/" className="text-cyan-400 text-xs font-black uppercase tracking-widest hover:text-white px-8 py-4 border border-cyan-400/20 rounded-2xl transition-all hover:bg-cyan-400/10 backdrop-blur-sm">
            ← Back to Scanner
          </Link>
        </div>

        {/* SEARCH BAR */}
        <div className="mb-10 relative">
          <input 
            type="text"
            placeholder="Search brand by name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-900/50 border border-slate-800 p-5 rounded-2xl outline-none focus:ring-2 ring-blue-500/50 transition-all text-sm font-medium placeholder:opacity-20"
          />
          <div className="absolute right-5 top-5 opacity-20">🔍</div>
        </div>

        {/* CONTENT SECTION */}
        {loading ? (
          <div className="text-center py-40">
            <div className="text-blue-500 font-black italic uppercase text-xs animate-pulse tracking-[0.3em]">
              Accessing Secure Database...
            </div>
          </div>
        ) : filteredHistory.length === 0 ? (
          <div className="text-center py-40 opacity-10 uppercase font-black text-6xl tracking-tighter select-none">
            {searchTerm ? 'No matches found' : 'Archive Empty'}
          </div>
        ) : (
          <div className="grid gap-4">
            {filteredHistory.map((item, index) => (
              <Link 
                key={item.id} 
                href={`/archive/${item.id}`}
                className="group relative bg-slate-900/20 border border-slate-800/50 p-6 rounded-3xl hover:border-blue-500/50 transition-all duration-500 flex justify-between items-center overflow-hidden animate-in fade-in slide-in-from-bottom-4"
                style={{ animationDelay: `${index * 30}ms` }}
              >
                {/* Эффект свечения при наведении */}
                <div className="absolute inset-0 bg-gradient-to-r from-blue-600/0 to-blue-600/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                <div className="relative z-10 flex items-center gap-8">
                  <div className="hidden sm:flex w-12 h-12 bg-slate-800 rounded-2xl items-center justify-center font-black text-slate-600 group-hover:bg-blue-500/20 group-hover:text-blue-400 transition-all">
                    {index + 1}
                  </div>
                  <div>
                    <h2 className="text-2xl font-black uppercase italic tracking-tight text-white group-hover:text-blue-400 transition-colors duration-300">
                      {item.brand_name || 'Unknown Brand'}
                    </h2>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-slate-600 text-[10px] font-mono uppercase">
                        ID: {item.page_id}
                      </span>
                      <span className="w-1 h-1 bg-slate-800 rounded-full" />
                      <span className="text-slate-600 text-[10px] font-mono">
                        {new Date(item.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="relative z-10 flex items-center gap-6">
                  <div className="text-right hidden md:block">
                    <span className="text-blue-500 text-[10px] font-black uppercase italic px-3 py-1 rounded-lg bg-blue-500/5 border border-blue-500/10">
                      {item.creatives?.length || 0} Assets
                    </span>
                  </div>
                  
                  <div className="bg-slate-800 group-hover:bg-blue-600 h-14 w-14 rounded-2xl flex items-center justify-center transition-all duration-300 group-hover:shadow-lg group-hover:shadow-blue-900/40">
                    <span className="text-white font-black text-xl">→</span>
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
