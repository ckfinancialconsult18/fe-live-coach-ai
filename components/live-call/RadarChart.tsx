'use client';

import type { QualityScores } from '@/lib/types';

interface Props {
  scores: QualityScores;
  size?: number;
}

const LABELS: { key: keyof QualityScores; label: string }[] = [
  { key: 'confidence', label: 'Confidence' },
  { key: 'authority', label: 'Authority' },
  { key: 'empathy', label: 'Empathy' },
  { key: 'listening', label: 'Listening' },
  { key: 'pacing', label: 'Pacing' },
  { key: 'control', label: 'Control' },
  { key: 'objectionHandling', label: 'Objections' },
  { key: 'discovery', label: 'Discovery' },
  { key: 'closing', label: 'Closing' },
  { key: 'compliance', label: 'Compliance' },
  { key: 'naturalness', label: 'Naturalness' },
  { key: 'overallSalesEffectiveness', label: 'Effectiveness' },
];

/** Pure-SVG radar chart — no charting library dependency. */
export function RadarChart({ scores, size = 280 }: Props) {
  const center = size / 2;
  const radius = size / 2 - 36;
  const n = LABELS.length;

  function pointFor(index: number, value: number) {
    const angle = (Math.PI * 2 * index) / n - Math.PI / 2;
    const r = (Math.max(0, Math.min(100, value)) / 100) * radius;
    return { x: center + r * Math.cos(angle), y: center + r * Math.sin(angle) };
  }

  function labelPointFor(index: number) {
    const angle = (Math.PI * 2 * index) / n - Math.PI / 2;
    const r = radius + 18;
    return { x: center + r * Math.cos(angle), y: center + r * Math.sin(angle) };
  }

  const dataPoints = LABELS.map((l, i) => pointFor(i, scores[l.key] ?? 0));
  const polygonPoints = dataPoints.map((p) => `${p.x},${p.y}`).join(' ');

  const rings = [0.25, 0.5, 0.75, 1];

  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label="AI quality score radar chart">
      {/* Grid rings */}
      {rings.map((ring) => (
        <polygon
          key={ring}
          points={LABELS.map((_, i) => { const p = pointFor(i, ring * 100); return `${p.x},${p.y}`; }).join(' ')}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={1}
        />
      ))}
      {/* Spokes */}
      {LABELS.map((_, i) => {
        const p = pointFor(i, 100);
        return <line key={i} x1={center} y1={center} x2={p.x} y2={p.y} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />;
      })}
      {/* Data polygon */}
      <polygon points={polygonPoints} fill="rgba(212,175,55,0.18)" stroke="#D4AF37" strokeWidth={2} />
      {dataPoints.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={2.5} fill="#D4AF37" />
      ))}
      {/* Labels */}
      {LABELS.map((l, i) => {
        const p = labelPointFor(i);
        return (
          <text
            key={l.key}
            x={p.x}
            y={p.y}
            fontSize={9}
            fill="#94a3b8"
            textAnchor="middle"
            dominantBaseline="middle"
          >
            {l.label}
          </text>
        );
      })}
    </svg>
  );
}
