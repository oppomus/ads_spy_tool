'use client';
import React, { useState } from 'react';

export default function MetaSpyDashboard() {
  const [url, setUrl] = useState('');
  const [ads, setAds] = useState([
    { id: 1, brand: 'AG1', hook: 'Problem/Solution', impressions: '5M+', status: 'WINNING' },
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
      
      if (!response.ok) {
        throw new Error(data.error || 'Ошибка сервера');
      }

      setAds([data[0], ...ads]);
    } catch (err: any) {
      setError(err.message);
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#020617] text-white p-8 font-sans">
      <div className="max-w-6xl mx-auto flex justify-between items-center mb-12">
        <h1 className="text-2xl font-bold text-blue-400">VIBE ADS SPY</h1>
        <div className="flex gap-4">
          <input 
            type="text" 
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Вставь URL библиотеки рекламы..." 
            className="bg-[#0f172a] border border-slate-800 px-4 py-2 rounded-lg w-96 text-sm"
          />
          <button 
            onClick={handleAnalyze}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-500 px-6 py-2 rounded-lg font-medium transition disabled:opacity-50 text-sm"
          >
            {loading ? 'Анализирую...' : 'Анализировать'}
          </button>
        </div>
      </div>

      {/* Окно ошибки (если она будет) */}
      {error && (
        <div className="max-w-6xl mx-auto mb-6 p-4 bg-red-500/10 border border-red-500/50 rounded-lg text-red-500 text-sm">
          Ошибка: {error}. Проверь ключи API в настройках Vercel.
        </div>
      )}

      {/* Stats & Table (оставь как было в твоем скриншоте) */}
      <div className="max-w-6xl mx-auto grid grid-cols-3 gap-6 mb-8">
         <div className="bg-[#0f172a] p-6 rounded-xl border border-slate-800">
           <p className="text-slate-400 text-xs mb-1">Проверено брендов</p>
           <p className="text-2xl font-bold">124</p>
         </div>
         {/* ... остальные карточки */}
      </div>

      <div className="max-w-6xl mx-auto bg-[#0f172a] rounded-xl border border-slate-800 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-800/30 text-slate-400 text-xs uppercase">
            <tr>
              <th className="p-4">Бренд</th>
              <th className="p-4">Тип Хука (AI)</th>
              <th className="p-4">Показы</th>
              <th className="p-4">Статус</th>
              <th className="p-4">Действие</th>
            </tr>
          </thead>
          <tbody>
            {ads.map((ad) => (
              <tr key={ad.id} className="border-t border-slate-800 text-sm">
                <td className="p-4 font-bold">{ad.brand}</td>
                <td className="p-4 text-blue-300">{ad.hook}</td>
                <td className="p-4 font-mono">{ad.impressions}</td>
                <td className="p-4">
                  <span className="bg-green-500/10 text-green-500 text-[10px] px-2 py-0.5 rounded font-bold">
                    {ad.status}
                  </span>
                </td>
                <td className="p-4 text-slate-500 underline cursor-pointer">Детали</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}