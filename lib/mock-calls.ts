import type { CallRecord } from './types';

export const mockPastCalls: CallRecord[] = [
  {
    id: 'call-001',
    contactName: 'Dorothy Williams',
    date: new Date('2026-06-28T14:30:00'),
    duration: 1847,
    score: 82,
    outcome: 'policy_written',
    transcript: [],
    underwriting: {
      age: '68', gender: 'Female', heightFt: '5', heightIn: '4', weight: '145',
      tobacco: false, diabetes: true, cancer: false, copd: false, chf: false,
      stroke: false, kidneyDisease: false, oxygen: false, walker: false, wheelchair: false,
      hospitalizations: 'None in 3 years', currentMedications: 'Metformin, Lisinopril',
    },
    metrics: {
      duration: 1847, talkPct: 38, listenPct: 62, sentimentScore: 78,
      connectionScore: 84, energyScore: 71, confidenceScore: 80,
      avgResponseTime: 2.3, buyingSignalCount: 5, objectionCount: 2, callQuality: 88,
    },
  },
  {
    id: 'call-002',
    contactName: 'Robert Martinez',
    date: new Date('2026-06-28T11:15:00'),
    duration: 643,
    score: 51,
    outcome: 'follow_up',
    transcript: [],
    underwriting: {
      age: '74', gender: 'Male', heightFt: '5', heightIn: '10', weight: '188',
      tobacco: true, diabetes: false, cancer: false, copd: true, chf: false,
      stroke: false, kidneyDisease: false, oxygen: false, walker: false, wheelchair: false,
      hospitalizations: '1 hospitalization in 2024', currentMedications: 'Spiriva, Advair',
    },
    metrics: {
      duration: 643, talkPct: 55, listenPct: 45, sentimentScore: 52,
      connectionScore: 48, energyScore: 60, confidenceScore: 55,
      avgResponseTime: 3.8, buyingSignalCount: 1, objectionCount: 4, callQuality: 50,
    },
  },
  {
    id: 'call-003',
    contactName: 'Helen Johnson',
    date: new Date('2026-06-27T16:00:00'),
    duration: 2204,
    score: 91,
    outcome: 'policy_written',
    transcript: [],
    underwriting: {
      age: '61', gender: 'Female', heightFt: '5', heightIn: '6', weight: '162',
      tobacco: false, diabetes: false, cancer: false, copd: false, chf: false,
      stroke: false, kidneyDisease: false, oxygen: false, walker: false, wheelchair: false,
      hospitalizations: 'None', currentMedications: 'Atorvastatin',
    },
    metrics: {
      duration: 2204, talkPct: 32, listenPct: 68, sentimentScore: 91,
      connectionScore: 95, energyScore: 88, confidenceScore: 92,
      avgResponseTime: 1.9, buyingSignalCount: 8, objectionCount: 1, callQuality: 94,
    },
  },
  {
    id: 'call-004',
    contactName: 'James Thompson',
    date: new Date('2026-06-27T10:45:00'),
    duration: 298,
    score: 34,
    outcome: 'not_interested',
    transcript: [],
    underwriting: {
      age: '79', gender: 'Male', heightFt: '5', heightIn: '8', weight: '201',
      tobacco: true, diabetes: true, cancer: false, copd: false, chf: true,
      stroke: false, kidneyDisease: false, oxygen: true, walker: false, wheelchair: false,
      hospitalizations: 'Multiple', currentMedications: 'Multiple',
    },
    metrics: {
      duration: 298, talkPct: 65, listenPct: 35, sentimentScore: 28,
      connectionScore: 22, energyScore: 40, confidenceScore: 35,
      avgResponseTime: 5.1, buyingSignalCount: 0, objectionCount: 6, callQuality: 30,
    },
  },
];

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
