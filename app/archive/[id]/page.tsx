'use client';
import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

export default function DetailedReport() {
  const { id } = useParams();
  const [report, setReport] = useState<any>(null);

  useEffect(() => {
    fetch(`/api/archive?id=${id}`)
      .then(res => res.json())
      .then(data => setReport(data));
  }, [id]);

  if (!report) return <div className="min-h-screen bg-[#020617] flex items-center justify-center text-white italic opacity-20">Loading Detailed Report...</div>;

  return (
    <div className="min-h-screen bg-[#020617] text-slate-100 p-8 font-sans">
      <div className="max-w-7xl mx-auto flex justify-between items-center mb-16">
        <Link href="/archive" className="text-cyan-400 text-xs font-bold uppercase tracking-widest hover:underline">← Back to Archive</Link>
        <span className="text-slate-500 text-[10px] font-mono uppercase">Report ID: {report.id}</span>
      </div>

      <div className="max-w-7xl mx-auto">
        <h2 className="text-7xl font-black mb-12 uppercase italic tracking-tighter text-white">{report.brand_name}</h2>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
          <div className="lg:col-span-6 bg-slate-900/40 border border-slate-800 p-10 rounded-[3.5rem] shadow-2xl">
            <div className="text-slate-300 text-sm leading-relaxed whitespace-pre-wrap">
               {report.strategy_analysis}
            </div>
          </div>
          <div className="lg:col-span-6 grid grid-cols-2 gap-4">
            {report.creatives?.map((ad: any) => (
              <div key={ad.id} className="aspect-[9/16] bg-black rounded-[2rem] overflow-hidden border border-slate-800 shadow-xl relative group">
                <video src={ad.video} poster={ad.thumbnail} controls preload="metadata" className="h-full w-full object-cover" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
