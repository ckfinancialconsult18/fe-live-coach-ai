'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import type { TranscriptLine, CoachInsight, CallStage, UnderwritingProfile, CarrierMatch, ChecklistItem, CallMemory, LiveSalesScores } from '@/lib/types';
import { EMPTY_CALL_MEMORY } from '@/lib/types';
import { matchCarriers } from '@/lib/carrier-rules';
import { computeLiveScores } from '@/lib/score-live';

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
  stallDetected: false,
  likelyCominObjection: null,
  rapportBuilt: false,
  discoveryComplete: false,
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

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const memoryRef = useRef(memory);
  const lastNBARef = useRef<{ actionType: string; nextQuestion: string } | null>(null);
  useEffect(() => {
    memoryRef.current = memory;
  }, [memory]);

  const liveScores: LiveSalesScores = useMemo(
    () => computeLiveScores(insight, checklist, stage),
    [insight, checklist, stage],
  );

  const applyInsight = useCallback((rawInsight: Record<string, unknown> | undefined) => {
    if (!rawInsight) return;
    if (rawInsight.memoryUpdates) {
      setMemory((prev) => mergeMemory(prev, rawInsight.memoryUpdates as Partial<CallMemory>));
    }
    // Track last NBA for anti-repetition on the next coaching turn
    const nba = rawInsight.nextBestAction as { actionType?: string; nextQuestion?: string } | null | undefined;
    if (nba?.actionType) {
      lastNBARef.current = { actionType: nba.actionType, nextQuestion: nba.nextQuestion ?? '' };
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
      stallDetected: (rawInsight.stallDetected as boolean) ?? false,
      likelyCominObjection: (rawInsight.likelyCominObjection as string | null) ?? null,
      rapportBuilt: (rawInsight.rapportBuilt as boolean) ?? false,
      discoveryComplete: (rawInsight.discoveryComplete as boolean) ?? false,
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

    // Cancel any in-flight coaching request immediately — don't wait for it
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setIsAnalyzing(true);
    try {
      // Send only the 8 most-recent lines — enough context, minimal tokens.
      // The rest is captured in knownMemory so the model never loses facts.
      const recentLines = lines.slice(-8);
      const transcriptText = recentLines
        .map((l) => `${l.speaker === 'agent' ? 'AGENT' : 'PROSPECT'}: ${l.text}`)
        .join('\n');

      const res = await fetch('/api/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: transcriptText, fullLength: lines.length, memory: memoryRef.current, lastNBA: lastNBARef.current }),
        signal: ctrl.signal,
      });

      if (!res.ok || !res.body || ctrl.signal.aborted) return;

      // Consume the newline-delimited JSON stream: delta frames accumulate into
      // the full insight JSON, meta frame carries stage/underwriting/checklist.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let insightText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done || ctrl.signal.aborted) break;
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
              try { applyInsight(JSON.parse(insightText)); } catch { /* malformed — keep previous */ }
              applyMeta(frame);
            } else if (frame.t === 'full') {
              applyInsight(frame.insight);
              applyMeta({ stage: frame.stage, underwriting: frame.underwriting, checklist: frame.checklist });
            }
          } catch { /* ignore malformed frame */ }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return; // expected — new request took over
      // other network errors — keep current insight panel state
    } finally {
      if (!ctrl.signal.aborted) setIsAnalyzing(false);
    }
  }, [applyInsight, applyMeta]);

  // 200 ms debounce: coalesces rapid back-to-back Deepgram utterances before
  // hitting the coaching API. The abort in analyze() ensures any request still
  // running when the next one fires is cancelled immediately, not queued.
  const scheduleAnalysis = useCallback((lines: TranscriptLine[]) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => analyze(lines), 200);
  }, [analyze]);

  return { insight, stage, underwriting, carriers, checklist, isAnalyzing, scheduleAnalysis, setStage, memory, liveScores };
}
