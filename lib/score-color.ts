/** Maps a 0–100 score to a traffic-light color. */
export function scoreColor(v: number): string {
  if (v >= 80) return '#22c55e';
  if (v >= 60) return '#D4AF37';
  return '#ef4444';
}
