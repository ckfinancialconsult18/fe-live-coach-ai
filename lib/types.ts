// ── FE Live Coach AI types ────────────────────────────────────────────────────

export type Speaker = 'agent' | 'prospect';

export interface TranscriptLine {
  id: string;
  speaker: Speaker;
  text: string;
  timestamp: Date;
  sentiment?: 'positive' | 'neutral' | 'negative';
  /** 0-100. Diarization confidence (heuristic energy-based classifier — see lib/audio/diarization.ts), not transcription confidence. */
  speakerConfidence?: number;
  /** True once the agent has manually corrected the auto-assigned speaker for this line. */
  speakerEdited?: boolean;
}

export type CallStage =
  | 'introduction'
  | 'permission'
  | 'discovery'
  | 'existing_coverage'
  | 'health'
  | 'budget'
  | 'presentation'
  | 'objections'
  | 'close';

// ── Buying Signal Engine ───────────────────────────────────────────────────
export type BuyingSignalCategory =
  | 'curiosity' | 'urgency' | 'financial_concern' | 'trust'
  | 'hesitation' | 'agreement' | 'commitment' | 'confusion';

export interface BuyingSignal {
  category: BuyingSignalCategory;
  quote: string;
  confidence: number; // 0-100
}

// ── Objection Engine ────────────────────────────────────────────────────────
export type ObjectionPriority = 'critical' | 'high' | 'medium' | 'low';
export type ObjectionStatus = 'active' | 'resolved' | 'reopened';

/** Extended objection with coaching intelligence — superset of ObjectionAnalysis. */
export interface EnhancedObjectionAnalysis {
  type: string;
  quote: string;
  confidence: number;
  priority: ObjectionPriority;
  whyItOccurred: string;
  recommendedResponse: string;
  alternateResponse: string;
  followUpQuestion: string;
  emotionalContext: string;
  mistakesToAvoid: string[];
  closingBridge: string;
}

export interface ObjectionHistoryEntry {
  id: string;
  type: string;
  label: string;
  quote: string;
  timestampMs: number;
  confidence: number;
  priority: ObjectionPriority;
  reasoning: string;
  status: ObjectionStatus;
}

export interface ObjectionPatternMatch {
  label: string;
  types: string[];
  insight: string;
  strongerApproach: string;
}

export interface LiveObjectionState {
  primary: EnhancedObjectionAnalysis | null;
  additional: EnhancedObjectionAnalysis[];
  history: ObjectionHistoryEntry[];
  patterns: ObjectionPatternMatch[];
  riskScore: number;     // 0-100
}

export interface ObjectionAnalysis {
  type: string;
  quote: string;
  confidence: number; // 0-100
  whyItOccurred: string;
  recommendedResponse: string;
  alternateResponse: string;
  followUpQuestion: string;
  emotionalContext: string;
}

// ── Next Best Action Engine ─────────────────────────────────────────────────
export type NextBestActionType =
  | 'ask_question' | 'handle_objection' | 'build_rapport' | 'transition'
  | 'trial_close' | 'close_now' | 'present_product' | 'stop_talking';

export interface NextBestAction {
  actionType: NextBestActionType;
  nextQuestion: string;
  nextResponse: string;
  nextClose: string;
  talkListenGuidance: 'speak' | 'listen' | 'pause';
  readyForApplication: boolean;
  readyForApplicationReason: string;
}

// ── Milestone 3 Feature 3: Missed Opportunity Detection ─────────────────────

export type DiscoveryItemState = 'not_started' | 'in_progress' | 'completed' | 'needs_followup';

export interface DiscoveryItem {
  id: string;
  label: string;
  category: 'motivation' | 'beneficiary' | 'health' | 'financial' | 'logistics';
  state: DiscoveryItemState;
  note: string | null;          // why needs_followup, or what value was detected
}

export interface NextDiscoveryQuestion {
  itemId: string;
  label: string;
  question: string;
  urgency: 'critical' | 'high' | 'normal';
}

export interface MissedOpportunityState {
  items: DiscoveryItem[];
  nextQuestion: NextDiscoveryQuestion | null;
  progressPct: number;           // (completed / total) × 100
  contradictions: string[];      // human-readable contradiction descriptions
}

// ── Live Sales Scores (Milestone 3 Feature 2) ────────────────────────────────
export interface LiveSalesScores {
  rapport: number;           // 0-100 — empathy, name use, emotional connection
  discovery: number;         // 0-100 — checklist completion + question depth
  trust: number;             // 0-100 — consistency + rapport + no stall
  urgency: number;           // 0-100 — appropriate urgency established
  presentation: number;      // 0-100 — product clarity relative to stage progress
  objectionHandling: number; // 0-100 — 85 baseline when no objections, drops on stall
  closingReadiness: number;  // 0-100 — close opportunity pct + NBA readiness
  overall: number;           // 0-100 — weighted composite (matches post-call weights)
}

export interface CoachInsight {
  detectedObjection: string | null;
  objectType: 'objection' | 'buying_signal' | 'opportunity' | null;
  confidence: number;
  recommendedResponse: string;
  alternativeResponses: string[];
  whyThisWorks: string;
  nextBestQuestion: string;
  buyingSignals: string[];
  /** Structured buying signals (Buying Signal Engine) — falls back to empty array if the model omits it. */
  buyingSignalDetails: BuyingSignal[];
  /** Structured objection analysis (Objection Engine) — null when no objection is currently active. */
  objectionAnalysis: ObjectionAnalysis | null;
  /** Next Best Action Engine output. */
  nextBestAction: NextBestAction | null;
  closeOpportunityPct: number;
  emotionalOpportunities: string[];
  urgency: 'high' | 'medium' | 'low';
  /** Questions the agent should have asked by this point in the call but hasn't (real-time detection, Phase 4). */
  missedQuestions: string[];
  /** References to spouse/children/grandchildren/family detected this turn (Phase 4). */
  familyReferences: string[];
  /** Incremental mid-call memory facts extracted this turn (Part 7) — merge into persistent CallMemory, never overwrite with null/empty. */
  memoryUpdates: Partial<CallMemory> | null;

  // ── Milestone 3 Feature 2: Live Sales Scores ──────────────────────────────
  /** Deterministic live scores computed from observable metrics + LLM signals. Updated every coaching turn. */
  liveScores?: LiveSalesScores;

  // ── Milestone 3 Feature 4: Enhanced Objection Intelligence ───────────────
  /** Primary objection with full coaching intelligence (priority, mistakesToAvoid, closingBridge).
   *  Falls back to library defaults if AI omits the new fields. */
  enhancedObjection?: EnhancedObjectionAnalysis;
  /** Secondary objections active simultaneously — sorted by priority, highest first. */
  additionalObjections?: EnhancedObjectionAnalysis[];

  // ── Milestone 3 Feature 3: Missed Opportunity Detection ───────────────────
  /** Sparse map of discovery item state changes detected THIS turn by the AI.
   *  Only items whose state changed are included — not the full 21-item list. */
  discoveryUpdates?: Record<string, DiscoveryItemState>;

  // ── Milestone 3 Feature 1: Real-Time Situation Assessment ──────────────────
  /** True when the conversation has stalled — no new information being exchanged for multiple turns. */
  stallDetected: boolean;
  /** The objection type most likely to arise in the next 2-3 exchanges based on language patterns, or null. */
  likelyCominObjection: string | null;
  /** True when enough rapport has been established to transition to discovery/health/budget. */
  rapportBuilt: boolean;
  /** True when discovery is substantially complete for the current call stage. */
  discoveryComplete: boolean;
}

export interface UnderwritingProfile {
  age: string;
  gender: string;
  heightFt: string;
  heightIn: string;
  weight: string;
  tobacco: boolean | null;
  diabetes: boolean | null;
  cancer: boolean | null;
  copd: boolean | null;
  chf: boolean | null;
  stroke: boolean | null;
  kidneyDisease: boolean | null;
  oxygen: boolean | null;
  walker: boolean | null;
  wheelchair: boolean | null;
  hospitalizations: string;
  currentMedications: string;
  surgeries: string;
}

export type UnderwritingClass = 'preferred' | 'standard' | 'graded' | 'modified' | 'guaranteed';
export type DeclineRisk = 'low' | 'medium' | 'high';

export interface CarrierMatch {
  name: string;
  product: string;
  confidence: number;
  notes: string;
  underwritingClass: UnderwritingClass;
  declineRisk: DeclineRisk;
}

export interface ChecklistItem {
  id: string;
  label: string;
  checked: boolean;
}

export interface CallMetrics {
  duration: number;
  talkPct: number;
  listenPct: number;
  sentimentScore: number;
  connectionScore: number;
  energyScore: number;
  confidenceScore: number;
  avgResponseTime: number;
  buyingSignalCount: number;
  objectionCount: number;
  callQuality: number;
}

export type ObjectionKey =
  | 'already_insured'
  | 'think_about_it'
  | 'too_expensive'
  | 'call_later'
  | 'need_spouse'
  | 'busy'
  | 'not_interested';

export interface ObjectionResponse {
  title: string;
  framework: string;
  keyPhrases: string[];
  avoidPhrases: string[];
}

export interface CallRecord {
  id: string;
  contactName: string;
  date: Date;
  duration: number;
  score: number;
  outcome: 'policy_written' | 'follow_up' | 'not_interested' | 'no_answer';
  transcript: TranscriptLine[];
  underwriting: UnderwritingProfile;
  metrics: CallMetrics;
}

// ── Phase 3: Mid-Call Memory ────────────────────────────────────────────────
// Continuously accumulated during a live call so the coaching engine never
// re-asks something already established (Part 7).
export interface CallMemory {
  clientName: string | null;
  spouseName: string | null;
  childrenMentioned: string[];
  grandchildrenMentioned: boolean;
  healthConditionsMentioned: string[];
  budget: string | null;
  carrierDiscussed: string | null;
  premiumMentioned: string | null;
  objectionsRaised: string[];
  questionsAsked: string[];
}

export const EMPTY_CALL_MEMORY: CallMemory = {
  clientName: null,
  spouseName: null,
  childrenMentioned: [],
  grandchildrenMentioned: false,
  healthConditionsMentioned: [],
  budget: null,
  carrierDiscussed: null,
  premiumMentioned: null,
  objectionsRaised: [],
  questionsAsked: [],
};

// ── Phase 3: Call Timeline ──────────────────────────────────────────────────
export type TimelineEventCategory =
  | 'greeting' | 'rapport' | 'discovery' | 'objection' | 'buying_signal'
  | 'health_qualification' | 'price_discussion' | 'application_attempt' | 'close';

export interface TimelineEvent {
  id: string;
  timestampSec: number;
  category: TimelineEventCategory;
  label: string;
  transcriptLineId: string | null;
}

// ── Weighted Scoring (Phase 5) ───────────────────────────────────────────────
// The overall score is computed server-side from 8 weighted categories.
// AI returns raw category scores; the server applies fixed weights so results
// are deterministic and cannot be hallucinated.

export const SCORE_WEIGHTS: Record<string, number> = {
  rapport:      0.15,
  permission:   0.10,
  discovery:    0.20,
  health:       0.10,
  budget:       0.10,
  presentation: 0.15,
  objections:   0.10,
  closing:      0.10,
};

export const SCORE_WEIGHT_LABELS: Record<string, string> = {
  rapport:      'Rapport Building',
  permission:   'Permission / Warm-Up',
  discovery:    'Discovery',
  health:       'Health Questions',
  budget:       'Budget Discussion',
  presentation: 'Presentation',
  objections:   'Objection Handling',
  closing:      'Closing',
};

export function scoreToGrade(score: number): string {
  if (score >= 97) return 'A+';
  if (score >= 93) return 'A';
  if (score >= 90) return 'A-';
  if (score >= 87) return 'B+';
  if (score >= 83) return 'B';
  if (score >= 80) return 'B-';
  if (score >= 77) return 'C+';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'Needs Improvement';
}

export interface WeightedScoreCategory {
  key: string;
  label: string;
  score: number;        // 0-100 raw AI score
  weight: number;       // fraction e.g. 0.15
  contribution: number; // score * weight
  grade: string;
  explanation: string;  // AI's explanation for this score
}

export interface WeightedScoreBreakdown {
  categories: WeightedScoreCategory[];
  overallWeighted: number; // server-computed, 0-100
  grade: string;
  confidencePct: number;
  scoreExplanation: string; // 1-2 sentence summary of the overall score
  reasoning: string;        // deeper reasoning from AI
}

// ── Conversation Analysis (Feature 2) ────────────────────────────────────────
export interface ConversationTurn {
  speaker: 'agent' | 'prospect';
  words: number;
  isQuestion: boolean;
}

export interface ConversationAnalysis {
  agentWords: number;
  prospectWords: number;
  agentTurnCount: number;
  prospectTurnCount: number;
  agentAvgWordsPerTurn: number;
  prospectAvgWordsPerTurn: number;
  agentLongestTurn: number;
  prospectLongestTurn: number;
  agentQuestionCount: number;
  prospectQuestionCount: number;
  agentTalkPct: number;
  prospectTalkPct: number;
  /** Ideal is <= 60% for agent (listen more than talk) */
  talkRatioAssessment: 'excellent' | 'good' | 'high' | 'very_high';
  turns: ConversationTurn[];
}

// ── Phase 3: AI Quality Score (12-dimension radar) ──────────────────────────
export interface QualityScores {
  confidence: number;
  authority: number;
  empathy: number;
  listening: number;
  pacing: number;
  control: number;
  objectionHandling: number;
  discovery: number;
  closing: number;
  compliance: number;
  naturalness: number;
  overallSalesEffectiveness: number;
}

// ── Phase 3: Expanded After-Call Report ─────────────────────────────────────
export interface ObjectionHandlingRecord {
  objection: string;
  handled: boolean;
  howHandled: string;
}

export interface PostCallReport {
  summary: string;
  overallScore: number;
  rapportScore: number;
  discoveryScore: number;
  trustScore: number;
  closingScore: number;
  talkPct: number;
  listenPct: number;
  questionsAskedCount: number;
  scores: Record<string, number>;
  qualityScores: QualityScores;
  timeline: TimelineEvent[];
  strengths: string[];
  missedOpportunities: string[];
  buyingSignals: string[];
  objections: string[];
  objectionsHandling: ObjectionHandlingRecord[];
  mostEffectiveMoments: string[];
  weakestMoments: string[];
  whatShouldHaveBeenDifferent: string[];
  aiCoachingSummary: string;
  threeBiggestImprovements: string[];
  threeBiggestStrengths: string[];
  overallGrade: string;
  followUpText: string;
  followUpEmail: string;
  crmNotes: string;
  improvementPlan: string[];
  /** Server-computed weighted score breakdown (Feature 1). Present when AI scoring succeeds. */
  weightedBreakdown?: WeightedScoreBreakdown;
  /** Server-computed conversation analysis (Feature 2). */
  conversationAnalysis?: ConversationAnalysis;
}

// ── CRM types ─────────────────────────────────────────────────────────────────

export type LeadStatus =
  | 'new'
  | 'contacted'
  | 'qualified'
  | 'proposal'
  | 'negotiation'
  | 'closed_won'
  | 'closed_lost';

export type PolicyType =
  | 'final_expense'
  | 'mortgage_protection'
  | 'term'
  | 'whole_life'
  | 'universal_life';

export type PolicyStatus = 'active' | 'pending' | 'lapsed' | 'cancelled';

export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export type UserRole = 'admin' | 'agent' | 'viewer';

export interface Lead {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  status: LeadStatus;
  source: string;
  tags: string[];
  notes: string;
  assignedTo: string;
  createdAt: string;
  updatedAt: string;
  age?: number;
  state?: string;
  city?: string;
}

export interface Client {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dob: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  beneficiaries: Beneficiary[];
  existingCoverage: string;
  medicalNotes: string;
  createdAt: string;
  policies: string[];
}

export interface Beneficiary {
  id: string;
  name: string;
  relationship: string;
  percentage: number;
  dob?: string;
}

export interface Policy {
  id: string;
  clientId: string;
  clientName: string;
  type: PolicyType;
  carrier: string;
  policyNumber: string;
  faceAmount: number;
  premium: number;
  commission: number;
  commissionRate: number;
  status: PolicyStatus;
  effectiveDate: string;
  issueDate: string;
  notes: string;
}

export interface Appointment {
  id: string;
  clientId?: string;
  leadId?: string;
  title: string;
  description: string;
  startTime: string;
  endTime: string;
  type: 'phone' | 'video' | 'in_person';
  status: 'scheduled' | 'completed' | 'cancelled' | 'no_show';
  location?: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  dueDate: string;
  priority: TaskPriority;
  completed: boolean;
  relatedTo?: string;
  relatedType?: 'lead' | 'client' | 'policy';
  createdAt: string;
}

export interface Carrier {
  id: string;
  name: string;
  logo?: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  website: string;
  products: PolicyType[];
  notes: string;
  activeContracts: number;
}

export interface Commission {
  id: string;
  policyId: string;
  policyNumber: string;
  clientName: string;
  carrier: string;
  type: PolicyType;
  amount: number;
  status: 'paid' | 'pending' | 'chargeback';
  paidDate?: string;
  month: string;
}

export interface KPIData {
  totalLeads: number;
  appointmentsToday: number;
  policiesWritten: number;
  monthlyPremium: number;
  monthlyCommissions: number;
  pendingTasks: number;
}
