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
export interface NextBestAction {
  nextQuestion: string;
  nextResponse: string;
  nextClose: string;
  talkListenGuidance: 'speak' | 'listen' | 'pause';
  readyForApplication: boolean;
  readyForApplicationReason: string;
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
  /** Incremental mid-call memory facts extracted this turn (Part 7) — merge into persistent CallMemory, never overwrite with null/empty. */
  memoryUpdates: Partial<CallMemory> | null;
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
