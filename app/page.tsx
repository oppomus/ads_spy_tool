'use client';
import React, { useState } from 'react';

export default function VibeAdsSpy() {
  const [input, setInput] = useState('');
  const [ads, setAds] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const handleAnalyze = async () => {
    setLoading(true);
    // Массовый поиск: разбиваем входную строку по запятой или пробелу
    const targets = input.split(/[\s,]+/).filter(t => t.trim() !== '');
    
    for (const target of targets) {
      try {
        const response = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: target }),
        });
        const data = await response.json();
        if (response.ok) setAds(prev => [data, ...prev]);
      } catch (err) {
        console.error("Error with", target);
      }
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#020617] text-white p-8">
      <div className="max-w-6xl mx-auto flex justify-between items-center mb-12">
        <h1 className="text-2xl font-black italic text-blue-500">VIBE ADS SPY 2.0</h1>
        <div className="flex gap-2">
          <input 
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Enter IDs (comma separated)..." 
            className="bg-[#0f172a] border border-slate-800 px-4 py-2 rounded-xl w-96 text-sm"
          />
          <button onClick={handleAnalyze} disabled={loading} className="bg-blue-600 px-6 py-2 rounded-xl font-bold">
            {loading ? 'Processing List...' : 'Analyze All'}
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto grid grid-cols-1 gap-4">
        {ads.map((ad) => (
          <div key={ad.id} className="bg-[#0f172a] border border-slate-800 rounded-2xl p-6 flex gap-6 items-center hover:border-blue-500/50 transition-all">
            {/* Визуализация: Креатив */}
            <div className="w-32 h-32 bg-slate-800 rounded-lg overflow-hidden flex-shrink-0">
              {ad.image ? (
                <img src={ad.image} alt="Ad" className="w-full h-full object-cover" />
              ) : (
                <div className="flex items-center justify-center h-full text-[10px] text-slate-500 uppercase">No Video</div>
              )}
            </div>
            
            <div className="flex-grow">
              <h3 className="text-lg font-bold mb-1">{ad.brand}</h3>
              <p className="text-blue-300 italic text-sm mb-4">&quot;{ad.hook}&quot;</p>
              <div className="flex gap-3">
                <span className="bg-green-500/10 text-green-500 text-[10px] px-2 py-1 rounded-md border border-green-500/20 font-bold uppercase">Winning</span>
                <a href={ad.adUrl} target="_blank" className="text-xs text-slate-400 hover:text-white underline">View on Meta Library →</a>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
