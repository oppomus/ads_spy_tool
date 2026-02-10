'use client';
import React, { useState } from 'react';

export default function MetaSpyDashboard() {
  const [url, setUrl] = useState('');
  const [ads, setAds] = useState([
    { id: 1, brand: 'AG1', hook: 'Problem/Solution', impressions: '5M+', status: 'WINNING' },
    { id: 2, brand: 'Magic Spoon', hook: 'Nostalgia', impressions: '2.1M+', status: 'SCALING' },
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Server Error');

      setAds(prevAds => [data[0], ...prevAds]);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#020617] text-white p-8 font-sans">
      <div className="max-w-6xl mx-auto flex justify-between items-center mb-12">
        <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
          VIBE ADS SPY
        </h1>
        <div className="flex gap-4">
          <input 
            type="text" 
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Paste Facebook Ad Library URL..." 
            className="bg-[#0f172a] border border-slate-800 px-4 py-2 rounded-lg w-96 text-sm focus:outline-none focus:ring-2 ring-blue-500"
          />
          <button 
            onClick={handleAnalyze}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-500 px-6 py-2 rounded-lg font-medium transition disabled:opacity-50 text-sm"
          >
            {loading ? 'Analyzing...' : 'Analyze'}
          </button>
        </div>
      </div>

      {error && (
        <div className="max-w-6xl mx-auto mb-6 p-4 bg-red-500/10 border border-red-500/50 rounded-lg text-red-500 text-sm">
          Error: {error}
        </div>
      )}

      <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-[#0f172a] p-6 rounded-xl border border-slate-800">
          <p className="text-slate-400 text-xs mb-1 uppercase tracking-wider font-semibold">Brands Verified</p>
          <p className="text-3xl font-bold text-white">124</p>
        </div>
        <div className="bg-[#0f172a] p-6 rounded-xl border border-slate-800">
          <p className="text-slate-400 text-xs mb-1 uppercase tracking-wider font-semibold">Ads in Database</p>
          <p className="text-3xl font-bold text-white">12,450</p>
        </div>
        <div className="bg-[#0f172a] p-6 rounded-xl border border-slate-800">
          <p className="text-slate-400 text-xs mb-1 uppercase tracking-wider font-semibold">AI Analysis Success</p>
          <p className="text-3xl font-bold text-green-400">98%</p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto bg-[#0f172a] rounded-xl border border-slate-800 overflow-hidden shadow-2xl">
        <table className="w-full text-left">
          <thead className="bg-slate-800/30 text-slate-400 text-xs uppercase">
            <tr>
              <th className="p-4 font-semibold">Brand</th>
              <th className="p-4 font-semibold">AI Hook Analysis</th>
              <th className="p-4 font-semibold">Impressions</th>
              <th className="p-4 font-semibold">Status</th>
              <th className="p-4 font-semibold">Action</th>
            </tr>
          </thead>
          <tbody>
            {ads.map((ad) => (
              <tr key={ad.id} className="border-t border-slate-800 hover:bg-slate-800/20 transition-colors">
                <td className="p-4 font-bold text-slate-200">{ad.brand}</td>
                <td className="p-4 text-blue-300 font-medium">{ad.hook}</td>
                <td className="p-4 text-slate-400 font-mono">{ad.impressions}</td>
                <td className="p-4">
                  <span className="bg-green-500/10 text-green-500 text-[10px] px-2 py-0.5 rounded-full border border-green-500/20 font-bold">
                    {ad.status}
                  </span>
                </td>
                <td className="p-4 text-slate-500 hover:text-white underline cursor-pointer transition-colors text-sm">Details</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
