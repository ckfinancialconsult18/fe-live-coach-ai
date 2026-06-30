'use client';

import { useState, useEffect } from 'react';

type Recommendation = { title: string; desc: string };

type InsightsResponse =
  | { insufficientData: true; callsScored: number; callsNeeded: number }
  | { insufficientData: false; recommendations: Recommendation[]; aiUnavailable?: boolean };

export function AICoachingPanel() {
  const [data, setData] = useState<InsightsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/coaching-insights')
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="glass-card rounded-2xl p-5 space-y-4" style={{ border: '1px solid rgba(212,175,55,0.25)', background: 'rgba(212,175,55,0.04)' }}>
      <h3 className="text-sm font-semibold text-[#D4AF37]">🤖 AI Coaching Recommendations</h3>

      {loading && (
        <p className="text-xs text-slate-500">Analyzing your last 30 days of calls...</p>
      )}

      {!loading && data && data.insufficientData && (
        <p className="text-xs text-slate-500">
          Recommendations will appear once you have at least {data.callsNeeded} scored calls in the last 30 days
          ({data.callsScored} so far). Keep logging calls through Live Call to unlock personalized coaching.
        </p>
      )}

      {!loading && data && !data.insufficientData && data.aiUnavailable && (
        <p className="text-xs text-slate-500">
          Enough call data exists, but AI coaching generation is temporarily unavailable. Try again shortly.
        </p>
      )}

      {!loading && data && !data.insufficientData && !data.aiUnavailable && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          {data.recommendations.map((r, i) => (
            <div key={i} className="space-y-2">
              <p className="text-xs font-bold text-slate-200">{r.title}</p>
              <p className="text-xs text-slate-400 leading-relaxed">{r.desc}</p>
            </div>
          ))}
          {data.recommendations.length === 0 && (
            <p className="text-xs text-slate-500">No recommendations generated this cycle.</p>
          )}
        </div>
      )}
    </div>
  );
}
