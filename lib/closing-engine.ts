// ── Live Closing Assistant — deterministic engine ────────────────────────────
// Derives sale probability, readiness, requirements, buying-signal strength,
// and danger signals from observable transcript signals + AI-provided overlays.
// No extra API calls — everything comes from data already computed each turn.

import type {
  CoachInsight,
  CallStage,
  ChecklistItem,
  LiveSalesScores,
  MissedOpportunityState,
  LiveObjectionState,
  ClosingReadiness,
  ClosingRequirement,
  EnhancedBuyingSignal,
  BuyingSignalStrength,
  DangerSignal,
  CloseProbabilityReason,
  ProbabilitySnapshot,
  LiveClosingState,
} from './types';

// ── Stage progression weight (0–8) ───────────────────────────────────────────
const STAGE_PROGRESS: Record<CallStage, number> = {
  introduction: 1,
  permission: 2,
  discovery: 3,
  existing_coverage: 4,
  health: 5,
  budget: 6,
  presentation: 7,
  objections: 5,
  close: 8,
};

// ── Buying-signal category → strength + label ─────────────────────────────────
const SIGNAL_STRENGTH: Record<string, BuyingSignalStrength> = {
  commitment: 'very_strong',
  agreement: 'strong',
  urgency: 'strong',
  financial_concern: 'strong',
  curiosity: 'moderate',
  trust: 'moderate',
  hesitation: 'weak',
  confusion: 'weak',
};

const SIGNAL_LABEL: Record<string, string> = {
  commitment: 'Commitment Signal',
  agreement: 'Prospect Agreement',
  urgency: 'Expressed Urgency',
  financial_concern: 'Financial Interest',
  curiosity: 'Prospect Curiosity',
  trust: 'Trust Building',
  hesitation: 'Hesitation',
  confusion: 'Needs Clarification',
};

// ── Static closing scripts by readiness ───────────────────────────────────────
const STATIC_SCRIPTS: Record<ClosingReadiness, string> = {
  ready_to_close:
    "Based on everything you've shared, I have a plan that's a perfect fit. Let me take just a few minutes to get you started — is that okay with you?",
  almost_ready:
    "You've given me everything I need to find the right plan. Let me show you what I put together — I think you're going to love it.",
  needs_discovery:
    "Before I show you the numbers, I want to make sure I have everything right. Can I ask you a couple more quick questions?",
  high_risk:
    "I want to make sure I'm addressing your concerns. What would make this feel like the right decision for you today?",
  lost_sale:
    "I completely understand — this isn't always the right time for everyone. Can I ask what your biggest concern is? I want to make sure I haven't left anything on the table.",
};

// ── Main entry point ──────────────────────────────────────────────────────────
export function computeClosingState(
  insight: CoachInsight,
  checklist: ChecklistItem[],
  stage: CallStage,
  liveScores: LiveSalesScores,
  missedOpportunities: MissedOpportunityState,
  liveObjectionState: LiveObjectionState,
  probabilityHistory: ProbabilitySnapshot[],
): LiveClosingState {
  const ai = insight.closingAssistant;

  // ── Probability ─────────────────────────────────────────────────────────────
  // Start from AI's closeOpportunityPct — it integrates conversation quality.
  // Apply deterministic corrections for things AI can't always weigh correctly.
  let prob = insight.closeOpportunityPct;

  // Discovery penalty: AI sees only recent lines; incomplete discovery hurts close odds
  if (missedOpportunities.progressPct < 20) prob -= 12;
  else if (missedOpportunities.progressPct < 40) prob -= 6;

  // Active objection penalties (additive — multiple objections stack)
  const allActive = [
    ...(liveObjectionState.primary ? [liveObjectionState.primary] : []),
    ...liveObjectionState.additional,
  ];
  for (const obj of allActive) {
    if (obj.priority === 'critical') prob -= 22;
    else if (obj.priority === 'high') prob -= 13;
    else if (obj.priority === 'medium') prob -= 6;
    else prob -= 2;
  }

  // Stage boost: late-stage calls with a healthy score get a floor lift
  const stageBoost = (STAGE_PROGRESS[stage] - 4) * 2; // –6 at intro, +8 at close
  prob = Math.round(Math.max(2, Math.min(97, prob + stageBoost)));

  // ── Confidence ──────────────────────────────────────────────────────────────
  const checklistMet = checklist.filter(c => c.checked).length;
  const stageProg = STAGE_PROGRESS[stage];
  const sigCount = insight.buyingSignalDetails.length;
  const confidence = Math.round(Math.min(90, 20 + checklistMet * 5 + stageProg * 4 + sigCount * 3));

  // ── Readiness ────────────────────────────────────────────────────────────────
  const hasCritical = allActive.some(o => o.priority === 'critical');
  let readiness: ClosingReadiness;
  if (prob >= 80 && !hasCritical) readiness = 'ready_to_close';
  else if (prob >= 62) readiness = 'almost_ready';
  else if (prob >= 40) readiness = 'needs_discovery';
  else if (prob >= 20) readiness = 'high_risk';
  else readiness = 'lost_sale';

  // ── Requirements ─────────────────────────────────────────────────────────────
  const clMap = new Map(checklist.map(c => [c.id, c.checked]));
  const discoMap = new Map(missedOpportunities.items.map(i => [i.id, i.state]));
  const discoMet = (id: string) => discoMap.get(id) === 'completed';

  const requirements: ClosingRequirement[] = [
    {
      id: 'beneficiary',
      label: 'Beneficiary named',
      met: !!(clMap.get('beneficiary') || discoMet('beneficiary_name') || discoMet('beneficiary_relationship')),
    },
    {
      id: 'health',
      label: 'Health qualified',
      met: !!(clMap.get('health') || (discoMet('tobacco') && discoMet('medications'))),
    },
    {
      id: 'medications',
      label: 'Medications reviewed',
      met: !!(discoMet('medications') || clMap.get('health')),
    },
    {
      id: 'budget',
      label: 'Budget confirmed',
      met: !!(clMap.get('budget') || discoMet('budget') || discoMet('monthly_income')),
    },
    {
      id: 'existing_coverage',
      label: 'Existing coverage asked',
      met: !!(clMap.get('existing') || discoMet('existing_coverage')),
    },
    {
      id: 'funeral_plans',
      label: 'Funeral plans discussed',
      met: !!(clMap.get('funeral') || discoMet('burial_wishes') || discoMet('funeral_planning')),
    },
    {
      id: 'banking',
      label: 'Banking confirmed',
      met: !!(discoMet('bank_account') || discoMet('checking_account')),
    },
    {
      id: 'coverage_amount',
      label: 'Coverage amount chosen',
      met: stage === 'presentation' || stage === 'close' || !!clMap.get('close'),
    },
  ];

  // ── Buying signals with strength ─────────────────────────────────────────────
  const strengthOverrides = new Map(
    (ai?.buyingSignalStrengths ?? []).map(s => [s.category, s.strength as BuyingSignalStrength]),
  );
  const buyingSignals: EnhancedBuyingSignal[] = insight.buyingSignalDetails.map(sig => ({
    category: sig.category,
    label: SIGNAL_LABEL[sig.category] ?? sig.category.replace(/_/g, ' '),
    strength: strengthOverrides.get(sig.category) ?? SIGNAL_STRENGTH[sig.category] ?? 'moderate',
    quote: sig.quote,
  }));

  // ── Danger signals ───────────────────────────────────────────────────────────
  const dangerSignals: DangerSignal[] = [];

  // Repeated objection types
  const objTypeCount = new Map<string, number>();
  for (const h of liveObjectionState.history) {
    objTypeCount.set(h.type, (objTypeCount.get(h.type) ?? 0) + 1);
  }
  const repeated = [...objTypeCount.entries()].filter(([, c]) => c >= 2);
  if (repeated.length > 0) {
    const [type, count] = repeated[0];
    dangerSignals.push({
      type: 'repeated_objection',
      label: 'Repeated Objection',
      description: `"${type.replace(/_/g, ' ')}" has come up ${count} times — this is a core concern, not a brush-off.`,
    });
  }

  // Too many objections
  if (liveObjectionState.history.length >= 4 && repeated.length === 0) {
    dangerSignals.push({
      type: 'objection_overload',
      label: 'High Objection Volume',
      description: `${liveObjectionState.history.length} objections detected — slow down, rebuild trust before proceeding.`,
    });
  }

  // Price fixation
  const priceTypes = new Set(['too_expensive', 'cant_afford_it', 'have_savings', 'no_monthly_payments']);
  const priceCount = liveObjectionState.history.filter(h => priceTypes.has(h.type)).length;
  if (priceCount >= 2) {
    dangerSignals.push({
      type: 'price_fixation',
      label: 'Price Fixation',
      description: 'Multiple price-related objections detected — anchor to daily cost and emotional outcome, not the monthly premium.',
    });
  }

  // Conversation stalled
  if (insight.stallDetected) {
    dangerSignals.push({
      type: 'stall_detected',
      label: 'Conversation Stalled',
      description: 'No new information being exchanged. Ask a pivot question to change direction.',
    });
  }

  // Low rapport in critical stage
  if (['budget', 'presentation', 'objections', 'close'].includes(stage) && liveScores.rapport < 45) {
    dangerSignals.push({
      type: 'lost_rapport',
      label: 'Low Rapport',
      description: 'Rapport is low for this stage. Rebuild connection before pushing forward — use the prospect\'s name and show empathy.',
    });
  }

  // Discovery incomplete while trying to close
  if (stage === 'close' && missedOpportunities.progressPct < 50) {
    dangerSignals.push({
      type: 'premature_close',
      label: 'Discovery Incomplete',
      description: 'Attempting to close without finishing discovery. Address missing requirements first to avoid objections later.',
    });
  }

  // AI-provided danger signals (merge, no duplicates)
  for (const d of ai?.dangerSignals ?? []) {
    if (!dangerSignals.some(ex => ex.type === d.type)) {
      dangerSignals.push({
        type: d.type,
        label: d.type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        description: d.description,
      });
    }
  }

  // ── Next action ──────────────────────────────────────────────────────────────
  let nextAction = '';
  if (liveObjectionState.primary?.priority === 'critical') {
    nextAction = `Handle the "${liveObjectionState.primary.type.replace(/_/g, ' ')}" objection before moving forward.`;
  } else if (insight.nextBestAction?.nextQuestion) {
    nextAction = insight.nextBestAction.nextQuestion;
  } else {
    const firstUnmet = requirements.find(r => !r.met);
    if (readiness === 'ready_to_close') nextAction = 'Ask for the application now.';
    else if (readiness === 'almost_ready') nextAction = 'Present the recommendation and ask for the close.';
    else if (firstUnmet) nextAction = `Complete discovery — ask about: ${firstUnmet.label.toLowerCase()}.`;
    else if (readiness === 'high_risk') nextAction = 'Rebuild rapport and re-qualify the prospect\'s needs.';
    else nextAction = 'Listen carefully and ask what their main concern is.';
  }

  // ── Closing script ───────────────────────────────────────────────────────────
  const closingScript = ai?.closingScript || STATIC_SCRIPTS[readiness];

  // ── Probability reasons ──────────────────────────────────────────────────────
  const reasons: CloseProbabilityReason[] = ai?.reasons ?? buildDeterministicReasons(
    insight, checklist, stage, liveScores, missedOpportunities, liveObjectionState,
  );

  // ── Probability history (append current snapshot, cap at 60) ─────────────────
  const now = Date.now();
  const lastEntry = probabilityHistory[probabilityHistory.length - 1];
  const newHistory: ProbabilitySnapshot[] =
    lastEntry?.value === prob
      ? probabilityHistory
      : [...probabilityHistory.slice(-59), { value: prob, timestampMs: now }];

  return {
    probability: prob,
    confidence,
    readiness,
    reasons,
    requirements,
    nextAction,
    closingScript,
    buyingSignals,
    dangerSignals,
    probabilityHistory: newHistory,
  };
}

// ── Deterministic reason generation ──────────────────────────────────────────
// Used as fallback when AI doesn't provide reasons.
function buildDeterministicReasons(
  insight: CoachInsight,
  checklist: ChecklistItem[],
  stage: CallStage,
  liveScores: LiveSalesScores,
  missedOpportunities: MissedOpportunityState,
  liveObjectionState: LiveObjectionState,
): CloseProbabilityReason[] {
  const reasons: CloseProbabilityReason[] = [];

  if (insight.rapportBuilt) reasons.push({ text: 'Rapport established', direction: '+' });
  if (insight.discoveryComplete) reasons.push({ text: 'Discovery complete', direction: '+' });
  if (checklist.find(c => c.id === 'beneficiary')?.checked)
    reasons.push({ text: 'Beneficiary identified', direction: '+' });
  if (checklist.find(c => c.id === 'budget')?.checked)
    reasons.push({ text: 'Budget confirmed', direction: '+' });
  if (checklist.find(c => c.id === 'health')?.checked)
    reasons.push({ text: 'Health qualified', direction: '+' });
  if (insight.buyingSignalDetails.some(s => s.category === 'commitment' || s.category === 'agreement'))
    reasons.push({ text: 'Buying signals detected', direction: '+' });
  if (liveScores.rapport >= 70) reasons.push({ text: 'Strong rapport score', direction: '+' });

  if (liveObjectionState.primary?.priority === 'critical')
    reasons.push({ text: `Critical objection: ${liveObjectionState.primary.type.replace(/_/g, ' ')}`, direction: '-' });
  else if (liveObjectionState.primary)
    reasons.push({ text: `Active objection: ${liveObjectionState.primary.type.replace(/_/g, ' ')}`, direction: '-' });
  if (missedOpportunities.progressPct < 40)
    reasons.push({ text: 'Discovery incomplete', direction: '-' });
  if (insight.stallDetected)
    reasons.push({ text: 'Conversation stalled', direction: '-' });
  if (liveObjectionState.history.length >= 3)
    reasons.push({ text: 'Multiple objections raised', direction: '-' });

  // Stage-specific reasons
  if (stage === 'close' || stage === 'presentation')
    reasons.push({ text: `Reached ${stage.replace(/_/g, ' ')} stage`, direction: '+' });

  return reasons.slice(0, 8); // cap to avoid overwhelming the UI
}
