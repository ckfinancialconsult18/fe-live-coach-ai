// ── FE Carrier Recommendation Engine ─────────────────────────────────────────
// Deterministic carrier matching from the live underwriting profile.
// No AI calls — runs instantly on every profile update.
// Guidelines reflect general industry knowledge; not a guarantee of approval.

import type {
  UnderwritingProfile,
  CarrierMatch,
  EnhancedCarrierMatch,
  UnderwritingClass,
  DeclineRisk,
  ApprovalLikelihood,
  MissingUnderwritingQuestion,
} from './types';

// ── BMI helper ────────────────────────────────────────────────────────────────
function calcBmi(profile: UnderwritingProfile): number | null {
  const ft = parseInt(profile.heightFt ?? '');
  const inVal = parseInt(profile.heightIn ?? '0');
  const lbs = parseInt(profile.weight ?? '');
  if (isNaN(ft) || isNaN(lbs) || ft === 0) return null;
  const totalInches = ft * 12 + (isNaN(inVal) ? 0 : inVal);
  return Math.round((lbs / (totalInches * totalInches)) * 703);
}

function bmiPenalty(bmi: number | null): number {
  if (bmi === null) return 0;
  if (bmi > 45) return 20;
  if (bmi > 40) return 12;
  if (bmi > 35) return 5;
  return 0;
}

// ── Approval likelihood from fit score ───────────────────────────────────────
function fitToApproval(fit: number): ApprovalLikelihood {
  if (fit >= 85) return 'very_high';
  if (fit >= 70) return 'high';
  if (fit >= 50) return 'moderate';
  if (fit >= 25) return 'low';
  return 'decline';
}

function fitToUWClass(fit: number): UnderwritingClass {
  if (fit >= 85) return 'preferred';
  if (fit >= 70) return 'standard';
  if (fit >= 50) return 'graded';
  if (fit >= 25) return 'modified';
  return 'guaranteed';
}

function fitToDeclineRisk(fit: number): DeclineRisk {
  if (fit >= 70) return 'low';
  if (fit >= 40) return 'medium';
  return 'high';
}

type CarrierResult = {
  fit: number;
  reasons: string[];
  concerns: string[];
  missing: string[];
};

// ── Carrier 1: Mutual of Omaha ────────────────────────────────────────────────
function scoreMutualOfOmaha(p: UnderwritingProfile, age: number, bmi: number | null): CarrierResult {
  const reasons: string[] = [];
  const concerns: string[] = [];
  const missing: string[] = [];
  let fit = 95;

  // Hard declines
  if (p.chf === true) return { fit: 5, reasons: [], concerns: ['CHF is a decline for level benefit'], missing: [] };
  if (p.oxygen === true) return { fit: 5, reasons: [], concerns: ['Oxygen use declines level benefit'], missing: [] };
  if (p.dialysis === true) return { fit: 0, reasons: [], concerns: ['Dialysis = automatic decline'], missing: [] };
  if (p.wheelchair === true) return { fit: 8, reasons: [], concerns: ['Wheelchair bound declines level benefit'], missing: [] };

  // Strict conditions
  if (p.walker === true) { fit -= 30; concerns.push('Walker use → likely graded benefit'); }
  if (p.copd === true) { fit -= 18; concerns.push('COPD with hospitalization may decline level'); }
  if (p.stroke === true) { fit -= 22; concerns.push('Recent stroke may decline level benefit'); }
  if (p.heartAttack === true) { fit -= 20; concerns.push('Recent heart attack may require graded'); }
  if (p.cancer === true) { fit -= 20; concerns.push('Cancer history requires remission confirmation'); }
  if (p.kidneyDisease === true) { fit -= 15; concerns.push('Kidney disease may restrict to graded'); }
  if (p.felony === true) { fit -= 10; concerns.push('Felony conviction may restrict coverage'); }
  if (p.bankruptcy === true) { fit -= 5; concerns.push('Recent bankruptcy may be noted'); }

  // Positives
  if (p.tobacco === false) { reasons.push('Non-tobacco preferred rates'); fit = Math.min(95, fit + 5); }
  if (p.tobacco === true) { concerns.push('Tobacco use — standard smoker rates'); fit -= 8; }
  if (p.diabetes === false || p.diabetes === null) reasons.push('No diabetes — stronger eligibility');
  if (p.diabetes === true) { fit -= 8; concerns.push('Diabetes — insulin use may limit to graded'); }

  fit -= bmiPenalty(bmi);
  if (bmi !== null && bmi <= 32) reasons.push('Build within preferred guidelines');
  if (bmi !== null && bmi > 40) concerns.push('High BMI may restrict underwriting class');

  if (age >= 50 && age <= 75) reasons.push(`Age ${age} within ideal range`);
  if (age > 80) { fit -= 10; concerns.push('Age 80+ restricts available products'); }

  if (fit >= 80) reasons.push('Strong eligibility for level benefit');

  if (p.oxygen === null) missing.push('Oxygen status');
  if (p.chf === null) missing.push('CHF history');
  if (p.walker === null) missing.push('Mobility aid use');

  return { fit: Math.max(0, Math.min(100, fit)), reasons, concerns, missing };
}

// ── Carrier 2: Americo Eagle Premier ─────────────────────────────────────────
function scoreAmerico(p: UnderwritingProfile, age: number, bmi: number | null): CarrierResult {
  const reasons: string[] = [];
  const concerns: string[] = [];
  const missing: string[] = [];
  let fit = 88;

  if (p.dialysis === true) return { fit: 5, reasons: [], concerns: ['Dialysis = decline'], missing: [] };

  if (p.oxygen === true) { fit -= 35; concerns.push('Oxygen → graded benefit only'); }
  if (p.wheelchair === true) { fit -= 30; concerns.push('Wheelchair → graded benefit'); }

  // Americo's strengths
  if (p.diabetes === true) { reasons.push('Excellent diabetic guidelines — insulin accepted'); }
  else if (p.diabetes === false) { reasons.push('No diabetes — preferred eligibility'); }

  if (p.copd === true) { fit -= 8; reasons.push('COPD accepted — one of the most liberal carriers'); concerns.push('Hospitalization for COPD may affect class'); }
  if (p.chf === true) { fit -= 20; concerns.push('CHF → graded benefit likely'); }
  if (p.stroke === true) { fit -= 15; concerns.push('Stroke history — timing matters for class'); }
  if (p.heartAttack === true) { fit -= 15; concerns.push('Heart attack history — graded if recent'); }
  if (p.cancer === true) { fit -= 15; concerns.push('Cancer — remission status determines class'); }
  if (p.kidneyDisease === true) { fit -= 12; concerns.push('Kidney disease may require graded'); }
  if (p.walker === true) { fit -= 12; concerns.push('Walker use may affect class'); }
  if (p.tobacco === true) { fit -= 5; reasons.push('Tobacco accepted at standard rates'); }
  if (p.felony === true) { fit -= 10; concerns.push('Felony may restrict product'); }

  fit -= bmiPenalty(bmi);

  if (age >= 50 && age <= 80) reasons.push(`Age ${age} well within Americo guidelines`);
  if (age > 80) { fit -= 10; concerns.push('Limited products above age 80'); }

  if (fit >= 70 && !p.oxygen && !p.wheelchair) reasons.push('Good candidate for Eagle level benefit');

  if (p.oxygen === null) missing.push('Oxygen status');
  if (p.diabetes === null) missing.push('Diabetes status');

  return { fit: Math.max(0, Math.min(100, fit)), reasons, concerns, missing };
}

// ── Carrier 3: Corebridge Financial (AIG) ─────────────────────────────────────
function scoreCorebridge(p: UnderwritingProfile, age: number, bmi: number | null): CarrierResult {
  const reasons: string[] = [];
  const concerns: string[] = [];
  const missing: string[] = [];
  let fit = 82;

  if (p.dialysis === true) return { fit: 0, reasons: [], concerns: ['Dialysis = decline'], missing: [] };
  if (age > 80) return { fit: 10, reasons: [], concerns: ['Age limit is 80 for most Corebridge FE products'], missing: [] };

  if (p.oxygen === true) { fit -= 35; concerns.push('Oxygen use → graded or decline'); }
  if (p.chf === true) { fit -= 25; concerns.push('CHF → graded only'); }
  if (p.cancer === true) { fit -= 20; concerns.push('Cancer history — 2+ year remission required for level'); }
  if (p.stroke === true) { fit -= 18; concerns.push('Stroke within 2 years → graded'); }
  if (p.heartAttack === true) { fit -= 18; concerns.push('Heart attack — timing determines class'); }
  if (p.diabetes === true) { fit -= 8; concerns.push('Diabetes — insulin use may restrict to graded'); }
  if (p.copd === true) { fit -= 12; concerns.push('COPD may restrict class if hospitalized'); }
  if (p.wheelchair === true) { fit -= 25; concerns.push('Wheelchair → graded or decline'); }
  if (p.walker === true) { fit -= 15; concerns.push('Walker use may affect class'); }
  if (p.tobacco === true) { fit -= 10; concerns.push('Tobacco user — higher premium tier'); }
  else if (p.tobacco === false) { reasons.push('Non-tobacco rates available'); }

  fit -= bmiPenalty(bmi);

  reasons.push('Fast electronic decision — often same-day approval');
  if (fit >= 70) reasons.push('Good eligibility for Quick Issue Plus');

  if (age >= 55 && age <= 75) { reasons.push(`Age ${age} — strong Corebridge target range`); }

  if (p.oxygen === null) missing.push('Oxygen status');
  if (p.tobacco === null) missing.push('Tobacco status');
  if (p.diabetes === null) missing.push('Diabetes / insulin status');

  return { fit: Math.max(0, Math.min(100, fit)), reasons, concerns, missing };
}

// ── Carrier 4: Transamerica ───────────────────────────────────────────────────
function scoreTransamerica(p: UnderwritingProfile, age: number, bmi: number | null): CarrierResult {
  const reasons: string[] = [];
  const concerns: string[] = [];
  const missing: string[] = [];
  let fit = 84;

  if (p.dialysis === true) return { fit: 0, reasons: [], concerns: ['Dialysis = decline'], missing: [] };
  if (p.wheelchair === true) return { fit: 8, reasons: [], concerns: ['Wheelchair = decline for level benefit'], missing: [] };

  if (p.oxygen === true) { fit -= 40; concerns.push('Oxygen use declines level benefit'); }
  if (p.chf === true) { fit -= 30; concerns.push('CHF = decline for Transamerica level benefit'); }
  if (p.heartAttack === true) { fit -= 25; concerns.push('Heart attack history — very strict at Transamerica'); }
  if (p.stroke === true) { fit -= 20; concerns.push('Stroke within 2 years → graded'); }
  if (p.cancer === true) { fit -= 15; concerns.push('Cancer — 2+ years remission needed for level'); }
  if (p.copd === true) { fit -= 10; concerns.push('COPD — hospitalization may restrict to graded'); }
  if (p.diabetes === true) { fit -= 6; concerns.push('Diabetes — oral meds preferred; insulin → graded'); }
  if (p.walker === true) { fit -= 15; concerns.push('Walker use → graded consideration'); }
  if (p.kidneyDisease === true) { fit -= 12; concerns.push('Kidney disease may affect class'); }
  if (p.tobacco === true) { reasons.push('Tobacco accepted'); fit -= 5; }
  else if (p.tobacco === false) reasons.push('Non-tobacco pricing available');

  fit -= bmiPenalty(bmi);

  if (age >= 50 && age <= 75) reasons.push('Strong Transamerica age band');
  if (age > 80) { fit -= 10; concerns.push('Limited options above 80'); }
  if (fit >= 75 && !p.chf && !p.oxygen) reasons.push('Good candidate for Immediate Solution level benefit');

  if (p.oxygen === null) missing.push('Oxygen use');
  if (p.chf === null) missing.push('CHF / heart failure history');

  return { fit: Math.max(0, Math.min(100, fit)), reasons, concerns, missing };
}

// ── Carrier 5: Aetna ─────────────────────────────────────────────────────────
function scoreAetna(p: UnderwritingProfile, age: number, bmi: number | null): CarrierResult {
  const reasons: string[] = [];
  const concerns: string[] = [];
  const missing: string[] = [];
  let fit = 80;

  if (p.dialysis === true) return { fit: 5, reasons: [], concerns: ['Dialysis = decline'], missing: [] };

  if (p.oxygen === true) { fit -= 30; concerns.push('Oxygen → graded benefit'); }
  if (p.chf === true) { fit -= 20; concerns.push('CHF → graded product only'); }
  if (p.diabetes === true) { reasons.push('Good diabetic guidelines — insulin accepted'); }
  if (p.cancer === true) { fit -= 15; concerns.push('Cancer history reviewed case by case'); }
  if (p.stroke === true) { fit -= 15; concerns.push('Stroke — timing determines level vs graded'); }
  if (p.heartAttack === true) { fit -= 15; concerns.push('Heart attack — graded if recent'); }
  if (p.copd === true) { fit -= 8; concerns.push('COPD with hospitalization may require graded'); }
  if (p.wheelchair === true) { fit -= 25; concerns.push('Wheelchair may limit to modified benefit'); }
  if (p.walker === true) { fit -= 10; concerns.push('Walker use noted in underwriting'); }
  if (p.tobacco === true) { fit -= 5; reasons.push('Tobacco accepted'); }
  if (p.kidneyDisease === true) { fit -= 12; concerns.push('Kidney disease may affect class'); }

  fit -= bmiPenalty(bmi);

  if (age >= 40 && age <= 80) reasons.push(`Age ${age} — Aetna covers 40-89 with competitive rates`);
  if (age > 80) reasons.push('Aetna available up to age 89 — broader than most');
  if (fit >= 65) reasons.push('Good fit for Aetna Final Expense program');

  if (p.oxygen === null) missing.push('Oxygen status');
  if (p.chf === null) missing.push('CHF history');

  return { fit: Math.max(0, Math.min(100, fit)), reasons, concerns, missing };
}

// ── Carrier 6: Foresters Financial ───────────────────────────────────────────
function scoreForesters(p: UnderwritingProfile, age: number, bmi: number | null): CarrierResult {
  const reasons: string[] = [];
  const concerns: string[] = [];
  const missing: string[] = [];
  let fit = 80;

  if (p.dialysis === true) return { fit: 5, reasons: [], concerns: ['Dialysis = decline'], missing: [] };

  if (p.oxygen === true) { fit -= 30; concerns.push('Oxygen → graded benefit only'); }
  if (p.chf === true) { fit -= 22; concerns.push('CHF → graded benefit'); }
  if (p.diabetes === true) { fit -= 5; reasons.push('Diabetes accepted — insulin reviewed case-by-case'); }
  if (p.cancer === true) { fit -= 15; concerns.push('Cancer — remission status reviewed'); }
  if (p.stroke === true) { fit -= 15; concerns.push('Stroke history reviewed'); }
  if (p.heartAttack === true) { fit -= 15; concerns.push('Heart attack history noted'); }
  if (p.copd === true) { fit -= 8; concerns.push('COPD noted in underwriting'); }
  if (p.felony === true) { fit -= 25; concerns.push('Felony conviction — Foresters asks criminal history questions'); }
  if (p.dui === true) { fit -= 15; concerns.push('DUI — Foresters includes driving record questions'); }
  if (p.tobacco === true) { fit -= 5; reasons.push('Tobacco accepted'); }

  fit -= bmiPenalty(bmi);

  reasons.push('Fraternal benefits: educational grants, scholarships, member programs');
  if (fit >= 65) reasons.push('Good candidate for PlanRight program');
  if (p.felony === null) missing.push('Criminal history (Foresters asks this)');
  if (p.dui === null) missing.push('DUI / driving history (Foresters asks this)');
  if (p.oxygen === null) missing.push('Oxygen use');

  if (age >= 50 && age <= 85) reasons.push(`Age ${age} within Foresters guidelines`);

  return { fit: Math.max(0, Math.min(100, fit)), reasons, concerns, missing };
}

// ── Carrier 7: Royal Neighbors of America ────────────────────────────────────
function scoreRoyalNeighbors(p: UnderwritingProfile, age: number, bmi: number | null): CarrierResult {
  const reasons: string[] = [];
  const concerns: string[] = [];
  const missing: string[] = [];
  let fit = 72;

  if (p.dialysis === true) { fit -= 25; concerns.push('Dialysis may restrict to modified benefit'); }
  if (p.oxygen === true) { fit -= 20; concerns.push('Oxygen → graded/modified benefit'); }
  if (p.chf === true) { fit -= 15; concerns.push('CHF → 2-year graded benefit period'); }
  if (p.diabetes === true) { reasons.push('Diabetes accepted including insulin'); }
  if (p.cancer === true) { fit -= 10; concerns.push('Cancer history → graded period'); }
  if (p.stroke === true) { fit -= 10; concerns.push('Stroke → graded period applies'); }
  if (p.heartAttack === true) { fit -= 10; concerns.push('Heart attack → graded period applies'); }
  if (p.copd === true) { reasons.push('COPD generally accepted'); }
  if (p.tobacco === true) { fit -= 3; reasons.push('Tobacco accepted'); }

  fit -= bmiPenalty(bmi);

  reasons.push('2-year graded benefit accepts most health conditions');
  if (p.gender === 'female' || p.gender === 'F' || p.gender?.toLowerCase().startsWith('f')) {
    reasons.push('Competitive rates for female clients');
    fit = Math.min(100, fit + 5);
  }
  if (fit >= 60) reasons.push('Good fit for RNOA Modified Benefit Plan');

  if (age >= 50 && age <= 80) reasons.push(`Age ${age} within RNOA coverage range`);

  return { fit: Math.max(0, Math.min(100, fit)), reasons, concerns, missing };
}

// ── Carrier 8: Prosperity Life ────────────────────────────────────────────────
function scoreProsperity(p: UnderwritingProfile, age: number, bmi: number | null): CarrierResult {
  const reasons: string[] = [];
  const concerns: string[] = [];
  const missing: string[] = [];
  let fit = 70;

  if (p.dialysis === true) { fit -= 20; concerns.push('Dialysis may restrict to guaranteed issue'); }
  if (p.oxygen === true) { fit -= 15; concerns.push('Oxygen → modified benefit product'); reasons.push('Prosperity has products for oxygen users'); }
  if (p.chf === true) { reasons.push('CHF accepted — one of few carriers'); }
  if (p.diabetes === true) { reasons.push('Diabetes including insulin accepted'); }
  if (p.cancer === true) { fit -= 10; concerns.push('Active cancer may restrict to modified'); }
  if (p.stroke === true) { reasons.push('Stroke history accepted for graded products'); }
  if (p.heartAttack === true) { reasons.push('Heart attack history accepted for graded'); }
  if (p.copd === true) { reasons.push('COPD accepted with graded product'); }
  if (p.wheelchair === true) { fit -= 10; concerns.push('Wheelchair may limit to modified benefit'); reasons.push('Prosperity has options for limited mobility'); }
  if (p.walker === true) { reasons.push('Walker use accepted for graded products'); }
  if (p.tobacco === true) { fit -= 3; reasons.push('Tobacco accepted'); }
  if (p.felony === true) { fit -= 15; concerns.push('Felony may restrict products'); }
  if (p.bankruptcy === true) { fit -= 5; concerns.push('Recent bankruptcy noted'); }

  fit -= bmiPenalty(bmi) * 0.5;

  reasons.push('Very lenient underwriting — accepts most conditions');
  if (age >= 40 && age <= 80) reasons.push(`Age ${age} within Prosperity guidelines`);

  return { fit: Math.max(0, Math.min(100, fit)), reasons, concerns, missing };
}

// ── Carrier 9: CFG Partners ───────────────────────────────────────────────────
function scoreCFG(p: UnderwritingProfile, age: number, bmi: number | null): CarrierResult {
  const reasons: string[] = [];
  const concerns: string[] = [];
  const missing: string[] = [];
  let fit = 65;

  if (p.dialysis === true) { fit -= 10; reasons.push('CFG has products for dialysis patients'); }
  if (p.oxygen === true) { reasons.push('Oxygen use accepted — CFG specialty'); }
  if (p.chf === true) { reasons.push('CHF accepted with modified benefit'); }
  if (p.diabetes === true) { reasons.push('Diabetes including insulin accepted'); }
  if (p.cancer === true) { reasons.push('Cancer history accepted for graded products'); }
  if (p.wheelchair === true) { reasons.push('Wheelchair use accepted with modified benefit'); }
  if (p.felony === true) { fit -= 20; concerns.push('Felony may be a decline'); }
  if (p.tobacco === true) { fit -= 3; reasons.push('Tobacco accepted'); }

  fit -= bmiPenalty(bmi) * 0.3;

  reasons.push('High-risk specialist — accepts conditions most carriers decline');
  concerns.push('Higher premiums reflect elevated risk acceptance');
  if (age >= 40 && age <= 80) reasons.push(`Age ${age} within CFG guidelines`);

  return { fit: Math.max(0, Math.min(100, fit)), reasons, concerns, missing };
}

// ── Carrier 10: Liberty Bankers ───────────────────────────────────────────────
function scoreLibertyBankers(p: UnderwritingProfile, age: number, bmi: number | null): CarrierResult {
  const reasons: string[] = [];
  const concerns: string[] = [];
  const missing: string[] = [];
  let fit = 76;

  if (p.dialysis === true) return { fit: 5, reasons: [], concerns: ['Dialysis = decline'], missing: [] };
  if (p.oxygen === true) { fit -= 28; concerns.push('Oxygen → graded product'); }
  if (p.chf === true) { fit -= 20; concerns.push('CHF → graded benefit likely'); }
  if (p.diabetes === true) { fit -= 5; reasons.push('Diabetes accepted including insulin for graded products'); }
  if (p.cancer === true) { fit -= 15; concerns.push('Cancer history reviewed for class'); }
  if (p.stroke === true) { fit -= 15; concerns.push('Stroke — timing important for eligibility'); }
  if (p.heartAttack === true) { fit -= 15; concerns.push('Heart attack history may require graded'); }
  if (p.copd === true) { fit -= 10; concerns.push('COPD may affect level eligibility'); }
  if (p.wheelchair === true) { fit -= 20; concerns.push('Wheelchair may restrict to graded'); }
  if (p.walker === true) { fit -= 10; concerns.push('Walker use noted'); }
  if (p.tobacco === true) { fit -= 5; reasons.push('Tobacco accepted at standard rates'); }
  if (p.veteran === true) { reasons.push('Veteran status — may qualify for special programs'); fit = Math.min(100, fit + 5); }

  fit -= bmiPenalty(bmi);

  if (age >= 40 && age <= 85) reasons.push(`Age ${age} within broad Liberty Bankers range (18-85)`);
  if (fit >= 65) reasons.push('Competitive pricing for moderate risk profiles');

  if (p.oxygen === null) missing.push('Oxygen status');

  return { fit: Math.max(0, Math.min(100, fit)), reasons, concerns, missing };
}

// ── Carrier 11: Great Western Insurance ──────────────────────────────────────
function scoreGreatWestern(p: UnderwritingProfile, age: number, bmi: number | null): CarrierResult {
  const reasons: string[] = [];
  const concerns: string[] = [];
  const missing: string[] = [];
  let fit = 74;

  if (p.dialysis === true) { fit -= 15; concerns.push('Dialysis — modified product only'); }
  if (p.oxygen === true) { fit -= 25; concerns.push('Oxygen → graded or modified benefit'); }
  if (p.chf === true) { fit -= 18; concerns.push('CHF → graded product recommended'); }
  if (p.diabetes === true) { reasons.push('Diabetes accepted — competitive diabetic rates'); }
  if (p.cancer === true) { fit -= 12; concerns.push('Cancer history reviewed for class'); }
  if (p.stroke === true) { fit -= 12; concerns.push('Stroke history noted'); }
  if (p.heartAttack === true) { fit -= 12; concerns.push('Heart attack history may require graded'); }
  if (p.copd === true) { reasons.push('COPD accepted — Great Western is COPD-friendly'); }
  if (p.wheelchair === true) { fit -= 18; concerns.push('Wheelchair may restrict to graded'); }
  if (p.walker === true) { fit -= 10; concerns.push('Walker use may affect class'); }
  if (p.tobacco === true) { fit -= 5; reasons.push('Tobacco accepted'); }
  if (p.veteran === true) { reasons.push('Veteran benefits may apply'); }

  fit -= bmiPenalty(bmi);

  reasons.push('Accepts multiple health conditions — good for complex profiles');
  if (age >= 40 && age <= 80) reasons.push(`Age ${age} within Great Western guidelines`);

  return { fit: Math.max(0, Math.min(100, fit)), reasons, concerns, missing };
}

// ── Carrier 12: SBLI ──────────────────────────────────────────────────────────
function scoreSBLI(p: UnderwritingProfile, age: number, bmi: number | null): CarrierResult {
  const reasons: string[] = [];
  const concerns: string[] = [];
  const missing: string[] = [];
  let fit = 90;

  // SBLI is strictest — best rates for cleanest risks
  if (p.dialysis === true) return { fit: 0, reasons: [], concerns: ['Dialysis = decline'], missing: [] };
  if (p.oxygen === true) return { fit: 0, reasons: [], concerns: ['Oxygen = decline for SBLI'], missing: [] };
  if (p.chf === true) return { fit: 0, reasons: [], concerns: ['CHF = decline for SBLI'], missing: [] };
  if (p.wheelchair === true) return { fit: 0, reasons: [], concerns: ['Wheelchair = decline for SBLI'], missing: [] };
  if (p.heartAttack === true) { fit -= 35; concerns.push('Heart attack history may decline SBLI level'); }
  if (p.stroke === true) { fit -= 35; concerns.push('Stroke history may decline SBLI level'); }
  if (p.cancer === true) { fit -= 30; concerns.push('Cancer history — SBLI is strict'); }
  if (p.copd === true) { fit -= 25; concerns.push('COPD — SBLI restrictive on respiratory conditions'); }
  if (p.diabetes === true) { fit -= 15; concerns.push('Diabetes — SBLI prefers diet-controlled or oral meds only'); }
  if (p.walker === true) { fit -= 20; concerns.push('Walker use — SBLI may decline or restrict'); }
  if (p.tobacco === true) { fit -= 10; concerns.push('Tobacco — higher smoker rates at SBLI'); }
  if (p.felony === true) { fit -= 30; concerns.push('Felony may decline at SBLI'); }
  if (p.dui === true) { fit -= 20; concerns.push('DUI — SBLI reviews driving history'); }

  fit -= bmiPenalty(bmi);

  if (fit >= 80) {
    reasons.push('Excellent health profile — qualifies for SBLI\'s best rates');
    reasons.push('Simplified issue — quick and easy application process');
  }

  if (age >= 45 && age <= 75) reasons.push(`Age ${age} — SBLI sweet spot for lowest premiums`);
  if (age > 75) { fit -= 10; concerns.push('SBLI premiums increase significantly above 75'); }

  return { fit: Math.max(0, Math.min(100, fit)), reasons, concerns, missing };
}

// ── Carrier scoring registry ──────────────────────────────────────────────────
type ScorerFn = (p: UnderwritingProfile, age: number, bmi: number | null) => CarrierResult;

const CARRIERS: { name: string; product: string; scorer: ScorerFn }[] = [
  { name: 'Mutual of Omaha',      product: 'Living Promise',           scorer: scoreMutualOfOmaha },
  { name: 'SBLI',                 product: 'Simple Life',              scorer: scoreSBLI },
  { name: 'Americo',              product: 'Eagle Premier',            scorer: scoreAmerico },
  { name: 'Transamerica',         product: 'Immediate Solution',       scorer: scoreTransamerica },
  { name: 'Corebridge Financial', product: 'AG Quick Issue Plus',      scorer: scoreCorebridge },
  { name: 'Aetna',                product: 'Final Expense Whole Life', scorer: scoreAetna },
  { name: 'Foresters Financial',  product: 'PlanRight',                scorer: scoreForesters },
  { name: 'Liberty Bankers',      product: 'Final Expense',            scorer: scoreLibertyBankers },
  { name: 'Great Western',        product: 'Final Expense WL',         scorer: scoreGreatWestern },
  { name: 'Royal Neighbors',      product: 'Modified Benefit WL',      scorer: scoreRoyalNeighbors },
  { name: 'Prosperity Life',      product: 'Final Expense',            scorer: scoreProsperity },
  { name: 'CFG Partners',         product: 'Final Expense',            scorer: scoreCFG },
];

// ── Public API ────────────────────────────────────────────────────────────────

/** Returns top-scored carriers as EnhancedCarrierMatch[], sorted by fit descending. */
export function matchCarriersEnhanced(profile: UnderwritingProfile): EnhancedCarrierMatch[] {
  const age = parseInt(profile.age);
  if (isNaN(age)) return [];

  const bmi = calcBmi(profile);

  return CARRIERS
    .map(({ name, product, scorer }) => {
      const { fit, reasons, concerns, missing } = scorer(profile, age, bmi);
      return {
        name,
        product,
        fitPct: fit,
        confidence: fit,
        notes: reasons[0] ?? '',
        approvalLikelihood: fitToApproval(fit),
        underwritingClass: fitToUWClass(fit),
        declineRisk: fitToDeclineRisk(fit),
        reasons,
        concerns,
        missingForDecision: missing,
      } satisfies EnhancedCarrierMatch;
    })
    .sort((a, b) => b.fitPct - a.fitPct);
}

/** Backward-compat shim: returns CarrierMatch[] (used by UnderwritingPanel & existing code). */
export function matchCarriers(profile: UnderwritingProfile): CarrierMatch[] {
  return matchCarriersEnhanced(profile)
    .filter(c => c.fitPct >= 30)
    .map(({ name, product, confidence, notes, underwritingClass, declineRisk }): CarrierMatch => ({
      name, product, confidence, notes, underwritingClass, declineRisk,
    }));
}

// ── Missing underwriting questions ────────────────────────────────────────────
export function getMissingUWQuestions(profile: UnderwritingProfile): MissingUnderwritingQuestion[] {
  const questions: MissingUnderwritingQuestion[] = [];

  if (!profile.age) questions.push({ field: 'age', label: 'Age', question: 'How old are you?', priority: 'critical' });
  if (profile.tobacco === null) questions.push({ field: 'tobacco', label: 'Tobacco Use', question: 'Do you currently use tobacco in any form?', priority: 'critical' });
  if (profile.diabetes === null) questions.push({ field: 'diabetes', label: 'Diabetes', question: 'Do you have diabetes?', priority: 'critical' });
  if (profile.oxygen === null) questions.push({ field: 'oxygen', label: 'Oxygen Use', question: 'Do you currently use oxygen?', priority: 'critical' });
  if (profile.chf === null) questions.push({ field: 'chf', label: 'Heart Failure (CHF)', question: 'Have you ever been diagnosed with congestive heart failure?', priority: 'high' });
  if (profile.heartAttack === null || profile.heartAttack === undefined) questions.push({ field: 'heartAttack', label: 'Heart Attack', question: 'Have you ever had a heart attack?', priority: 'high' });
  if (profile.copd === null) questions.push({ field: 'copd', label: 'COPD / Emphysema', question: 'Have you been diagnosed with COPD or emphysema?', priority: 'high' });
  if (profile.stroke === null) questions.push({ field: 'stroke', label: 'Stroke', question: 'Have you ever had a stroke or TIA?', priority: 'high' });
  if (profile.cancer === null) questions.push({ field: 'cancer', label: 'Cancer History', question: 'Do you have a history of cancer?', priority: 'high' });
  if (profile.kidneyDisease === null) questions.push({ field: 'kidneyDisease', label: 'Kidney Disease', question: 'Do you have kidney disease?', priority: 'high' });
  if (profile.dialysis === null || profile.dialysis === undefined) questions.push({ field: 'dialysis', label: 'Dialysis', question: 'Are you currently on dialysis?', priority: 'high' });
  if (profile.walker === null) questions.push({ field: 'walker', label: 'Walker / Mobility Aid', question: 'Do you use a walker, cane, or scooter?', priority: 'normal' });
  if (profile.wheelchair === null) questions.push({ field: 'wheelchair', label: 'Wheelchair', question: 'Are you confined to a wheelchair?', priority: 'normal' });
  if (!profile.heightFt || !profile.weight) questions.push({ field: 'build', label: 'Height & Weight', question: 'What is your height and weight?', priority: 'normal' });
  if (!profile.currentMedications) questions.push({ field: 'medications', label: 'Current Medications', question: 'What medications are you currently taking?', priority: 'normal' });

  return questions;
}
