'use client';

import { useState, useRef, useCallback } from 'react';
import { scoreColor } from '@/lib/score-color';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Objection {
  text: string;
  type: string;
  agentResponse: string;
  wasSuccessful: boolean;
  whyItWorked?: string;
  whyItFailed?: string;
}

interface BuyingSignal {
  text: string;
  strength: 'strong' | 'medium' | 'weak';
  context: string;
  agentResponse: string;
  responseWasOptimal: boolean;
}

interface EmotionalTrigger {
  trigger: string;
  evidence: string;
  howAgentUsedIt: string;
  wasEffective: boolean;
}

interface MedicationInsight {
  name: string;
  brandName?: string;
  indicates: string;
  underwritingNote: string;
  mentionedInTranscript: string;
}

interface HealthCondition {
  condition: string;
  details: string;
  underwritingImpact: string;
  carriersSuggested: string[];
}

interface Rebuttal {
  objection: string;
  rebuttal: string;
  result: string;
  techniqueUsed?: string;
  betterApproach?: string;
}

interface ClosingTechnique {
  technique: string;
  script: string;
  result: string;
  wasSuccessful: boolean;
}

interface ComplianceConcern {
  concern: string;
  severity: 'high' | 'medium' | 'low';
  quote: string;
  correction: string;
}

interface PersonalityType {
  type: string;
  blend?: string;
  evidence: string[];
  adaptationNotes: string;
}

interface NewKnowledgeItem {
  targetFile: string;
  section: string;
  isNew: boolean;
  confidence: number;
  summary: string;
  markdownEntry: string;
}

interface ExtractedInsights {
  objections: Objection[];
  buyingSignals: BuyingSignal[];
  emotionalTriggers: EmotionalTrigger[];
  medications: MedicationInsight[];
  healthConditions: HealthCondition[];
  underwritingProfile: Record<string, unknown>;
  carrierDiscussions: { carrier: string; context: string; prospectReaction: string }[];
  successfulRebuttals: Rebuttal[];
  unsuccessfulRebuttals: Rebuttal[];
  closingTechniques: ClosingTechnique[];
  complianceConcerns: ComplianceConcern[];
  personalityType: PersonalityType;
}

interface Report {
  filesUpdated: string[];
  entriesWritten: number;
  newObjections: string[];
  newMedications: string[];
  newTechniques: string[];
  newBuyingSignals: string[];
  complianceFlags: string[];
  overallImprovements: string[];
  coachingImprovementScore: number;
}

interface AnalysisResult {
  callSummary: string;
  callScore: number;
  callOutcome: string;
  extractedInsights: ExtractedInsights;
  report: Report;
  newKnowledge: NewKnowledgeItem[];
}

// ── Page ──────────────────────────────────────────────────────────────────────

const STEPS = [
  'Reading transcript…',
  'Extracting objections & signals…',
  'Analyzing health & medications…',
  'Identifying personality & triggers…',
  'Comparing against knowledge base…',
  'Writing new knowledge entries…',
  'Reloading coaching engine…',
];

export default function LearnFromCallPage() {
  const [transcript, setTranscript] = useState('');
  const [sourceCall, setSourceCall] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [step, setStep] = useState(0);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'report' | 'insights' | 'knowledge'>('report');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setTranscript((ev.target?.result as string) ?? '');
    reader.readAsText(file);
  }, []);

  const analyze = useCallback(async () => {
    if (!transcript.trim()) return;
    setIsAnalyzing(true);
    setResult(null);
    setError(null);
    setStep(0);

    // Simulate step progress while request is in flight
    const stepTimer = setInterval(() => {
      setStep((s) => (s < STEPS.length - 2 ? s + 1 : s));
    }, 900);

    try {
      const res = await fetch('/api/learn-from-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript, sourceCall: sourceCall || 'Unnamed Call' }),
      });
      clearInterval(stepTimer);
      setStep(STEPS.length - 1);

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
      }

      const data = await res.json() as AnalysisResult;
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      clearInterval(stepTimer);
      setIsAnalyzing(false);
    }
  }, [transcript, sourceCall]);

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto w-full px-6 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-100">Learn From This Call</h1>
            <p className="text-sm text-slate-500 mt-1">
              Paste or upload a call transcript — the AI will extract insights and automatically update your knowledge base.
            </p>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[rgba(212,175,55,0.1)] border border-[rgba(212,175,55,0.25)]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#D4AF37]" />
            <span className="text-[11px] font-semibold text-[#D4AF37]">KB SYNC ACTIVE</span>
          </div>
        </div>

        {/* Input card */}
        {!result && (
          <div className="glass-card rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <input
                type="text"
                value={sourceCall}
                onChange={(e) => setSourceCall(e.target.value)}
                placeholder="Call name or label (optional — e.g. Dorothy M. 2026-06-29)"
                className="flex-1 bg-white/5 border border-white/8 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-[rgba(212,175,55,0.4)]"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/6 border border-white/8 text-xs text-slate-400 hover:text-slate-200 hover:bg-white/10 transition-colors shrink-0"
              >
                <UploadIcon />
                <span className="hidden sm:inline">Upload .txt / .md</span>
              </button>
              <input ref={fileInputRef} type="file" accept=".txt,.md,.text" className="hidden" onChange={handleFile} />
            </div>

            <textarea
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder={`Paste the full call transcript here…\n\nExample format:\nAGENT: Hello, may I speak with Dorothy?\nPROSPECT: Yes, this is Dorothy.\n…`}
              rows={16}
              className="w-full bg-white/4 border border-white/6 rounded-xl px-4 py-3 text-sm text-slate-300 placeholder-slate-700 font-mono leading-relaxed resize-y focus:outline-none focus:border-[rgba(212,175,55,0.3)]"
            />

            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-600">
                {transcript.trim() ? `${transcript.trim().split(/\s+/).length.toLocaleString()} words` : 'No transcript yet'}
              </p>
              <button
                onClick={analyze}
                disabled={!transcript.trim() || isAnalyzing}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:scale-105 active:scale-100"
                style={{
                  background: 'linear-gradient(135deg, #D4AF37, #9a7a0a)',
                  boxShadow: '0 4px 16px rgba(212,175,55,0.35)',
                  color: '#090d18',
                }}
              >
                <BrainIcon />
                Analyze &amp; Learn
              </button>
            </div>
          </div>
        )}

        {/* Loading state */}
        {isAnalyzing && (
          <div className="glass-card rounded-2xl p-8 space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full border-2 border-[#D4AF37] border-t-transparent animate-spin shrink-0" />
              <div>
                <p className="text-sm font-semibold text-slate-200">Analyzing your call…</p>
                <p className="text-xs text-slate-500 mt-0.5">{STEPS[step]}</p>
              </div>
            </div>
            <div className="space-y-2">
              {STEPS.map((s, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 transition-all ${
                    i < step ? 'bg-green-500/20' : i === step ? 'bg-[rgba(212,175,55,0.2)]' : 'bg-white/4'
                  }`}>
                    {i < step
                      ? <span className="text-green-400 text-[10px]">✓</span>
                      : i === step
                      ? <span className="w-1.5 h-1.5 rounded-full bg-[#D4AF37] animate-live" />
                      : <span className="w-1.5 h-1.5 rounded-full bg-white/10" />
                    }
                  </div>
                  <span className={`text-xs ${i < step ? 'text-green-400' : i === step ? 'text-[#D4AF37]' : 'text-slate-700'}`}>{s}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="glass-card rounded-2xl p-5 border border-red-500/20 bg-red-500/5">
            <p className="text-sm font-semibold text-red-400">Analysis failed</p>
            <p className="text-xs text-red-400/70 mt-1">{error}</p>
            <button
              onClick={() => { setError(null); setResult(null); }}
              className="mt-3 text-xs text-slate-400 hover:text-slate-200 underline"
            >
              Try again
            </button>
          </div>
        )}

        {/* Results */}
        {result && !isAnalyzing && (
          <div className="space-y-5 animate-alert">

            {/* Score bar */}
            <div className="glass-card rounded-2xl p-5 flex items-center gap-6">
              <div className="text-center shrink-0">
                <p className="text-4xl font-extrabold" style={{ color: scoreColor(result.callScore) }}>
                  {result.callScore}
                </p>
                <p className="text-[10px] text-slate-500 mt-0.5">Call Score</p>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-200 mb-1">{result.callSummary}</p>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <OutcomeBadge outcome={result.callOutcome} />
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-[rgba(212,175,55,0.1)] text-[#D4AF37] border border-[rgba(212,175,55,0.2)]">
                    {result.report.entriesWritten} new entries written
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-slate-400 border border-white/8">
                    {result.report.filesUpdated.length} files updated
                  </span>
                </div>
              </div>
              <button
                onClick={() => { setResult(null); setTranscript(''); setSourceCall(''); }}
                className="shrink-0 px-3 py-2 rounded-lg bg-white/6 border border-white/8 text-xs text-slate-400 hover:text-slate-200 transition-colors"
              >
                ← New Analysis
              </button>
            </div>

            {/* Tab bar */}
            <div className="flex border-b border-white/6">
              {(['report', 'insights', 'knowledge'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-5 py-2.5 text-xs font-semibold uppercase tracking-wider transition-colors ${
                    activeTab === tab
                      ? 'text-[#D4AF37] border-b-2 border-[#D4AF37]'
                      : 'text-slate-600 hover:text-slate-400'
                  }`}
                >
                  {tab === 'report' ? 'Update Report' : tab === 'insights' ? 'Call Insights' : 'Knowledge Written'}
                </button>
              ))}
            </div>

            {/* Tab: Report */}
            {activeTab === 'report' && <ReportTab report={result.report} />}

            {/* Tab: Insights */}
            {activeTab === 'insights' && <InsightsTab insights={result.extractedInsights} />}

            {/* Tab: Knowledge Written */}
            {activeTab === 'knowledge' && <KnowledgeTab items={result.newKnowledge} />}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ReportTab({ report }: { report: Report }) {
  const fileLabel: Record<string, string> = {
    objections: 'objection_handbook.md',
    buying_signals: 'buying_signals.md',
    medications: 'medications.md',
    underwriting: 'underwriting.md',
    carrier_rules: 'carrier_rules.md',
    closing_scripts: 'closing_scripts.md',
    compliance: 'compliance.md',
    personality_profiles: 'personality_profiles.md',
    sales_psychology: 'sales_psychology.md',
    coaching_rules: 'coaching_rules.md',
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {/* Coaching improvement */}
      <div className="glass-card rounded-2xl p-5 space-y-4 lg:col-span-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-200">Coaching Engine Improvements</h3>
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold" style={{ color: scoreColor(report.coachingImprovementScore) }}>
              +{report.coachingImprovementScore}
            </span>
            <span className="text-[10px] text-slate-500">improvement score</span>
          </div>
        </div>
        <div className="space-y-2">
          {report.overallImprovements.map((item, i) => (
            <div key={i} className="flex items-start gap-2.5">
              <span className="w-5 h-5 rounded-full bg-[rgba(212,175,55,0.15)] text-[#D4AF37] text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
              <p className="text-xs text-slate-300">{item}</p>
            </div>
          ))}
          {report.overallImprovements.length === 0 && (
            <p className="text-xs text-slate-600">No improvements identified — all patterns already in knowledge base.</p>
          )}
        </div>
      </div>

      {/* Files updated */}
      <ReportSection
        title="Files Updated"
        icon="📁"
        items={report.filesUpdated.map((k) => fileLabel[k] ?? k)}
        emptyText="No files updated"
        itemColor="text-blue-400"
      />

      {/* New objections */}
      <ReportSection
        title="New Objections Learned"
        icon="🛡️"
        items={report.newObjections}
        emptyText="No new objections"
        itemColor="text-amber-400"
      />

      {/* New medications */}
      <ReportSection
        title="New Medications Learned"
        icon="💊"
        items={report.newMedications}
        emptyText="No new medications"
        itemColor="text-violet-400"
      />

      {/* New techniques */}
      <ReportSection
        title="New Sales Techniques"
        icon="🎯"
        items={report.newTechniques}
        emptyText="No new techniques"
        itemColor="text-green-400"
      />

      {/* New buying signals */}
      <ReportSection
        title="New Buying Signals"
        icon="🟢"
        items={report.newBuyingSignals}
        emptyText="No new buying signals"
        itemColor="text-emerald-400"
      />

      {/* Compliance flags */}
      <ReportSection
        title="Compliance Flags"
        icon="⚠️"
        items={report.complianceFlags}
        emptyText="No compliance concerns — clean call"
        itemColor="text-red-400"
        emptyIsGood
      />
    </div>
  );
}

function ReportSection({
  title, icon, items, emptyText, itemColor, emptyIsGood = false,
}: {
  title: string; icon: string; items: string[]; emptyText: string; itemColor: string; emptyIsGood?: boolean;
}) {
  return (
    <div className="glass-card rounded-2xl p-5 space-y-3">
      <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
        <span>{icon}</span>{title}
      </h3>
      {items.length > 0 ? (
        <ul className="space-y-1.5">
          {items.map((item, i) => (
            <li key={i} className={`text-xs flex items-start gap-2 ${itemColor}`}>
              <span className="shrink-0 mt-0.5">•</span>{item}
            </li>
          ))}
        </ul>
      ) : (
        <p className={`text-xs ${emptyIsGood ? 'text-green-400' : 'text-slate-600'}`}>{emptyText}</p>
      )}
    </div>
  );
}

function InsightsTab({ insights }: { insights: ExtractedInsights }) {
  return (
    <div className="space-y-5">
      {/* Personality */}
      {insights.personalityType && (
        <div className="glass-card rounded-2xl p-5 space-y-3">
          <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <span className="text-base">🧠</span> Personality Type
            <span className="ml-auto px-2 py-0.5 rounded-full text-[11px] font-bold bg-[rgba(212,175,55,0.15)] text-[#D4AF37]">
              {insights.personalityType.type}
              {insights.personalityType.blend ? ` — ${insights.personalityType.blend}` : ''}
            </span>
          </h3>
          <div className="space-y-2">
            {insights.personalityType.evidence?.map((ev, i) => (
              <blockquote key={i} className="border-l-2 border-[rgba(212,175,55,0.3)] pl-3 text-xs text-slate-400 italic">{ev}</blockquote>
            ))}
          </div>
          {insights.personalityType.adaptationNotes && (
            <div className="rounded-lg bg-white/4 border border-white/6 px-3 py-2">
              <p className="text-[10px] font-semibold text-[#D4AF37] uppercase tracking-wider mb-1">Coaching Note</p>
              <p className="text-xs text-slate-300">{insights.personalityType.adaptationNotes}</p>
            </div>
          )}
        </div>
      )}

      {/* Objections */}
      {insights.objections?.length > 0 && (
        <InsightGroup title="Objections" icon="🛡️">
          {insights.objections.map((obj, i) => (
            <InsightCard
              key={i}
              label={obj.type.replace(/_/g, ' ')}
              badge={obj.wasSuccessful ? { text: 'Handled', color: 'green' } : { text: 'Missed', color: 'red' }}
              quote={obj.text}
              agentResponse={obj.agentResponse}
              note={obj.wasSuccessful ? obj.whyItWorked : obj.whyItFailed}
            />
          ))}
        </InsightGroup>
      )}

      {/* Buying Signals */}
      {insights.buyingSignals?.length > 0 && (
        <InsightGroup title="Buying Signals" icon="🟢">
          {insights.buyingSignals.map((sig, i) => (
            <InsightCard
              key={i}
              label={sig.strength + ' signal'}
              badge={sig.responseWasOptimal ? { text: 'Optimal response', color: 'green' } : { text: 'Missed opportunity', color: 'amber' }}
              quote={sig.text}
              agentResponse={sig.agentResponse}
              note={sig.context}
            />
          ))}
        </InsightGroup>
      )}

      {/* Emotional Triggers */}
      {insights.emotionalTriggers?.length > 0 && (
        <InsightGroup title="Emotional Triggers" icon="💡">
          {insights.emotionalTriggers.map((trig, i) => (
            <InsightCard
              key={i}
              label={trig.trigger}
              badge={trig.wasEffective ? { text: 'Used well', color: 'green' } : { text: 'Underused', color: 'amber' }}
              quote={trig.evidence}
              agentResponse={trig.howAgentUsedIt}
            />
          ))}
        </InsightGroup>
      )}

      {/* Health & Meds row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {insights.medications?.length > 0 && (
          <div className="glass-card rounded-2xl p-5 space-y-3">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5"><span>💊</span> Medications</h3>
            {insights.medications.map((med, i) => (
              <div key={i} className="space-y-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-semibold text-slate-200">{med.name}</span>
                  {med.brandName && <span className="text-[10px] text-slate-500">({med.brandName})</span>}
                </div>
                <p className="text-xs text-slate-400">{med.indicates}</p>
                <p className="text-[10px] text-amber-400">{med.underwritingNote}</p>
                {i < insights.medications.length - 1 && <div className="border-t border-white/5 pt-2" />}
              </div>
            ))}
          </div>
        )}

        {insights.healthConditions?.length > 0 && (
          <div className="glass-card rounded-2xl p-5 space-y-3">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5"><span>🏥</span> Health Conditions</h3>
            {insights.healthConditions.map((cond, i) => (
              <div key={i} className="space-y-1">
                <span className="text-sm font-semibold text-slate-200">{cond.condition}</span>
                <p className="text-xs text-slate-400">{cond.details}</p>
                <p className="text-[10px] text-blue-400">{cond.underwritingImpact}</p>
                {cond.carriersSuggested?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {cond.carriersSuggested.map((c) => (
                      <span key={c} className="text-[9px] px-1.5 py-0.5 rounded bg-[rgba(212,175,55,0.08)] text-[#D4AF37] border border-[rgba(212,175,55,0.15)]">{c}</span>
                    ))}
                  </div>
                )}
                {i < insights.healthConditions.length - 1 && <div className="border-t border-white/5 pt-2" />}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Successful Rebuttals */}
      {insights.successfulRebuttals?.length > 0 && (
        <InsightGroup title="Successful Rebuttals" icon="✅">
          {insights.successfulRebuttals.map((r, i) => (
            <InsightCard
              key={i}
              label={r.techniqueUsed ?? 'Rebuttal'}
              badge={{ text: 'Worked', color: 'green' }}
              quote={r.objection}
              agentResponse={r.rebuttal}
              note={r.result}
            />
          ))}
        </InsightGroup>
      )}

      {/* Unsuccessful Rebuttals */}
      {insights.unsuccessfulRebuttals?.length > 0 && (
        <InsightGroup title="Missed Rebuttals" icon="❌">
          {insights.unsuccessfulRebuttals.map((r, i) => (
            <InsightCard
              key={i}
              label="What to do instead"
              badge={{ text: 'Did not work', color: 'red' }}
              quote={r.objection}
              agentResponse={r.rebuttal}
              note={r.betterApproach}
              noteLabel="Better approach"
              noteColor="text-amber-400"
            />
          ))}
        </InsightGroup>
      )}

      {/* Compliance */}
      {insights.complianceConcerns?.length > 0 && (
        <div className="glass-card rounded-2xl p-5 space-y-4 border border-red-500/20 bg-red-500/5">
          <h3 className="text-sm font-semibold text-red-400 flex items-center gap-2"><span>⚠️</span> Compliance Concerns</h3>
          {insights.complianceConcerns.map((c, i) => (
            <div key={i} className="space-y-2">
              <div className="flex items-center gap-2">
                <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                  c.severity === 'high' ? 'bg-red-500/20 text-red-400' :
                  c.severity === 'medium' ? 'bg-amber-500/20 text-amber-400' :
                  'bg-slate-500/20 text-slate-400'
                }`}>{c.severity.toUpperCase()}</span>
                <p className="text-xs font-semibold text-slate-200">{c.concern}</p>
              </div>
              <blockquote className="border-l-2 border-red-500/40 pl-3 text-xs text-red-400/80 italic">&ldquo;{c.quote}&rdquo;</blockquote>
              <p className="text-xs text-slate-400"><span className="text-green-400 font-semibold">Better: </span>{c.correction}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function InsightGroup({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div className="glass-card rounded-2xl p-5 space-y-4">
      <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
        <span>{icon}</span>{title}
      </h3>
      {children}
    </div>
  );
}

function InsightCard({
  label, badge, quote, agentResponse, note, noteLabel = 'Note', noteColor = 'text-slate-400',
}: {
  label: string;
  badge: { text: string; color: 'green' | 'red' | 'amber' };
  quote?: string;
  agentResponse?: string;
  note?: string;
  noteLabel?: string;
  noteColor?: string;
}) {
  const badgeColors = {
    green: 'bg-green-500/10 text-green-400 border-green-500/20',
    red: 'bg-red-500/10 text-red-400 border-red-500/20',
    amber: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  };
  return (
    <div className="space-y-2 pb-4 border-b border-white/5 last:border-0 last:pb-0">
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-slate-500 capitalize">{label}</span>
        <span className={`ml-auto text-[9px] font-bold px-2 py-0.5 rounded-full border ${badgeColors[badge.color]}`}>{badge.text}</span>
      </div>
      {quote && <blockquote className="border-l-2 border-white/10 pl-3 text-xs text-slate-400 italic">&ldquo;{quote}&rdquo;</blockquote>}
      {agentResponse && <p className="text-xs text-slate-300"><span className="text-slate-600 font-medium">Agent: </span>{agentResponse}</p>}
      {note && <p className={`text-xs ${noteColor}`}><span className="font-semibold">{noteLabel}: </span>{note}</p>}
    </div>
  );
}

function KnowledgeTab({ items }: { items: NewKnowledgeItem[] }) {
  const fileColors: Record<string, string> = {
    medications:          'text-violet-400 bg-violet-400/10 border-violet-400/20',
    buying_signals:       'text-green-400 bg-green-400/10 border-green-400/20',
    objections:           'text-amber-400 bg-amber-400/10 border-amber-400/20',
    closing_scripts:      'text-blue-400 bg-blue-400/10 border-blue-400/20',
    personality_profiles: 'text-pink-400 bg-pink-400/10 border-pink-400/20',
    compliance:           'text-red-400 bg-red-400/10 border-red-400/20',
    underwriting:         'text-cyan-400 bg-cyan-400/10 border-cyan-400/20',
    carrier_rules:        'text-[#D4AF37] bg-[rgba(212,175,55,0.1)] border-[rgba(212,175,55,0.2)]',
    sales_psychology:     'text-indigo-400 bg-indigo-400/10 border-indigo-400/20',
    coaching_rules:       'text-slate-300 bg-white/5 border-white/10',
  };

  const newItems = items.filter((i) => i.isNew);

  if (newItems.length === 0) {
    return (
      <div className="glass-card rounded-2xl p-8 text-center space-y-2">
        <p className="text-2xl">📚</p>
        <p className="text-sm font-semibold text-slate-300">Everything already in the knowledge base</p>
        <p className="text-xs text-slate-600">No new entries were written — all patterns from this call were already documented.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">{newItems.length} new {newItems.length === 1 ? 'entry' : 'entries'} written to knowledge files.</p>
      {newItems.map((item, i) => (
        <div key={i} className="glass-card rounded-2xl p-5 space-y-3">
          <div className="flex items-start gap-3 flex-wrap">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${fileColors[item.targetFile] ?? 'text-slate-400 bg-white/5 border-white/10'}`}>
              {item.targetFile.replace(/_/g, ' ')}
            </span>
            <span className="text-[10px] text-slate-600 border border-white/8 bg-white/4 px-2 py-0.5 rounded-full">
              § {item.section}
            </span>
            <span className="ml-auto text-[10px] font-bold" style={{ color: scoreColor(item.confidence) }}>
              {item.confidence}% confidence
            </span>
          </div>
          <p className="text-sm font-medium text-slate-200">{item.summary}</p>
          <pre className="text-[10px] text-slate-500 bg-white/3 border border-white/6 rounded-lg p-3 whitespace-pre-wrap font-mono leading-relaxed overflow-x-auto">
            {item.markdownEntry}
          </pre>
        </div>
      ))}
    </div>
  );
}

function OutcomeBadge({ outcome }: { outcome: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    policy_written: { label: 'Policy Written', cls: 'bg-green-500/15 text-green-400 border-green-500/25' },
    follow_up:      { label: 'Follow-up', cls: 'bg-amber-500/15 text-amber-400 border-amber-500/25' },
    not_interested: { label: 'Not Interested', cls: 'bg-red-500/15 text-red-400 border-red-500/25' },
    unknown:        { label: 'Outcome Unknown', cls: 'bg-white/5 text-slate-400 border-white/10' },
  };
  const { label, cls } = map[outcome] ?? map.unknown;
  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${cls}`}>{label}</span>;
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function UploadIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
    </svg>
  );
}

function BrainIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z"/>
      <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z"/>
    </svg>
  );
}
