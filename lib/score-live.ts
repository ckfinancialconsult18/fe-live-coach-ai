import type { CoachInsight, ChecklistItem, CallStage, TranscriptLine, LiveSalesScores } from './types';

// ── Weights mirror the post-call scoring so live and post-call scores are
// on the same scale. Agents build an intuition once, not twice.
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

// ── Keywords used to classify what the agent asked about ─────────────────────
const KW_HEALTH = ['health', 'medical', 'doctor', 'hospital', 'condition', 'diagnos',
  'diabetes', 'heart', 'cancer', 'copd', 'stroke', 'kidney', 'oxygen', 'wheelchair',
  'walker', 'tobacco', 'smok', 'medication', 'surgery', 'weight', 'height', 'bmi'];
const KW_BUDGET = ['budget', 'afford', 'premium', 'payment', 'month', 'cost', 'price',
  'spend', 'income', 'how much', 'dollar', 'per month', 'financial'];
const KW_COVERAGE = ['coverage', 'policy', 'insurance', 'existing', 'current', 'already have',
  'have any', 'life insurance', 'burial', 'final expense'];
const KW_BENEFICIARY = ['beneficiary', 'benefit', 'recipient', 'who would', 'leave behind',
  'take care of', 'left behind', 'named'];
const KW_FAMILY = ['family', 'spouse', 'wife', 'husband', 'children', 'kids', 'grandchildren',
  'grandkids', 'son', 'daughter', 'loved ones', 'dependent'];
const KW_MOTIVATION = ['why', 'reason', 'concern', 'worry', 'important', 'matter', 'peace of mind',
  'protect', 'goal', 'looking for', 'help you'];
const KW_GREETING = ['hello', 'hi ', 'good morning', 'good afternoon', 'good evening',
  'how are you', "how's", 'nice to', 'pleasure', 'my name is', 'calling from'];
const KW_EMPATHY = ["i understand", "i hear you", "that makes sense", "absolutely",
  "i appreciate", "thank you for sharing", "of course", "i know", "you're right"];
const FILLER_WORDS = /\b(um+|uh+|like|you know|basically|actually|literally|so+|yeah)\b/gi;

export interface TranscriptSignals {
  agentQuestionCount: number;
  agentTalkPct: number;           // 0-1; ideal ≤ 0.55
  fillerRate: number;             // fillers per agent line; ideal < 0.4
  hasGreeting: boolean;
  showedEmpathy: boolean;
  prospectEngaged: boolean;       // prospect contributed > 25% of words
  askedHealth: boolean;
  askedBudget: boolean;
  askedCoverage: boolean;
  askedBeneficiary: boolean;
  mentionedFamily: boolean;
  askedMotivation: boolean;
  prospectBuyingSignalWords: number; // how often prospect said positive-intent words
}

// ── Signal extraction — pure, no side effects ─────────────────────────────────
export function extractSignals(transcript: TranscriptLine[]): TranscriptSignals {
  if (transcript.length === 0) {
    return {
      agentQuestionCount: 0, agentTalkPct: 0.5, fillerRate: 0,
      hasGreeting: false, showedEmpathy: false, prospectEngaged: false,
      askedHealth: false, askedBudget: false, askedCoverage: false,
      askedBeneficiary: false, mentionedFamily: false, askedMotivation: false,
      prospectBuyingSignalWords: 0,
    };
  }

  const agentLines = transcript.filter(l => l.speaker === 'agent');
  const prospectLines = transcript.filter(l => l.speaker === 'prospect');

  const agentFull = agentLines.map(l => l.text.toLowerCase()).join(' ');
  const prospectFull = prospectLines.map(l => l.text.toLowerCase()).join(' ');

  const agentWords = agentLines.reduce((n, l) => n + l.text.split(/\s+/).length, 0);
  const prospectWords = prospectLines.reduce((n, l) => n + l.text.split(/\s+/).length, 0);
  const totalWords = agentWords + prospectWords || 1;

  const fillerMatches = agentFull.match(FILLER_WORDS) ?? [];
  const fillerRate = agentLines.length > 0 ? fillerMatches.length / agentLines.length : 0;

  const firstThreeAgent = agentLines.slice(0, 3).map(l => l.text.toLowerCase()).join(' ');

  const prospectPositive = ['interested', 'sounds good', 'tell me more', 'sure', 'yes',
    'absolutely', 'definitely', 'how much', 'when can', 'what would', 'i want', 'i need',
    "let's do", 'go ahead'];
  const prospectBuyingSignalWords = prospectPositive.filter(w => prospectFull.includes(w)).length;

  return {
    agentQuestionCount: agentLines.filter(l => l.text.includes('?')).length,
    agentTalkPct: agentWords / totalWords,
    fillerRate,
    hasGreeting: KW_GREETING.some(kw => firstThreeAgent.includes(kw)),
    showedEmpathy: KW_EMPATHY.some(kw => agentFull.includes(kw)),
    prospectEngaged: prospectWords > totalWords * 0.25,
    askedHealth: KW_HEALTH.some(kw => agentFull.includes(kw)),
    askedBudget: KW_BUDGET.some(kw => agentFull.includes(kw)),
    askedCoverage: KW_COVERAGE.some(kw => agentFull.includes(kw)),
    askedBeneficiary: KW_BENEFICIARY.some(kw => agentFull.includes(kw)),
    mentionedFamily: KW_FAMILY.some(kw => agentFull.includes(kw) || prospectFull.includes(kw)),
    askedMotivation: KW_MOTIVATION.some(kw => agentFull.includes(kw)),
    prospectBuyingSignalWords,
  };
}

// ── Individual score functions ────────────────────────────────────────────────

function rapport(insight: CoachInsight, sig: TranscriptSignals): number {
  let s = 30;
  // Greeting and opening quality
  if (sig.hasGreeting) s += 12;
  // LLM-confirmed rapport
  if (insight.rapportBuilt) s += 15;
  // Prospect is talking (engaged)
  if (sig.prospectEngaged) s += 10;
  // Agent is listening (not dominating)
  if (sig.agentTalkPct <= 0.50) s += 10;
  else if (sig.agentTalkPct <= 0.60) s += 5;
  // Empathy
  if (sig.showedEmpathy) s += 10;
  // Filler words erode trust
  if (sig.fillerRate < 0.3) s += 5;
  else if (sig.fillerRate > 0.8) s -= 8;
  // Stall kills rapport quickly
  if (insight.stallDetected) s -= 18;
  // Missed questions penalty
  s -= Math.min(20, insight.missedQuestions.length * 6);
  return clamp(s);
}

function discovery(insight: CoachInsight, checklist: ChecklistItem[], sig: TranscriptSignals): number {
  // Checklist completion is the ground truth — these are exactly the questions
  // the agent should have asked
  const checked = checklist.filter(c => c.checked).length;
  const total = Math.max(1, checklist.length);
  let s = Math.round((checked / total) * 60); // checklist is worth 60 pts

  // Bonus for specific question categories asked (keyword analysis)
  if (sig.askedHealth) s += 6;
  if (sig.askedBudget) s += 6;
  if (sig.askedCoverage) s += 6;
  if (sig.askedBeneficiary) s += 6;
  if (sig.mentionedFamily || insight.familyReferences.length > 0) s += 6;
  if (sig.askedMotivation) s += 5;

  // Question depth bonus
  if (sig.agentQuestionCount >= 5) s += 5;
  if (sig.agentQuestionCount >= 10) s += 5;

  // LLM confirms discovery is complete → floor at 85
  if (insight.discoveryComplete) s = Math.max(s, 85);

  return clamp(s);
}

function trust(insight: CoachInsight, sig: TranscriptSignals, rapportScore: number, discoveryScore: number): number {
  // Trust is earned through competence (discovery) + relationship (rapport)
  let s = Math.round(rapportScore * 0.45 + discoveryScore * 0.35);
  // Clear, filler-free speech = professional confidence
  if (sig.fillerRate < 0.2) s += 12;
  else if (sig.fillerRate < 0.4) s += 6;
  else if (sig.fillerRate > 0.8) s -= 10;
  // Stall signals uncertainty
  if (insight.stallDetected) s -= 15;
  else s += 5;
  // Question depth demonstrates expertise
  if (sig.agentQuestionCount >= 8) s += 6;
  return clamp(s);
}

function urgency(insight: CoachInsight, sig: TranscriptSignals): number {
  // Primary: LLM-classified urgency level
  let s = insight.urgency === 'high' ? 88
        : insight.urgency === 'medium' ? 62
        : 30;
  // Prospect buying-signal words amplify
  s += Math.min(12, sig.prospectBuyingSignalWords * 4);
  return clamp(s);
}

function presentation(stageIdx: number, discoveryScore: number, insight: CoachInsight): number {
  const presIdx = STAGE_ORDER.indexOf('presentation');
  const budgetIdx = STAGE_ORDER.indexOf('budget');
  // Before budget stage: almost nothing to present yet
  if (stageIdx < budgetIdx) return clamp(Math.round(discoveryScore * 0.3));
  // Budget done, pre-presentation: prep score
  if (stageIdx < presIdx) return clamp(Math.round(discoveryScore * 0.65));
  // In or past presentation: strong floor once discovery is solid
  const base = Math.max(62, discoveryScore - 8);
  const nbaBoost = insight.nextBestAction?.actionType === 'present_product' ? 8 : 0;
  return clamp(base + nbaBoost);
}

function objectionHandling(insight: CoachInsight): number {
  // 85 baseline — no active objection means the agent is doing fine
  if (insight.stallDetected) return 38;
  // Active objection being handled
  if (insight.objectionAnalysis) return 70;
  // Objection looming but not yet surfaced
  if (insight.likelyCominObjection) return 62;
  return 85;
}

function closingReadiness(insight: CoachInsight, sig: TranscriptSignals, discoveryScore: number): number {
  let s = Math.round(insight.closeOpportunityPct * 0.75);
  // Structural buying signals
  const bsCount = insight.buyingSignalDetails.length;
  s += Math.min(18, bsCount * 6);
  // Prospect language buying signals
  s += Math.min(10, sig.prospectBuyingSignalWords * 3);
  // Ready for application (NBA engine)
  if (insight.nextBestAction?.readyForApplication) s += 15;
  // Discovery done is a prerequisite for closing
  if (insight.discoveryComplete) s += 8;
  else if (discoveryScore < 40) s = Math.min(s, 40); // can't close without discovery
  // No active problems blocking close
  if (!insight.objectionAnalysis && !insight.stallDetected) s += 5;
  return clamp(s);
}

// ── Public API ────────────────────────────────────────────────────────────────

export function computeLiveScores(
  insight: CoachInsight,
  checklist: ChecklistItem[],
  stage: CallStage,
  transcript: TranscriptLine[],
): LiveSalesScores {
  const sig = extractSignals(transcript);
  const stageIdx = STAGE_ORDER.indexOf(stage);

  const r  = rapport(insight, sig);
  const d  = discovery(insight, checklist, sig);
  const t  = trust(insight, sig, r, d);
  const u  = urgency(insight, sig);
  const p  = presentation(stageIdx, d, insight);
  const oh = objectionHandling(insight);
  const cr = closingReadiness(insight, sig, d);

  const raw: Omit<LiveSalesScores, 'overall'> = {
    rapport: r, discovery: d, trust: t, urgency: u,
    presentation: p, objectionHandling: oh, closingReadiness: cr,
  };

  const overall = clamp(Math.round(
    (Object.keys(WEIGHTS) as Array<keyof typeof WEIGHTS>)
      .reduce((sum, k) => sum + raw[k] * WEIGHTS[k], 0),
  ));

  return { ...raw, overall };
}

function clamp(n: number): number {
  return Math.min(100, Math.max(0, Math.round(n)));
}
