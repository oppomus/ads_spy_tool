'use client';
import React, { useState } from 'react';

export default function VibeAdsSpy() {
  const [url, setUrl] = useState('');
  const [ads, setAds] = useState([
    { id: 1, brand: 'Example Brand', hook: 'Problem/Solution hook', impressions: '1M+', status: 'WINNING' },
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = async () => {
    if (!url) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Check logs for details');

      setAds(prev => [data[0], ...prev]);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#020617] text-white p-8 font-sans">
      <div className="max-w-6xl mx-auto flex justify-between items-center mb-12">
        <h1 className="text-2xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent italic">
          VIBE ADS SPY
        </h1>
        <div className="flex gap-3">
          <input 
            type="text" 
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Paste FB Ad Library Link or Page ID..." 
            className="bg-[#0f172a] border border-slate-800 px-4 py-2 rounded-xl w-80 text-sm focus:ring-2 ring-blue-500 outline-none"
          />
          <button 
            onClick={handleAnalyze}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-500 px-6 py-2 rounded-xl font-bold transition disabled:opacity-50"
          >
            {loading ? 'Analyzing...' : 'Analyze'}
          </button>
        </div>
      </div>

      {error && (
        <div className="max-w-6xl mx-auto mb-6 p-4 bg-red-500/10 border border-red-500/50 rounded-xl text-red-500 text-sm">
          {error}
        </div>
      )}

      <div className="max-w-6xl mx-auto bg-[#0f172a] rounded-2xl border border-slate-800 overflow-hidden shadow-2xl">
        <table className="w-full text-left">
          <thead className="bg-slate-800/50 text-slate-400 text-xs uppercase">
            <tr>
              <th className="p-5 font-semibold">Brand</th>
              <th className="p-5 font-semibold">AI Analysis (Hook & Offer)</th>
              <th className="p-5 font-semibold">Impressions</th>
              <th className="p-5 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {ads.map((ad) => (
              <tr key={ad.id} className="hover:bg-slate-800/30 transition-colors">
                <td className="p-5 font-bold text-slate-200">{ad.brand}</td>
                <td className="p-5 text-blue-300 italic">
                  &quot;{ad.hook}&quot;
                </td>
                <td className="p-5 text-slate-400 font-mono">{ad.impressions}</td>
                <td className="p-5">
                  <span className="bg-green-500/20 text-green-400 text-[10px] px-2 py-1 rounded-full border border-green-500/30 font-bold uppercase">
                    {ad.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
