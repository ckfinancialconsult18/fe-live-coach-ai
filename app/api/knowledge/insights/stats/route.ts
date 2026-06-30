import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api/guard';
import type { PipelineStats, KnowledgeType, KnowledgeFile } from '@/lib/pipeline/types';

export async function GET() {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;

  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

  const [{ data: jobs }, { data: entries }] = await Promise.all([
    supabase.from('knowledge_jobs').select('status, call_type, created_at'),
    supabase.from('knowledge_base').select('type, target_file, status, confidence, is_duplicate, created_at, summary'),
  ]);

  const jobList = jobs ?? [];
  const entryList = entries ?? [];

  const byType: Partial<Record<KnowledgeType, number>> = {};
  const byFile: Partial<Record<KnowledgeFile, number>> = {};
  for (const e of entryList) {
    byType[e.type as KnowledgeType] = (byType[e.type as KnowledgeType] ?? 0) + 1;
    byFile[e.target_file as KnowledgeFile] = (byFile[e.target_file as KnowledgeFile] ?? 0) + 1;
  }

  const confidenceBuckets = [
    { range: '90-100', min: 90, max: 100 },
    { range: '70-89', min: 70, max: 89 },
    { range: '50-69', min: 50, max: 69 },
  ];
  const confidenceDistribution = confidenceBuckets.map(({ range, min, max }) => ({
    range,
    count: entryList.filter((e) => e.confidence >= min && e.confidence <= max).length,
  }));

  // 14-day activity from knowledge_base creation dates (proxy for "processed");
  // approved subset for "approved" line.
  const activityMap = new Map<string, { processed: number; approved: number }>();
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    activityMap.set(d.toISOString().split('T')[0], { processed: 0, approved: 0 });
  }
  for (const e of entryList) {
    const day = e.created_at.split('T')[0];
    if (activityMap.has(day)) {
      const bucket = activityMap.get(day)!;
      bucket.processed++;
      if (e.status === 'approved') bucket.approved++;
    }
  }

  const stats: PipelineStats = {
    totalJobs: jobList.length,
    completedJobs: jobList.filter((j) => j.status === 'pending_review' || j.status === 'completed').length,
    failedJobs: jobList.filter((j) => j.status === 'failed').length,
    queuedJobs: jobList.filter((j) => ['queued', 'parsing', 'extracting', 'deduplicating'].includes(j.status)).length,
    totalTranscripts: jobList.length,
    salesCalls: jobList.filter((j) => j.call_type === 'sales').length,
    coachingCalls: jobList.filter((j) => j.call_type === 'coaching').length,
    totalInsightsExtracted: entryList.length,
    pendingReview: entryList.filter((e) => e.status === 'pending').length,
    approvedTotal: entryList.filter((e) => e.status === 'approved').length,
    rejectedTotal: entryList.filter((e) => e.status === 'rejected').length,
    duplicatesSkipped: entryList.filter((e) => e.is_duplicate).length,
    byType,
    byFile,
    topObjections: topByText(entryList, 'objection'),
    topMedications: topByText(entryList, 'medication'),
    topBuyingSignals: topByText(entryList, 'buying_signal'),
    confidenceDistribution,
    recentActivity: Array.from(activityMap.entries()).map(([date, v]) => ({ date, ...v })),
  };

  return NextResponse.json({ stats });
}

function topByText(entries: { type: string; summary: string }[], type: string): { text: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const e of entries) {
    if (e.type !== type) continue;
    counts.set(e.summary, (counts.get(e.summary) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([text, count]) => ({ text, count }));
}
