import type { UnderwritingProfile, CarrierMatch } from './types';

interface CarrierRule {
  name: string;
  product: string;
  maxAge: number;
  minAge: number;
  maxWeight?: number;
  tobaccoOk: boolean;
  diabetesOk: boolean;
  cancelledConditions: (keyof UnderwritingProfile)[];
  notes: string;
}

const RULES: CarrierRule[] = [
  {
    name: 'Americo Eagle',
    product: 'Eagle Premier',
    minAge: 50, maxAge: 85,
    tobaccoOk: true, diabetesOk: true,
    cancelledConditions: ['oxygen', 'wheelchair'],
    notes: 'Excellent for tobacco users. Graded benefit for select conditions.',
  },
  {
    name: 'Mutual of Omaha',
    product: 'Living Promise',
    minAge: 45, maxAge: 85,
    tobaccoOk: true, diabetesOk: true,
    cancelledConditions: ['chf', 'oxygen'],
    notes: 'Level benefit available for most health histories. Strong brand recognition.',
  },
  {
    name: 'Corebridge Financial',
    product: 'AG Quick Issue Plus',
    minAge: 50, maxAge: 80,
    tobaccoOk: false, diabetesOk: true,
    cancelledConditions: ['cancer', 'stroke', 'oxygen'],
    notes: 'Competitive rates for non-tobacco preferred health. Instant decision.',
  },
  {
    name: 'Transamerica',
    product: 'Immediate Solution',
    minAge: 45, maxAge: 85,
    tobaccoOk: true, diabetesOk: true,
    cancelledConditions: ['oxygen', 'wheelchair', 'chf'],
    notes: 'Immediate benefit even for some health conditions. Good for diabetics.',
  },
  {
    name: 'Foresters Financial',
    product: 'PlanRight',
    minAge: 50, maxAge: 85,
    tobaccoOk: true, diabetesOk: true,
    cancelledConditions: ['oxygen'],
    notes: 'Fraternal benefits included. Member dividends possible. Very competitive.',
  },
  {
    name: 'Royal Neighbors',
    product: 'Modified Benefit Plan',
    minAge: 50, maxAge: 80,
    tobaccoOk: true, diabetesOk: true,
    cancelledConditions: [],
    notes: 'Modified benefit — accepts most health conditions. 2-year graded benefit.',
  },
];

export function matchCarriers(profile: UnderwritingProfile): CarrierMatch[] {
  const age = parseInt(profile.age);
  if (isNaN(age)) return [];

  return RULES
    .map((rule): CarrierMatch & { score: number } => {
      let score = 100;

      if (age < rule.minAge || age > rule.maxAge) return { ...dummyMatch(rule), score: 0 };
      if (profile.tobacco === true && !rule.tobaccoOk) score -= 40;
      if (profile.diabetes === true && !rule.diabetesOk) score -= 40;

      for (const cond of rule.cancelledConditions) {
        if (profile[cond] === true) score -= 30;
      }

      if (profile.oxygen === true && !rule.cancelledConditions.includes('oxygen')) score -= 20;
      if (profile.chf === true) score -= 15;
      if (profile.cancer === true) score -= 20;
      if (profile.stroke === true) score -= 15;

      score = Math.max(0, score);

      return {
        name: rule.name,
        product: rule.product,
        confidence: score,
        notes: rule.notes,
        score,
      };
    })
    .filter((m) => m.score > 30)
    .sort((a, b) => b.score - a.score)
    .map(({ score: _s, ...m }) => m);
}

function dummyMatch(rule: CarrierRule): CarrierMatch {
  return { name: rule.name, product: rule.product, confidence: 0, notes: rule.notes };
}
