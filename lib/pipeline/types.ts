export type TranscriptFormat = 'txt' | 'md' | 'docx' | 'pdf' | 'zoom' | 'teams' | 'meet';

export type JobStatus =
  | 'queued'
  | 'parsing'
  | 'extracting'
  | 'deduplicating'
  | 'pending_review'
  | 'completed'
  | 'failed';

export type KnowledgeType =
  | 'objection'
  | 'rebuttal_successful'
  | 'rebuttal_failed'
  | 'buying_signal'
  | 'emotional_trigger'
  | 'medication'
  | 'diagnosis'
  | 'underwriting'
  | 'carrier'
  | 'compliance'
  | 'closing_technique'
  | 'successful_close'
  | 'failed_close'
  | 'discovery_question'
  | 'sales_psychology'
  | 'personality'
  | 'financial_concern'
  | 'family_dynamic'
  | 'funeral_concern'
  | 'coaching_opportunity'
  | 'agent_mistake'
  | 'agent_strength'
  | 'memorable_phrase';

export type KnowledgeFile =
  | 'objection_handbook'
  | 'carrier_rules'
  | 'underwriting'
  | 'medications'
  | 'winning_calls'
  | 'losing_calls'
  | 'sales_psychology'
  | 'coaching_rules'
  | 'buying_signals'
  | 'closing_scripts'
  | 'personality_profiles'
  | 'discovery_questions';

export interface PipelineJob {
  id: string;
  originalName: string;
  format: TranscriptFormat;
  status: JobStatus;
  progress: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  retryCount: number;
  wordCount?: number;
  extractedCount?: number;
  newKnowledgeCount?: number;
  callType?: 'sales' | 'coaching' | 'training' | 'unknown';
  callOutcome?: 'policy_written' | 'follow_up' | 'not_interested' | 'unknown';
  callScore?: number;
}

export interface PendingEntryIndex {
  id: string;
  jobId: string;
  originalFilename: string;
  type: KnowledgeType;
  targetFile: KnowledgeFile;
  summary: string;
  confidence: number;
  status: 'pending' | 'approved' | 'rejected';
  isDuplicate: boolean;
  createdAt: string;
  tags: string[];
}

export interface PendingKnowledgeEntry extends PendingEntryIndex {
  section: string;
  content: string;
  evidence: string;
  markdownEntry: string;
  similarTo?: string[];
  conflictsWith?: string[];
  reviewedAt?: string;
  reviewNote?: string;
  callSummary?: string;
  callType?: string;
  callOutcome?: string;
  callScore?: number;
}

export interface ParsedTranscript {
  text: string;
  lines: TranscriptLine[];
  wordCount: number;
  format: TranscriptFormat;
  metadata: {
    speakerCount: number;
    estimatedDuration?: number;
    meetingTitle?: string;
    participants?: string[];
    date?: string;
  };
}

export interface TranscriptLine {
  speaker: string;
  text: string;
  timestamp?: string;
}

export interface ExtractedInsight {
  type: KnowledgeType;
  targetFile: KnowledgeFile;
  section: string;
  summary: string;
  content: string;
  evidence: string;
  confidence: number;
  tags: string[];
  markdownEntry: string;
}

export interface ExtractionResult {
  jobId: string;
  callSummary: string;
  callType: 'sales' | 'coaching' | 'training' | 'unknown';
  callOutcome: 'policy_written' | 'follow_up' | 'not_interested' | 'unknown';
  callScore: number;
  insights: ExtractedInsight[];
}

export interface ApproveAction {
  ids: string[];
  action: 'approve' | 'reject' | 'edit';
  note?: string;
  editedContent?: string;
  editedMarkdown?: string;
}

export interface SearchResult {
  entry: PendingKnowledgeEntry;
  score: number;
  matchedFields: string[];
  highlights: Record<string, string>;
}

export interface PipelineStats {
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  queuedJobs: number;
  totalTranscripts: number;
  salesCalls: number;
  coachingCalls: number;
  totalInsightsExtracted: number;
  pendingReview: number;
  approvedTotal: number;
  rejectedTotal: number;
  duplicatesSkipped: number;
  byType: Partial<Record<KnowledgeType, number>>;
  byFile: Partial<Record<KnowledgeFile, number>>;
  topObjections: { text: string; count: number }[];
  topMedications: { text: string; count: number }[];
  topBuyingSignals: { text: string; count: number }[];
  confidenceDistribution: { range: string; count: number }[];
  recentActivity: { date: string; processed: number; approved: number }[];
}
