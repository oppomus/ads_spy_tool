'use client';
import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

export default function DetailedReport() {
  const { id } = useParams();
  const [report, setReport] = useState<any>(null);

  useEffect(() => {
    // Используем наш универсальный роут архива с параметром ID
    fetch(`/api/archive?id=${id}`)
      .then(res => res.json())
      .then(data => setReport(data));
  }, [id]);

  if (!report) return (
    <div className="min-h-screen bg-[#020617] flex items-center justify-center text-white italic opacity-20 animate-pulse">
      Loading Detailed Intel...
    </div>
  );

  return (
    <div className="min-h-screen bg-[#020617] text-slate-100 p-8 font-sans">
      {/* HEADER */}
      <div className="max-w-7xl mx-auto flex justify-between items-center mb-16 border-b border-slate-800 pb-8">
        <Link href="/archive" className="text-cyan-400 text-xs font-bold uppercase tracking-widest hover:underline">
          ← Back to Intelligence Archive
        </Link>
        <div className="text-right uppercase">
          <span className="text-slate-500 text-[10px] font-mono block leading-none">Report ID: {report.id}</span>
          <span className="text-blue-500 text-[10px] font-bold mt-1 block">
            Scanned on {new Date(report.created_at).toLocaleDateString()}
          </span>
        </div>
      </div>

      <div className="max-w-7xl mx-auto">
        {/* BRAND NAME */}
        <h2 className="text-7xl font-black mb-12 uppercase italic tracking-tighter text-white drop-shadow-2xl">
          {report.brand_name}
        </h2>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
          
          {/* AI ANALYSIS BOX */}
          <div className="lg:col-span-6 bg-slate-900/40 border border-slate-800 p-10 rounded-[3.5rem] backdrop-blur-md shadow-2xl border-t-blue-500/20">
            {/* Используем whitespace-pre-wrap для сохранения структуры текста без markdown */}
            <div className="text-slate-300 text-sm leading-relaxed whitespace-pre-wrap font-sans">
               {report.strategy_analysis}
            </div>
          </div>

          {/* VIDEO GRID */}
          <div className="lg:col-span-6 grid grid-cols-2 gap-4">
            {report.creatives?.map((ad: any) => (
              <div key={ad.id} className="aspect-[9/16] bg-black rounded-[2.5rem] overflow-hidden border border-slate-800 shadow-xl relative group">
                {ad.video ? (
                  <video 
                    src={ad.video} 
                    poster={ad.thumbnail} // ФИКС: Подставляет обложку из JSON, убирая черные квадраты
                    controls 
                    preload="metadata" 
                    className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110" 
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center h-full bg-slate-900/50">
                    <img src={ad.thumbnail} className="opacity-20 mb-2 w-24 grayscale" alt="Thumbnail" />
                    <span className="text-[10px] font-bold uppercase opacity-30 italic">Processing Link...</span>
                  </div>
                )}
              </div>
            ))}
          </div>

        </div>
      </div>
    </div>
  );
}
