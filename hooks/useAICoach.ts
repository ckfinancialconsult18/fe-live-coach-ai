'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import type { TranscriptLine, CoachInsight, CallStage, UnderwritingProfile, CarrierMatch, ChecklistItem, CallMemory } from '@/lib/types';
import { EMPTY_CALL_MEMORY } from '@/lib/types';
import { matchCarriers } from '@/lib/carrier-rules';

function mergeMemory(prev: CallMemory, updates: Partial<CallMemory> | null | undefined): CallMemory {
  if (!updates) return prev;
  const dedupe = (a: string[], b?: string[]) => Array.from(new Set([...a, ...(b ?? [])]));
  return {
    clientName: updates.clientName ?? prev.clientName,
    spouseName: updates.spouseName ?? prev.spouseName,
    childrenMentioned: dedupe(prev.childrenMentioned, updates.childrenMentioned),
    grandchildrenMentioned: prev.grandchildrenMentioned || !!updates.grandchildrenMentioned,
    healthConditionsMentioned: dedupe(prev.healthConditionsMentioned, updates.healthConditionsMentioned),
    budget: updates.budget ?? prev.budget,
    carrierDiscussed: updates.carrierDiscussed ?? prev.carrierDiscussed,
    premiumMentioned: updates.premiumMentioned ?? prev.premiumMentioned,
    objectionsRaised: dedupe(prev.objectionsRaised, updates.objectionsRaised),
    questionsAsked: dedupe(prev.questionsAsked, updates.questionsAsked),
  };
}

const DEFAULT_INSIGHT: CoachInsight = {
  detectedObjection: null,
  objectType: null,
  confidence: 0,
  recommendedResponse: 'Listen carefully and let the prospect finish their thought before responding.',
  alternativeResponses: [],
  whyThisWorks: 'Active listening builds trust and uncovers the real concern.',
  nextBestQuestion: 'Tell me a little more about what\'s most important to you about this coverage.',
  buyingSignals: [],
  buyingSignalDetails: [],
  objectionAnalysis: null,
  nextBestAction: null,
  closeOpportunityPct: 0,
  emotionalOpportunities: [],
  urgency: 'low',
  missedQuestions: [],
  familyReferences: [],
  memoryUpdates: null,
};

const DEFAULT_UNDERWRITING: UnderwritingProfile = {
  age: '', gender: '', heightFt: '', heightIn: '', weight: '',
  tobacco: null, diabetes: null, cancer: null, copd: null, chf: null,
  stroke: null, kidneyDisease: null, oxygen: null, walker: null, wheelchair: null,
  hospitalizations: '', currentMedications: '', surgeries: '',
};

const DEFAULT_CHECKLIST: ChecklistItem[] = [
  { id: 'beneficiary',      label: 'Asked beneficiary',       checked: false },
  { id: 'reason',           label: 'Asked reason for request', checked: false },
  { id: 'existing',         label: 'Asked existing coverage',  checked: false },
  { id: 'funeral',          label: 'Asked funeral plans',      checked: false },
  { id: 'health',           label: 'Asked health questions',   checked: false },
  { id: 'budget',           label: 'Asked budget',             checked: false },
  { id: 'close',            label: 'Asked for the sale',       checked: false },
];

export function useAICoach(transcript: TranscriptLine[]) {
  const [insight, setInsight] = useState<CoachInsight>(DEFAULT_INSIGHT);
  const [stage, setStage] = useState<CallStage>('introduction');
  const [underwriting, setUnderwriting] = useState<UnderwritingProfile>(DEFAULT_UNDERWRITING);
  const [carriers, setCarriers] = useState<CarrierMatch[]>([]);
  const [checklist, setChecklist] = useState<ChecklistItem[]>(DEFAULT_CHECKLIST);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [memory, setMemory] = useState<CallMemory>(EMPTY_CALL_MEMORY);

  const lastAnalyzedIdx = useRef(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const memoryRef = useRef(memory);
  useEffect(() => {
    memoryRef.current = memory;
  }, [memory]);

  const applyInsight = useCallback((rawInsight: Record<string, unknown> | undefined) => {
    if (!rawInsight) return;
    if (rawInsight.memoryUpdates) {
      setMemory((prev) => mergeMemory(prev, rawInsight.memoryUpdates as Partial<CallMemory>));
    }
    // Normalize defensively: the model may omit a field on a given turn
    // (e.g. no objection currently active) — fill gaps with neutral
    // defaults rather than letting downstream panels see `undefined`.
    setInsight((prev) => ({
      ...DEFAULT_INSIGHT,
      ...rawInsight,
      buyingSignals: (rawInsight.buyingSignals as string[]) ?? [],
      buyingSignalDetails: (rawInsight.buyingSignalDetails as CoachInsight['buyingSignalDetails']) ?? [],
      objectionAnalysis: (rawInsight.objectionAnalysis as CoachInsight['objectionAnalysis']) ?? null,
      nextBestAction: (rawInsight.nextBestAction as CoachInsight['nextBestAction']) ?? prev.nextBestAction,
      emotionalOpportunities: (rawInsight.emotionalOpportunities as string[]) ?? [],
      alternativeResponses: (rawInsight.alternativeResponses as string[]) ?? [],
      missedQuestions: (rawInsight.missedQuestions as string[]) ?? [],
      familyReferences: (rawInsight.familyReferences as string[]) ?? [],
    }));
  }, []);

  const applyMeta = useCallback((meta: { stage?: CallStage; underwriting?: Record<string, unknown>; checklist?: Record<string, boolean> }) => {
    if (meta.stage) setStage(meta.stage);
    if (meta.underwriting) {
      setUnderwriting((prev) => {
        const next = { ...prev };
        const u = meta.underwriting!;
        if (u.age)                next.age = u.age as string;
        if (u.gender)             next.gender = u.gender as string;
        if (u.heightFt)           next.heightFt = u.heightFt as string;
        if (u.heightIn)           next.heightIn = u.heightIn as string;
        if (u.weight)             next.weight = u.weight as string;
        if (u.tobacco !== null && u.tobacco !== undefined)   next.tobacco = u.tobacco as boolean;
        if (u.diabetes !== null && u.diabetes !== undefined)  next.diabetes = u.diabetes as boolean;
        if (u.cancer !== null && u.cancer !== undefined)    next.cancer = u.cancer as boolean;
        if (u.copd !== null && u.copd !== undefined)      next.copd = u.copd as boolean;
        if (u.chf !== null && u.chf !== undefined)       next.chf = u.chf as boolean;
        if (u.stroke !== null && u.stroke !== undefined)    next.stroke = u.stroke as boolean;
        if (u.kidneyDisease !== null && u.kidneyDisease !== undefined) next.kidneyDisease = u.kidneyDisease as boolean;
        if (u.oxygen !== null && u.oxygen !== undefined)    next.oxygen = u.oxygen as boolean;
        if (u.walker !== null && u.walker !== undefined)    next.walker = u.walker as boolean;
        if (u.wheelchair !== null && u.wheelchair !== undefined) next.wheelchair = u.wheelchair as boolean;
        if (u.hospitalizations)   next.hospitalizations = u.hospitalizations as string;
        if (u.currentMedications) next.currentMedications = u.currentMedications as string;
        if (u.surgeries)          next.surgeries = u.surgeries as string;
        setCarriers(matchCarriers(next));
        return next;
      });
    }
    if (meta.checklist) {
      setChecklist((prev) => prev.map((item) => ({
        ...item,
        checked: item.checked || meta.checklist![item.id] === true,
      })));
    }
  }, []);

  const analyze = useCallback(async (lines: TranscriptLine[]) => {
    if (lines.length === 0) return;
    if (lines.length === lastAnalyzedIdx.current) return;
    lastAnalyzedIdx.current = lines.length;

    setIsAnalyzing(true);
    try {
      const recentLines = lines.slice(-12);
      const transcriptText = recentLines
        .map((l) => `${l.speaker === 'agent' ? 'AGENT' : 'PROSPECT'}: ${l.text}`)
        .join('\n');

      const res = await fetch('/api/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: transcriptText, fullLength: lines.length, memory: memoryRef.current }),
      });

      if (!res.ok || !res.body) return;

      // Real streaming consumption: read newline-delimited JSON frames as
      // they arrive over the network (see app/api/coach/route.ts). We
      // accumulate "delta" frames into the insight's raw JSON text and parse
      // once it's complete (right before/at the "meta" frame) — deliberately
      // not attempting field-by-field partial JSON parsing, which is fragile
      // for a strict multi-field schema; the real latency win here is
      // time-to-first-byte + total time, not a fake progressive reveal.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let insightText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let newlineIdx: number;
        while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, newlineIdx);
          buffer = buffer.slice(newlineIdx + 1);
          if (!line.trim()) continue;

          try {
            const frame = JSON.parse(line);
            if (frame.t === 'delta') {
              insightText += frame.d;
            } else if (frame.t === 'meta') {
              try { applyInsight(JSON.parse(insightText)); } catch { /* malformed — skip this turn */ }
              applyMeta(frame);
            } else if (frame.t === 'full') {
              applyInsight(frame.insight);
              applyMeta({ stage: frame.stage, underwriting: frame.underwriting, checklist: frame.checklist });
            }
          } catch {
            // ignore malformed frame line
          }
        }
      }
    } catch {
      // network error — keep current insight
    } finally {
      setIsAnalyzing(false);
    }
  }, [applyInsight, applyMeta]);

  // Debounce analysis — run shortly after a new transcript line arrives.
  // Kept short (not zero) so rapid back-to-back utterances coalesce into one
  // analysis call instead of firing one per word; the dominant latency cost
  // is the model call itself, not this debounce window.
  const scheduleAnalysis = useCallback((lines: TranscriptLine[]) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => analyze(lines), 400);
  }, [analyze]);

  return { insight, stage, underwriting, carriers, checklist, isAnalyzing, scheduleAnalysis, setStage, memory };
}
