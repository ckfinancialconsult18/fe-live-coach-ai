import type { CoachInsight, ChecklistItem, CallStage, LiveSalesScores } from './types';

// Matches the post-call weighted scoring weights so live and post-call scores
// are comparable and agents build an intuition for the scale.
const WEIGHTS: Record<keyof Omit<LiveSalesScores, 'overall'>, number> = {
  rapport:           0.15,
  discovery:         0.20,
  trust:             0.15,
  urgency:           0.10,
  presentation:      0.15,
  objectionHandling: 0.10,
  closingReadiness:  0.15,
};

const STAGE_ORDER: CallStage[] = [
  'introduction', 'permission', 'discovery', 'existing_coverage',
  'health', 'budget', 'presentation', 'objections', 'close',
];

/**
 * Compute live sales scores deterministically from observable call metrics
 * and LLM-interpreted signals (rapportBuilt, discoveryComplete, urgency,
 * stallDetected, closeOpportunityPct). The LLM interprets context; this
 * function converts those signals into consistent 0-100 scores.
 */
export function computeLiveScores(
  insight: CoachInsight,
  checklist: ChecklistItem[],
  stage: CallStage,
): LiveSalesScores {
  const stageIdx = STAGE_ORDER.indexOf(stage);

  // ── Discovery — checklist completion is the ground truth ─────────────────
  const checkedCount = checklist.filter((c) => c.checked).length;
  const totalChecklist = Math.max(1, checklist.length);
  const checklistPct = Math.round((checkedCount / totalChecklist) * 100);
  // If the LLM confirmed discovery complete, floor at 85 even if checklist lags
  const discovery = insight.discoveryComplete
    ? Math.max(checklistPct, 85)
    : checklistPct;

  // ── Rapport — LLM rapportBuilt + missed-question penalty ─────────────────
  const missedPenalty = Math.min(30, insight.missedQuestions.length * 8);
  const rapport = insight.rapportBuilt
    ? Math.max(60, 90 - missedPenalty)
    : Math.max(15, 50 - missedPenalty);

  // ── Trust — rapport × 0.6 + discovery × 0.3 ± stall adjustment ──────────
  const trust = Math.min(100, Math.max(0,
    Math.round(rapport * 0.6 + discovery * 0.3 + (insight.stallDetected ? -15 : 5))
  ));

  // ── Urgency — from LLM urgency enum (high/medium/low) ───────────────────
  const urgency = insight.urgency === 'high' ? 90
                : insight.urgency === 'medium' ? 65
                : 35;

  // ── Presentation — only meaningful after budget stage; scales with discovery
  const presentationStageIdx = STAGE_ORDER.indexOf('presentation');
  const budgetStageIdx = STAGE_ORDER.indexOf('budget');
  const presentation = stageIdx >= presentationStageIdx
    ? Math.max(60, discovery - 10)
    : stageIdx >= budgetStageIdx
    ? Math.round(discovery * 0.7)
    : Math.round(discovery * 0.35);

  // ── Objection Handling — 85 baseline (no objections = competent neutral) ─
  const objectionHandling = insight.stallDetected           ? 40
                           : insight.objectionAnalysis      ? 72
                           : insight.likelyCominObjection   ? 65
                           : 85;

  // ── Closing Readiness — closeOpportunityPct × 0.8 + readyForApp bonus ───
  const nbaBonus = insight.nextBestAction?.readyForApplication ? 20 : 0;
  const closingReadiness = Math.min(100,
    Math.round(insight.closeOpportunityPct * 0.8) + nbaBonus
  );

  const raw: Omit<LiveSalesScores, 'overall'> = {
    rapport: clamp(rapport),
    discovery: clamp(discovery),
    trust: clamp(trust),
    urgency: clamp(urgency),
    presentation: clamp(Math.min(100, presentation)),
    objectionHandling: clamp(objectionHandling),
    closingReadiness: clamp(closingReadiness),
  };

  const overall = clamp(Math.round(
    (Object.keys(WEIGHTS) as Array<keyof typeof WEIGHTS>)
      .reduce((sum, k) => sum + raw[k] * WEIGHTS[k], 0)
  ));

  return { ...raw, overall };
}

function clamp(n: number): number {
  return Math.min(100, Math.max(0, Math.round(n)));
}
