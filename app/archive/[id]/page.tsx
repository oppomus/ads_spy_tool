'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';

export default function DetailedReport() {
  const { id } = useParams();
  const [report, setReport] = useState<any>(null);
  const [activeFilter, setActiveFilter] = useState('All');

  useEffect(() => {
    fetch(`/api/archive?id=${id}`)
      .then(res => res.json())
      .then(data => setReport(data));
  }, [id]);

  const handleGenerateScript = () => {
    alert("Magic is coming! Next step: coding the Script Generator API.");
  };

  if (!report) return (
    <div className="min-h-screen bg-[#020617] flex items-center justify-center text-blue-500 font-black italic uppercase tracking-[0.5em] animate-pulse">
      Decrypting Intel...
    </div>
  );

  const concepts = ['All', 'Misleading', 'Gameplay', 'UGC', 'Cinematic'];

  return (
    <div className="min-h-screen bg-[#020617] text-slate-100 p-8 font-sans">
      {/* HEADER */}
      <div className="max-w-7xl mx-auto flex justify-between items-center mb-16 border-b border-slate-800 pb-8">
        <Link href="/archive" className="group flex items-center gap-3 text-cyan-400 text-xs font-black uppercase tracking-widest transition-all">
          <span className="group-hover:-translate-x-2 transition-transform">←</span> 
          Back to Intelligence Archive
        </Link>
        <div className="text-right uppercase">
          <span className="text-slate-500 text-[10px] font-mono block leading-none opacity-40">Entry_ID: {report.id}</span>
          <span className="text-blue-500 text-[10px] font-black mt-2 block tracking-tighter">
            ARCHIVED: {new Date(report.created_at).toLocaleDateString()}
          </span>
        </div>
      </div>

      <div className="max-w-7xl mx-auto">
        <h2 className="text-8xl font-black mb-6 uppercase italic tracking-tighter text-white drop-shadow-2xl">
          {report.brand_name}
        </h2>

        {/* CONCEPT FILTERS */}
        <div className="flex flex-wrap gap-3 mb-12">
          {concepts.map(c => (
            <button
              key={c}
              onClick={() => setActiveFilter(c)}
              className={`px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-[0.15em] transition-all border ${
                activeFilter === c 
                ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-900/40' 
                : 'bg-slate-900/40 border-slate-800 text-slate-500 hover:border-slate-700'
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
          
          {/* AI ANALYSIS BOX WITH MARKDOWN */}
          <div className="lg:col-span-7 space-y-8">
            <div className="bg-slate-900/40 border border-slate-800 p-12 rounded-[4rem] backdrop-blur-xl shadow-inner border-t-blue-500/20">
              <div className="prose prose-invert max-w-none">
                <ReactMarkdown
                  components={{
                    h3: ({...props}) => <h3 className="text-2xl font-black text-blue-400 mt-10 mb-4 uppercase italic tracking-tight border-b border-blue-500/10 pb-2" {...props} />,
                    li: ({...props}) => <li className="mb-3 text-slate-400 list-none flex gap-3 before:content-['▹'] before:text-blue-500" {...props} />,
                    strong: ({...props}) => <b className="text-white font-black tracking-wide" {...props} />,
                    p: ({...props}) => <p className="text-slate-300 leading-relaxed mb-4" {...props} />,
                  }}
                >
                  {report.strategy_analysis}
                </ReactMarkdown>
              </div>

              {/* ACTION BUTTON */}
              <button 
                onClick={handleGenerateScript}
                className="mt-12 w-full bg-gradient-to-br from-blue-600 via-blue-500 to-cyan-400 hover:scale-[1.02] text-white font-black uppercase text-xs py-6 rounded-[2rem] transition-all active:scale-95 shadow-2xl shadow-blue-900/40 flex items-center justify-center gap-4 group"
              >
                <span className="text-xl group-hover:rotate-12 transition-transform">🪄</span>
                <span>Generate High-Convert Ad Script</span>
              </button>
            </div>
          </div>

          {/* VIDEO GRID (Filtered) */}
          <div className="lg:col-span-5 grid grid-cols-2 gap-4 h-fit sticky top-8">
            {report.creatives
              ?.filter((ad: any) => activeFilter === 'All' || ad.concept === activeFilter)
              .map((ad: any) => (
              <div key={ad.id} className="aspect-[9/16] bg-black rounded-[2.5rem] overflow-hidden border border-slate-800 shadow-2xl relative group">
                {ad.video ? (
                  <video 
                    src={ad.video} 
                    poster={ad.thumbnail}
                    controls 
                    className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110" 
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center h-full bg-slate-900/50 p-6 text-center">
                    <img src={ad.thumbnail} className="opacity-10 mb-4 w-20 grayscale" alt="N/A" />
                    <span className="text-[10px] font-black uppercase opacity-20 tracking-widest leading-tight">Asset Archived</span>
                  </div>
                )}
                {/* Категория на видео */}
                {ad.concept && ad.concept !== 'All' && (
                  <div className="absolute top-4 left-4 bg-blue-600/90 text-[8px] font-black uppercase px-3 py-1 rounded-full backdrop-blur-md">
                    {ad.concept}
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
