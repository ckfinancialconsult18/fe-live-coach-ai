/**
 * Achievements — computes gamification badges from real call history.
 * Every badge criterion is checked against live DB data; nothing is fabricated.
 */
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: 'volume' | 'quality' | 'consistency' | 'mastery';
  earned: boolean;
  earnedAt?: string;
  progress: number;
  progressLabel: string;
}

function computeStreaks(days: string[]): { current: number; longest: number } {
  const sorted = [...new Set(days)].sort();
  if (!sorted.length) return { current: 0, longest: 0 };

  let longest = 1, run = 1;
  for (let i = 1; i < sorted.length; i++) {
    const diff = (new Date(sorted[i]).getTime() - new Date(sorted[i - 1]).getTime()) / 86400000;
    run = diff === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
  }

  const set = new Set(sorted);
  const today = new Date();
  let current = 0;
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    if (set.has(d.toISOString().slice(0, 10))) current++;
    else break;
  }
  return { current, longest };
}

function stageAvg(scores: { scores: Record<string, number> | null }[], key: string): number {
  const vals = scores.map((s) => s.scores?.[key]).filter((v): v is number => typeof v === 'number');
  return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = supabase as any;

  const [{ data: callRows }, { data: scoreRows }] = await Promise.all([
    db.from('calls')
      .select('id, outcome, started_at')
      .eq('user_id', user.id)
      .eq('status', 'completed')
      .order('started_at', { ascending: true }),
    db.from('call_scores')
      .select('overall_score, scores, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true }),
  ]);

  const calls = (callRows ?? []) as { id: string; outcome: string; started_at: string }[];
  const scores = (scoreRows ?? []) as { overall_score: number; scores: Record<string, number> | null; created_at: string }[];

  const totalCalls = calls.length;
  const policies = calls.filter((c) => c.outcome === 'policy_written');
  const totalPolicies = policies.length;
  const firstPolicy = policies[0] ?? null;
  const bestScore = scores.length ? Math.max(...scores.map((s) => s.overall_score)) : 0;

  const avgDiscovery = stageAvg(scores, 'discovery');
  const avgRapport = stageAvg(scores, 'rapport');
  const avgClosing = stageAvg(scores, 'closing');
  const avgObjections = stageAvg(scores, 'objections');

  const callDays = calls.map((c) => c.started_at.slice(0, 10));
  const { current: currentStreak, longest: longestStreak } = computeStreaks(callDays);

  // Score improvement: compare first 5 calls vs last 5 calls
  let scoreDelta = 0;
  if (scores.length >= 10) {
    const first5 = scores.slice(0, 5).reduce((a, s) => a + s.overall_score, 0) / 5;
    const last5 = scores.slice(-5).reduce((a, s) => a + s.overall_score, 0) / 5;
    scoreDelta = Math.round(last5 - first5);
  }

  const perfectDiscoveryCalls = scores.filter((s) => (s.scores?.discovery ?? 0) >= 95).length;
  const perfectRapportCalls = scores.filter((s) => (s.scores?.rapport ?? 0) >= 95).length;
  const ninetyPlusCalls = scores.filter((s) => s.overall_score >= 90).length;

  const achievements: Achievement[] = [
    // ── Volume ────────────────────────────────────────────────────────────────
    {
      id: 'first_call',
      name: 'First Step',
      description: 'Complete your first call',
      icon: '📞',
      category: 'volume',
      earned: totalCalls >= 1,
      earnedAt: calls[0]?.started_at,
      progress: Math.min(100, totalCalls * 100),
      progressLabel: `${totalCalls} / 1 call`,
    },
    {
      id: 'calls_50',
      name: '50 Call Club',
      description: 'Complete 50 calls',
      icon: '🎯',
      category: 'volume',
      earned: totalCalls >= 50,
      progress: Math.min(100, Math.round((totalCalls / 50) * 100)),
      progressLabel: `${totalCalls} / 50 calls`,
    },
    {
      id: 'calls_100',
      name: 'Century Mark',
      description: 'Complete 100 calls',
      icon: '💯',
      category: 'volume',
      earned: totalCalls >= 100,
      progress: Math.min(100, Math.round((totalCalls / 100) * 100)),
      progressLabel: `${totalCalls} / 100 calls`,
    },
    {
      id: 'calls_250',
      name: 'Quarter Thousand',
      description: 'Complete 250 calls',
      icon: '🏆',
      category: 'volume',
      earned: totalCalls >= 250,
      progress: Math.min(100, Math.round((totalCalls / 250) * 100)),
      progressLabel: `${totalCalls} / 250 calls`,
    },
    // ── Policies ──────────────────────────────────────────────────────────────
    {
      id: 'first_policy',
      name: 'First Policy',
      description: 'Write your first policy',
      icon: '📝',
      category: 'volume',
      earned: totalPolicies >= 1,
      earnedAt: firstPolicy?.started_at,
      progress: Math.min(100, totalPolicies * 100),
      progressLabel: `${totalPolicies} / 1 policy`,
    },
    {
      id: 'policies_10',
      name: '10 Policies',
      description: 'Write 10 policies',
      icon: '📋',
      category: 'volume',
      earned: totalPolicies >= 10,
      progress: Math.min(100, Math.round((totalPolicies / 10) * 100)),
      progressLabel: `${totalPolicies} / 10 policies`,
    },
    {
      id: 'policies_25',
      name: '25 Policies',
      description: 'Write 25 policies',
      icon: '⭐',
      category: 'volume',
      earned: totalPolicies >= 25,
      progress: Math.min(100, Math.round((totalPolicies / 25) * 100)),
      progressLabel: `${totalPolicies} / 25 policies`,
    },
    // ── Quality ───────────────────────────────────────────────────────────────
    {
      id: 'score_80',
      name: 'Sharp Agent',
      description: 'Score 80+ on any call',
      icon: '🔥',
      category: 'quality',
      earned: bestScore >= 80,
      progress: Math.min(100, Math.round((bestScore / 80) * 100)),
      progressLabel: `Best score: ${bestScore} / 80`,
    },
    {
      id: 'score_90',
      name: '90+ Score',
      description: 'Score 90 or higher on any call',
      icon: '💎',
      category: 'quality',
      earned: ninetyPlusCalls >= 1,
      progress: Math.min(100, Math.round((bestScore / 90) * 100)),
      progressLabel: `Best score: ${bestScore} / 90`,
    },
    {
      id: 'most_improved',
      name: 'Most Improved',
      description: 'Improve average score by 10+ points (first 5 vs last 5 calls)',
      icon: '📈',
      category: 'quality',
      earned: scoreDelta >= 10,
      progress: scores.length >= 10
        ? Math.min(100, Math.round((Math.max(0, scoreDelta) / 10) * 100))
        : Math.round((scores.length / 10) * 50),
      progressLabel: scores.length >= 10
        ? `${scoreDelta >= 0 ? '+' : ''}${scoreDelta} pts improvement`
        : `Need ${10 - scores.length} more scored calls`,
    },
    // ── Mastery ───────────────────────────────────────────────────────────────
    {
      id: 'perfect_discovery',
      name: 'Perfect Discovery',
      description: 'Score 95+ on Discovery in a single call',
      icon: '🔍',
      category: 'mastery',
      earned: perfectDiscoveryCalls >= 1,
      progress: perfectDiscoveryCalls >= 1 ? 100 : Math.min(99, avgDiscovery),
      progressLabel: perfectDiscoveryCalls >= 1
        ? `${perfectDiscoveryCalls} perfect call${perfectDiscoveryCalls > 1 ? 's' : ''}`
        : `Avg discovery: ${avgDiscovery} / 95`,
    },
    {
      id: 'perfect_rapport',
      name: 'Perfect Rapport',
      description: 'Score 95+ on Rapport in a single call',
      icon: '🤝',
      category: 'mastery',
      earned: perfectRapportCalls >= 1,
      progress: perfectRapportCalls >= 1 ? 100 : Math.min(99, avgRapport),
      progressLabel: perfectRapportCalls >= 1
        ? `${perfectRapportCalls} perfect call${perfectRapportCalls > 1 ? 's' : ''}`
        : `Avg rapport: ${avgRapport} / 95`,
    },
    {
      id: 'discovery_master',
      name: 'Discovery Master',
      description: 'Average 85+ Discovery score across 10+ calls',
      icon: '🎓',
      category: 'mastery',
      earned: scores.length >= 10 && avgDiscovery >= 85,
      progress: Math.min(100, Math.round((avgDiscovery / 85) * 100)),
      progressLabel: `Avg: ${avgDiscovery} / 85 (${scores.length} calls)`,
    },
    {
      id: 'rapport_expert',
      name: 'Rapport Expert',
      description: 'Average 85+ Rapport score across 10+ calls',
      icon: '😊',
      category: 'mastery',
      earned: scores.length >= 10 && avgRapport >= 85,
      progress: Math.min(100, Math.round((avgRapport / 85) * 100)),
      progressLabel: `Avg: ${avgRapport} / 85 (${scores.length} calls)`,
    },
    {
      id: 'objection_handler',
      name: 'Objection Handler',
      description: 'Average 85+ Objection Handling score across 10+ calls',
      icon: '🛡️',
      category: 'mastery',
      earned: scores.length >= 10 && avgObjections >= 85,
      progress: Math.min(100, Math.round((avgObjections / 85) * 100)),
      progressLabel: `Avg: ${avgObjections} / 85 (${scores.length} calls)`,
    },
    {
      id: 'closing_expert',
      name: 'Closing Expert',
      description: 'Average 85+ Closing score across 10+ calls',
      icon: '✍️',
      category: 'mastery',
      earned: scores.length >= 10 && avgClosing >= 85,
      progress: Math.min(100, Math.round((avgClosing / 85) * 100)),
      progressLabel: `Avg: ${avgClosing} / 85 (${scores.length} calls)`,
    },
    // ── Consistency ───────────────────────────────────────────────────────────
    {
      id: 'perfect_week',
      name: 'Perfect Week',
      description: 'Call every day for 7 consecutive days',
      icon: '📅',
      category: 'consistency',
      earned: longestStreak >= 7,
      progress: Math.min(100, Math.round((Math.max(currentStreak, longestStreak) / 7) * 100)),
      progressLabel: `Best streak: ${longestStreak} / 7 days`,
    },
    {
      id: 'consistency_champion',
      name: 'Consistency Champion',
      description: 'Call every day for 14 consecutive days',
      icon: '🏅',
      category: 'consistency',
      earned: longestStreak >= 14,
      progress: Math.min(100, Math.round((Math.max(currentStreak, longestStreak) / 14) * 100)),
      progressLabel: `Best streak: ${longestStreak} / 14 days`,
    },
  ];

  return NextResponse.json({
    achievements,
    earned: achievements.filter((a) => a.earned).length,
    total: achievements.length,
    totalCalls,
    totalPolicies,
    bestScore,
  });
}
