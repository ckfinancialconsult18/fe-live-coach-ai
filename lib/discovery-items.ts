// ── Final Expense discovery item definitions ──────────────────────────────────
// Each item has two detection layers:
//   Layer 1 (instant): keyword scan on agent + prospect speech
//   Layer 2 (AI): sparse discoveryUpdates from the coach model
//
// State machine: not_started → in_progress → completed | needs_followup
// AI can set any state; keyword layer provides the floor.

import type { CallStage } from './types';

export type ItemCategory = 'motivation' | 'beneficiary' | 'health' | 'financial' | 'logistics';

export interface IncompleteSignal {
  pattern: RegExp;
  note: string;           // what the agent should follow up on
  followUpQuestion: string;
}

export interface ContradictionPair {
  a: RegExp;
  b: RegExp;
  description: string;
}

export interface DiscoveryItemDef {
  id: string;
  label: string;
  category: ItemCategory;
  /** Higher = ask earlier in the call. Used with per-stage boosts. */
  basePriority: number;
  /** Urgency label shown in the coaching card. */
  urgency: 'critical' | 'high' | 'normal';
  /** Substrings (lowercase) in ANY agent line that suggest the agent has raised this topic → in_progress */
  agentTriggers: string[];
  /** Regexes on ANY line (agent or prospect) that indicate a COMPLETE answer */
  completeSignals: RegExp[];
  /** Regexes on PROSPECT lines that indicate an answer was given but is incomplete */
  incompleteSignals: IncompleteSignal[];
  /** Contradiction pairs — if both match anywhere in the transcript, surface a warning */
  contradictionPairs: ContradictionPair[];
  /** Default coaching question */
  question: string;
}

export const DISCOVERY_ITEMS: DiscoveryItemDef[] = [
  // ── MOTIVATION ─────────────────────────────────────────────────────────────
  {
    id: 'reason_for_buying',
    label: 'Reason for Buying',
    category: 'motivation',
    basePriority: 95,
    urgency: 'critical',
    agentTriggers: ['why', 'what made', 'what brought', 'what prompted', 'reason for calling', 'tell me what'],
    completeSignals: [
      /\b(i want to|i need to|i'm trying to|i'd like to|to protect|peace of mind|don't want to be a burden|not be a burden|leave something|take care of my family|worried about|funeral cost|final wishes|dignified|leave behind)\b/i,
    ],
    incompleteSignals: [],
    contradictionPairs: [],
    question: "What made you reach out about life insurance today?",
  },
  {
    id: 'burial_wishes',
    label: 'Burial / Cremation Wishes',
    category: 'motivation',
    basePriority: 62,
    urgency: 'normal',
    agentTriggers: ['burial', 'cremation', 'wishes', 'arrangements', 'funeral preference', 'type of service'],
    completeSignals: [
      /\b(cremated|cremation|buried|burial|graveside|traditional (funeral|service)|i want to be (buried|cremated)|my wishes)\b/i,
    ],
    incompleteSignals: [],
    contradictionPairs: [],
    question: "Have you given any thought to whether you'd prefer burial or cremation?",
  },
  {
    id: 'funeral_planning',
    label: 'Pre-existing Funeral Plans',
    category: 'motivation',
    basePriority: 58,
    urgency: 'normal',
    agentTriggers: ['pre.?plan', 'funeral plan', 'already plan', 'arrangements made', 'funeral home'],
    completeSignals: [
      /\b(pre.?planned|already (planned|arranged|made arrangements)|haven't planned|no plans yet|haven't thought about it)\b/i,
    ],
    incompleteSignals: [],
    contradictionPairs: [],
    question: "Have you already made any funeral or burial arrangements?",
  },
  {
    id: 'financial_concerns',
    label: 'Financial Concerns',
    category: 'motivation',
    basePriority: 65,
    urgency: 'high',
    agentTriggers: ['financial concern', 'worried about money', 'financial burden', 'debt', 'bills left behind', 'leave debt'],
    completeSignals: [
      /\b(i'm worried|i worry|concerned about|financial burden|debt|bills|money tight|money is tight|struggling|can't afford|leave debt|don't want to leave)\b/i,
    ],
    incompleteSignals: [],
    contradictionPairs: [],
    question: "Are you concerned about leaving any financial burdens behind for your family?",
  },

  // ── BENEFICIARY ─────────────────────────────────────────────────────────────
  {
    id: 'beneficiary_name',
    label: 'Beneficiary Name',
    category: 'beneficiary',
    basePriority: 90,
    urgency: 'critical',
    agentTriggers: ['beneficiary', 'who would you', 'leave the money', 'who do you want'],
    completeSignals: [
      /\b(my (wife|husband|daughter|son|sister|brother|mother|father|child|grandchild)) [A-Z][a-z]/i,
      /\bleave it (to|for) [A-Z]/i,
      /\b(goes to|benefits? goes? to|for) [A-Z][a-z]+ /i,
    ],
    incompleteSignals: [
      {
        pattern: /\b(my (wife|husband|daughter|son|sister|brother|mother|father|child|children|grandchild))\b/i,
        note: "Prospect mentioned a relationship but not the beneficiary's name.",
        followUpQuestion: "What is your [relationship]'s full name?",
      },
    ],
    contradictionPairs: [],
    question: "Who would you like to name as your beneficiary on this policy?",
  },
  {
    id: 'beneficiary_relationship',
    label: 'Beneficiary Relationship',
    category: 'beneficiary',
    basePriority: 85,
    urgency: 'high',
    agentTriggers: ['relationship', 'how are you related', 'is that your', 'who is'],
    completeSignals: [
      /\b(wife|husband|spouse|partner|daughter|son|sister|brother|mother|father|grandchild|niece|nephew|friend|cousin)\b/i,
    ],
    incompleteSignals: [],
    contradictionPairs: [],
    question: "What is your relationship to your beneficiary?",
  },
  {
    id: 'children',
    label: 'Children / Dependents',
    category: 'beneficiary',
    basePriority: 72,
    urgency: 'high',
    agentTriggers: ['children', 'kids', 'dependents', 'do you have any kid', 'do you have children'],
    completeSignals: [
      /\b(i have|i've got|i got) (no |[0-9]+|one|two|three|four|five|six|seven) (kid|kids|child|children|grandkid|grandchild)\b/i,
      /\bi don't have (any )?(kids|children)\b/i,
      /\bno (kids|children|grandchildren|dependents)\b/i,
    ],
    incompleteSignals: [],
    contradictionPairs: [],
    question: "Do you have any children or grandchildren you'd like to protect?",
  },

  // ── HEALTH ──────────────────────────────────────────────────────────────────
  {
    id: 'tobacco',
    label: 'Tobacco Use',
    category: 'health',
    basePriority: 88,
    urgency: 'critical',
    agentTriggers: ['tobacco', 'smoke', 'cigarettes', 'nicotine', 'vape', 'chew', 'dip'],
    completeSignals: [
      /\b(i smoke|i don't smoke|non.?smoker|i quit smoking|i quit (using|tobacco|smoking)|no tobacco|i vape|i chew|i use dip|i used to smoke|smoked for)\b/i,
    ],
    incompleteSignals: [
      {
        pattern: /\bi quit\b/i,
        note: "Prospect quit tobacco — ask when, as 12+ months tobacco-free may qualify for better rates.",
        followUpQuestion: "How long ago did you quit?",
      },
    ],
    contradictionPairs: [
      {
        a: /\bi don't smoke\b/i,
        b: /\b(i smoke|a pack|my cigarettes|smoke a)\b/i,
        description: "Prospect said they don't smoke but later mentioned smoking.",
      },
    ],
    question: "Do you currently use any tobacco or nicotine products?",
  },
  {
    id: 'medications',
    label: 'Current Medications',
    category: 'health',
    basePriority: 84,
    urgency: 'critical',
    agentTriggers: ['medication', 'medicine', 'prescription', 'taking any', 'what medications', 'any pills'],
    completeSignals: [
      /\b(i take|i'm on|i am on|no medications|no prescriptions|i don't take any|metformin|lisinopril|atorvastatin|blood pressure (medication|pill)|blood thinner|cholesterol|diabetes medication|warfarin|eliquis|xarelto)\b/i,
    ],
    incompleteSignals: [
      {
        pattern: /\bi take (some|a few|medication|medicine|pills|a pill)\b/i,
        note: "Prospect mentioned taking medication but didn't specify which ones.",
        followUpQuestion: "What medications are you currently taking and what are they for?",
      },
    ],
    contradictionPairs: [],
    question: "Are you currently taking any prescription medications?",
  },
  {
    id: 'hospitalizations',
    label: 'Recent Hospitalizations',
    category: 'health',
    basePriority: 80,
    urgency: 'high',
    agentTriggers: ['hospitalized', 'hospital', 'admitted', 'in the hospital', 'surgery', 'procedure', 'past (two|2) year'],
    completeSignals: [
      /\b(i was in the hospital|i haven't been (to the )?hospital|no hospitalizations|no hospital stays|i had surgery|i had a (heart attack|stroke|procedure)|no recent (hospital|surgery|procedure)|never been hospitalized)\b/i,
    ],
    incompleteSignals: [
      {
        pattern: /\bi was in the hospital\b/i,
        note: "Prospect mentioned a hospitalization but didn't give details.",
        followUpQuestion: "When were you hospitalized and what was it for?",
      },
    ],
    contradictionPairs: [],
    question: "Have you been hospitalized or had any major surgeries in the last 2 years?",
  },
  {
    id: 'doctors',
    label: 'Primary Care Doctor',
    category: 'health',
    basePriority: 55,
    urgency: 'normal',
    agentTriggers: ['doctor', 'physician', 'primary care', 'do you see a doctor', 'regular doctor'],
    completeSignals: [
      /\b(my doctor|dr\.|i see (a )?doctor|i don't have a doctor|no doctor|i don't see a doctor)\b/i,
    ],
    incompleteSignals: [],
    contradictionPairs: [],
    question: "Do you have a primary care doctor you see regularly?",
  },

  // ── FINANCIAL ───────────────────────────────────────────────────────────────
  {
    id: 'existing_coverage',
    label: 'Existing Coverage',
    category: 'financial',
    basePriority: 87,
    urgency: 'critical',
    agentTriggers: ['existing coverage', 'current insurance', 'already have', 'other policies', 'life insurance currently', 'any coverage'],
    completeSignals: [
      /\b(i have|i've got|i got) (a |some )?(life insurance|policy|coverage|burial insurance|final expense policy)\b/i,
      /\bi don't have (any )?(insurance|coverage|policy|life insurance)\b/i,
      /\bno (insurance|coverage|policy|life insurance)\b/i,
      /\bnot insured\b/i,
    ],
    incompleteSignals: [
      {
        pattern: /\bi (have|got) (insurance|a policy|coverage)\b/i,
        note: "Prospect said they have coverage but didn't specify type or benefit amount.",
        followUpQuestion: "What type of coverage is it, and do you know the benefit amount?",
      },
    ],
    contradictionPairs: [
      {
        a: /\bi don't have (any )?(insurance|coverage)\b/i,
        b: /\b(my|the) (policy|insurance|coverage) (is|was|has)\b/i,
        description: "Prospect said they have no insurance but later referred to 'my policy' or 'my insurance'.",
      },
    ],
    question: "Do you currently have any life insurance or burial coverage in place?",
  },
  {
    id: 'mortgage',
    label: 'Mortgage / Home Situation',
    category: 'financial',
    basePriority: 52,
    urgency: 'normal',
    agentTriggers: ['mortgage', 'rent', 'home', 'house payment', 'do you own', 'do you rent'],
    completeSignals: [
      /\b(i own|i rent|i have a mortgage|paying rent|pay a mortgage|my home is paid off|paid off|no mortgage|renting|homeowner)\b/i,
    ],
    incompleteSignals: [],
    contradictionPairs: [],
    question: "Do you own your home or are you renting?",
  },
  {
    id: 'budget',
    label: 'Monthly Budget',
    category: 'financial',
    basePriority: 83,
    urgency: 'critical',
    agentTriggers: ['budget', 'afford', 'comfortable paying', 'monthly payment', 'how much', 'what amount'],
    completeSignals: [
      /\$[0-9]+(\.[0-9]+)?/i,
      /\b[0-9]+ (dollar|a month|per month|monthly)\b/i,
      /\b(tight|very limited|fixed income|not much|maybe around|comfortable with (around|about))\b/i,
    ],
    incompleteSignals: [
      {
        pattern: /\bi can afford (something|a little|a bit|some)\b/i,
        note: "Prospect said they can afford something but didn't give a number.",
        followUpQuestion: "Would somewhere between $X and $Y feel comfortable for your monthly budget?",
      },
    ],
    contradictionPairs: [],
    question: "Is there a monthly amount you'd feel comfortable with for your premium?",
  },
  {
    id: 'monthly_income',
    label: 'Monthly Income / Benefits',
    category: 'financial',
    basePriority: 68,
    urgency: 'high',
    agentTriggers: ['income', 'social security', 'monthly income', 'how much do you bring', 'pension', 'retirement', 'disability'],
    completeSignals: [
      /\b(i get|i receive|i'm on|social security|ssi|ssdi|pension|retirement (income|check)|disability (check|income)|[0-9]+ a month|[0-9]+ per month)\b/i,
    ],
    incompleteSignals: [],
    contradictionPairs: [],
    question: "Are you on Social Security, or do you have other monthly income coming in?",
  },
  {
    id: 'emergency_fund',
    label: 'Savings / Emergency Fund',
    category: 'financial',
    basePriority: 42,
    urgency: 'normal',
    agentTriggers: ['savings', 'emergency fund', 'money set aside', 'reserve', 'rainy day'],
    completeSignals: [
      /\b(i have (some )?savings|i have (some )?money (set aside|saved)|i don't have (any )?savings|no savings|no emergency fund|i've got (some )?(money|savings))\b/i,
    ],
    incompleteSignals: [],
    contradictionPairs: [],
    question: "Do you have any savings set aside for end-of-life expenses?",
  },

  // ── LOGISTICS ───────────────────────────────────────────────────────────────
  {
    id: 'bank_account',
    label: 'Banking Institution',
    category: 'logistics',
    basePriority: 48,
    urgency: 'normal',
    agentTriggers: ['bank', 'do you bank', 'what bank', 'banking institution'],
    completeSignals: [
      /\b(i bank at|i use (chase|wells fargo|bank of america|regions|bb&t|truist|citizens|pnc|us bank|suntrust)|credit union|i have (a )?(checking|savings) (account|acct))\b/i,
    ],
    incompleteSignals: [],
    contradictionPairs: [],
    question: "Do you have a checking account we can set up the automatic draft from?",
  },
  {
    id: 'preferred_payment_date',
    label: 'Preferred Draft Date',
    category: 'logistics',
    basePriority: 45,
    urgency: 'normal',
    agentTriggers: ['draft date', 'payment date', 'what day', 'day of the month', 'when would you like'],
    completeSignals: [
      /\b(the (1st|2nd|3rd|[0-9]{1,2}th)|first of the month|when (my|the) (check|social security|payment|direct deposit) comes|start of the month|end of the month|[0-9]+(st|nd|rd|th) of (the|each) month)\b/i,
    ],
    incompleteSignals: [],
    contradictionPairs: [],
    question: "What day of the month works best for your premium to be drafted?",
  },
  {
    id: 'checking_account',
    label: 'Checking Account Verified',
    category: 'logistics',
    basePriority: 40,
    urgency: 'normal',
    agentTriggers: ['routing number', 'account number', 'void check', 'checking account number', 'bank information'],
    completeSignals: [
      /\b(routing (number|#)|account (number|#)|checking account (number|information|info|on hand)|void check)\b/i,
    ],
    incompleteSignals: [],
    contradictionPairs: [],
    question: "Do you have your checking account information available to set up your draft?",
  },
  {
    id: 'address_verification',
    label: 'Address Verification',
    category: 'logistics',
    basePriority: 38,
    urgency: 'normal',
    agentTriggers: ['address', 'zip code', 'street address', 'mailing address', 'what is your address', 'confirm your address'],
    completeSignals: [
      /\b[0-9]+ [A-Za-z]+ (street|st\.?|avenue|ave\.?|road|rd\.?|drive|dr\.?|lane|ln\.?|way|blvd\.?|boulevard|court|ct\.?|circle|place|pl\.?)\b/i,
    ],
    incompleteSignals: [],
    contradictionPairs: [],
    question: "Can you confirm your current mailing address for me?",
  },
  {
    id: 'dob_verification',
    label: 'Date of Birth Verified',
    category: 'logistics',
    basePriority: 36,
    urgency: 'normal',
    agentTriggers: ['date of birth', 'birthday', 'how old', 'when were you born', 'dob', 'birth date'],
    completeSignals: [
      /\b((january|february|march|april|may|june|july|august|september|october|november|december) [0-9]{1,2}(,? [0-9]{4})?)\b/i,
      /\b[0-9]{1,2}[\/-][0-9]{1,2}[\/-][0-9]{2,4}\b/i,
      /\bborn in (19|20)[0-9]{2}\b/i,
      /\bi('m| am) [0-9]{2} (years old|year old)\b/i,
    ],
    incompleteSignals: [],
    contradictionPairs: [],
    question: "Can you confirm your date of birth for me?",
  },
];

// ── Stage-specific priority boosts ────────────────────────────────────────────
// Items relevant to the current call stage get a temporary priority boost so
// the right question is surfaced at the right moment.
const STAGE_BOOSTS: Partial<Record<CallStage, Partial<Record<string, number>>>> = {
  introduction:      { reason_for_buying: 20, beneficiary_name: 5 },
  permission:        { reason_for_buying: 15, existing_coverage: 5 },
  discovery:         { reason_for_buying: 10, beneficiary_name: 15, beneficiary_relationship: 10, children: 8, existing_coverage: 10 },
  existing_coverage: { existing_coverage: 20, mortgage: 10 },
  health:            { tobacco: 25, medications: 20, hospitalizations: 18, doctors: 10 },
  budget:            { budget: 28, monthly_income: 18, financial_concerns: 12, emergency_fund: 5 },
  presentation:      { burial_wishes: 12, funeral_planning: 10, financial_concerns: 8 },
  objections:        { financial_concerns: 15, existing_coverage: 8 },
  close:             { bank_account: 25, preferred_payment_date: 22, checking_account: 18, address_verification: 12, dob_verification: 10 },
};

/** Returns items sorted by effective priority for the current call stage. */
export function sortedItemsByStage(stage: CallStage): DiscoveryItemDef[] {
  const boosts = STAGE_BOOSTS[stage] ?? {};
  return [...DISCOVERY_ITEMS].sort(
    (a, b) =>
      (b.basePriority + (boosts[b.id] ?? 0)) -
      (a.basePriority + (boosts[a.id] ?? 0)),
  );
}
