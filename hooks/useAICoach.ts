'use client';

import { useState, useRef, useCallback } from 'react';
import type { TranscriptLine, CoachInsight, CallStage, UnderwritingProfile, CarrierMatch, ChecklistItem } from '@/lib/types';
import { matchCarriers } from '@/lib/carrier-rules';

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

  const lastAnalyzedIdx = useRef(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        body: JSON.stringify({ transcript: transcriptText, fullLength: lines.length }),
      });

      if (!res.ok) return;
      const data = await res.json();

      // Normalize defensively: the model may omit a field on a given turn
      // (e.g. no objection currently active) — fill gaps with neutral
      // defaults rather than letting downstream panels see `undefined`.
      if (data.insight) {
        setInsight((prev) => ({
          ...DEFAULT_INSIGHT,
          ...data.insight,
          buyingSignals: data.insight.buyingSignals ?? [],
          buyingSignalDetails: data.insight.buyingSignalDetails ?? [],
          objectionAnalysis: data.insight.objectionAnalysis ?? null,
          nextBestAction: data.insight.nextBestAction ?? prev.nextBestAction,
          emotionalOpportunities: data.insight.emotionalOpportunities ?? [],
          alternativeResponses: data.insight.alternativeResponses ?? [],
        }));
      }
      if (data.stage) setStage(data.stage);
      if (data.underwriting) {
        setUnderwriting((prev) => {
          const next = { ...prev };
          const u = data.underwriting;
          if (u.age)                next.age = u.age;
          if (u.gender)             next.gender = u.gender;
          if (u.heightFt)           next.heightFt = u.heightFt;
          if (u.heightIn)           next.heightIn = u.heightIn;
          if (u.weight)             next.weight = u.weight;
          if (u.tobacco !== null)   next.tobacco = u.tobacco;
          if (u.diabetes !== null)  next.diabetes = u.diabetes;
          if (u.cancer !== null)    next.cancer = u.cancer;
          if (u.copd !== null)      next.copd = u.copd;
          if (u.chf !== null)       next.chf = u.chf;
          if (u.stroke !== null)    next.stroke = u.stroke;
          if (u.kidneyDisease !== null) next.kidneyDisease = u.kidneyDisease;
          if (u.oxygen !== null)    next.oxygen = u.oxygen;
          if (u.walker !== null)    next.walker = u.walker;
          if (u.wheelchair !== null) next.wheelchair = u.wheelchair;
          if (u.hospitalizations)   next.hospitalizations = u.hospitalizations;
          if (u.currentMedications) next.currentMedications = u.currentMedications;
          if (u.surgeries)          next.surgeries = u.surgeries;
          setCarriers(matchCarriers(next));
          return next;
        });
      }
      if (data.checklist) {
        setChecklist((prev) => prev.map((item) => ({
          ...item,
          checked: item.checked || (data.checklist[item.id] === true),
        })));
      }
    } catch {
      // network error — keep current insight
    } finally {
      setIsAnalyzing(false);
    }
  }, []);

  // Debounce analysis — run 1.5s after a new transcript line arrives
  const scheduleAnalysis = useCallback((lines: TranscriptLine[]) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => analyze(lines), 1500);
  }, [analyze]);

  return { insight, stage, underwriting, carriers, checklist, isAnalyzing, scheduleAnalysis, setStage };
}
