import type { UnderwritingProfile, CarrierMatch, UnderwritingClass, DeclineRisk } from './types';

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
    .map((rule): CarrierMatch & { score: number; hitConditions: number } => {
      let score = 100;
      let hitConditions = 0;

      if (age < rule.minAge || age > rule.maxAge) return { ...dummyMatch(rule), score: 0, hitConditions: 0 };
      if (profile.tobacco === true && !rule.tobaccoOk) { score -= 40; hitConditions++; }
      if (profile.diabetes === true && !rule.diabetesOk) { score -= 40; hitConditions++; }

      for (const cond of rule.cancelledConditions) {
        if (profile[cond] === true) { score -= 30; hitConditions++; }
      }

      if (profile.oxygen === true && !rule.cancelledConditions.includes('oxygen')) { score -= 20; hitConditions++; }
      if (profile.chf === true) { score -= 15; hitConditions++; }
      if (profile.cancer === true) { score -= 20; hitConditions++; }
      if (profile.stroke === true) { score -= 15; hitConditions++; }

      score = Math.max(0, score);

      return {
        name: rule.name,
        product: rule.product,
        confidence: score,
        notes: rule.notes,
        underwritingClass: classifyUnderwritingClass(score),
        declineRisk: classifyDeclineRisk(hitConditions),
        score,
        hitConditions,
      };
    })
    .filter((m) => m.score > 30)
    .sort((a, b) => b.score - a.score)
    .map((m): CarrierMatch => ({
      name: m.name,
      product: m.product,
      confidence: m.confidence,
      notes: m.notes,
      underwritingClass: m.underwritingClass,
      declineRisk: m.declineRisk,
    }));
}

function classifyUnderwritingClass(score: number): UnderwritingClass {
  if (score >= 85) return 'preferred';
  if (score >= 70) return 'standard';
  if (score >= 50) return 'graded';
  return 'modified';
}

function classifyDeclineRisk(hitConditions: number): DeclineRisk {
  if (hitConditions === 0) return 'low';
  if (hitConditions === 1) return 'medium';
  return 'high';
}

function dummyMatch(rule: CarrierRule): CarrierMatch {
  return {
    name: rule.name,
    product: rule.product,
    confidence: 0,
    notes: rule.notes,
    underwritingClass: 'guaranteed',
    declineRisk: 'high',
  };
}
