'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';

export default function ArchiveListPage() {
  const [history, setHistory] = useState<any[]>([]);
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

  return (
    <div className="min-h-screen bg-[#020617] text-white p-8 font-sans">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-12 border-b border-slate-800 pb-8">
          <h1 className="text-3xl font-black italic uppercase text-blue-500">Intelligence Archive</h1>
          <Link href="/" className="text-cyan-400 text-xs font-bold uppercase hover:underline">← Back to Scanner</Link>
        </div>

        {loading ? (
          <div className="text-center py-20 opacity-50 uppercase tracking-widest text-xs animate-pulse">Loading Database...</div>
        ) : history.length === 0 ? (
          <div className="text-center py-20 opacity-20 uppercase font-black text-4xl">No Intel Found</div>
        ) : (
          <div className="grid gap-4">
            {history.map((item) => (
              <button 
                key={item.id} 
                onClick={() => window.location.href = `/archive/${item.id}`}
                className="w-full text-left group bg-slate-900/50 border border-slate-800 p-6 rounded-2xl hover:border-blue-500/50 transition-all flex justify-between items-center"
              >
                <div>
                  <h2 className="text-xl font-bold uppercase italic group-hover:text-blue-400 transition-colors">
                    {item.brand_name || 'Unknown Brand'}
                  </h2>
                  <p className="text-slate-500 text-[10px] font-mono mt-1 uppercase">
                    {new Date(item.created_at).toLocaleString()}
                  </p>
                </div>
                <div className="bg-slate-800 px-4 py-2 rounded-xl text-[10px] font-black uppercase text-slate-400 group-hover:bg-blue-600 group-hover:text-white transition-all">
                  {item.creatives?.length || 0} ADS FOUND →
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
