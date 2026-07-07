/**
 * Streaks — computed from calls table dates.
 * All streaks are computed server-side from real DB data; no fabrication.
 */
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

function dateToDayKey(iso: string): string {
  return iso.slice(0, 10);
}

function computeCurrentStreak(days: Set<string>): number {
  const today = new Date();
  let streak = 0;
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    if (days.has(d.toISOString().slice(0, 10))) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

function computeLongestStreak(days: string[]): number {
  if (!days.length) return 0;
  const sorted = [...new Set(days)].sort();
  let longest = 1;
  let current = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1]);
    const curr = new Date(sorted[i]);
    const diff = (curr.getTime() - prev.getTime()) / 86400000;
    if (diff === 1) {
      current++;
      longest = Math.max(longest, current);
    } else {
      current = 1;
    }
  }
  return longest;
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = supabase as any;

  const since = new Date();
  since.setDate(since.getDate() - 365);

  // Start of current week (Monday)
  const startOfWeek = new Date();
  const dow = startOfWeek.getDay();
  startOfWeek.setDate(startOfWeek.getDate() - (dow === 0 ? 6 : dow - 1));
  startOfWeek.setHours(0, 0, 0, 0);

  // Start of current month
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [{ data: callRows }, { data: scoreRows }, { data: weekCalls }, { data: monthCalls }] = await Promise.all([
    db.from('calls').select('started_at').eq('user_id', user.id).eq('status', 'completed').gte('started_at', since.toISOString()).order('started_at', { ascending: true }),
    db.from('call_scores').select('overall_score, created_at').eq('user_id', user.id).gte('created_at', since.toISOString()).order('created_at', { ascending: true }),
    db.from('calls').select('id').eq('user_id', user.id).eq('status', 'completed').gte('started_at', startOfWeek.toISOString()),
    db.from('calls').select('id, outcome').eq('user_id', user.id).eq('status', 'completed').gte('started_at', startOfMonth.toISOString()),
  ]);

  const callDays = (callRows ?? []).map((r: { started_at: string }) => dateToDayKey(r.started_at));
  const callDaySet = new Set<string>(callDays);

  const scores = (scoreRows ?? []) as { overall_score: number; created_at: string }[];

  // Days where avg score >= 80
  const scoreDayMap = new Map<string, number[]>();
  scores.forEach((r) => {
    const day = dateToDayKey(r.created_at);
    if (!scoreDayMap.has(day)) scoreDayMap.set(day, []);
    scoreDayMap.get(day)!.push(r.overall_score);
  });

  const highScoreDays = new Set<string>(
    [...scoreDayMap.entries()]
      .filter(([, vals]) => vals.reduce((a, b) => a + b, 0) / vals.length >= 80)
      .map(([day]) => day)
  );

  // Score improvement streak
  const scoreDaysSorted = [...scoreDayMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  let longestImprovStreak = 0, currentImprovStreak = 0;
  for (let i = 1; i < scoreDaysSorted.length; i++) {
    const prevAvg = scoreDaysSorted[i - 1][1].reduce((a, b) => a + b, 0) / scoreDaysSorted[i - 1][1].length;
    const currAvg = scoreDaysSorted[i][1].reduce((a, b) => a + b, 0) / scoreDaysSorted[i][1].length;
    if (currAvg > prevAvg) {
      currentImprovStreak++;
      longestImprovStreak = Math.max(longestImprovStreak, currentImprovStreak);
    } else {
      currentImprovStreak = 0;
    }
  }
  const lastTwo = scoreDaysSorted.slice(-2);
  let improvStreak = 0;
  if (lastTwo.length === 2) {
    const prevAvg = lastTwo[0][1].reduce((a, b) => a + b, 0) / lastTwo[0][1].length;
    const currAvg = lastTwo[1][1].reduce((a, b) => a + b, 0) / lastTwo[1][1].length;
    improvStreak = currAvg > prevAvg ? currentImprovStreak : 0;
  }

  const callsThisWeek = (weekCalls ?? []).length;
  const policiesThisMonth = (monthCalls ?? []).filter((c: { outcome: string }) => c.outcome === 'policy_written').length;

  return NextResponse.json({
    consecutiveCallDays:       computeCurrentStreak(callDaySet),
    longestCallStreak:         computeLongestStreak(callDays),
    consecutiveHighScoreDays:  computeCurrentStreak(highScoreDays),
    longestHighScoreStreak:    computeLongestStreak([...highScoreDays]),
    currentImprovementStreak:  improvStreak,
    longestImprovementStreak:  longestImprovStreak,
    totalCallDays:             callDaySet.size,
    totalScoredCalls:          scores.length,
    callsThisWeek,
    policiesThisMonth,
  });
}
