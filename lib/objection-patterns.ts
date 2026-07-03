// ── Objection combination pattern detection ───────────────────────────────────
// When multiple objections are active simultaneously, certain combinations
// signal a specific underlying dynamic that requires a stronger coaching approach.

export interface ObjectionPattern {
  label: string;
  types: string[];           // all types in this set must be present to match
  insight: string;
  strongerApproach: string;
}

const PATTERNS: ObjectionPattern[] = [
  {
    label: 'Price-Stall Combination',
    types: ['need_to_think', 'too_expensive'],
    insight: "The prospect is stalling because they're worried about cost. 'I need to think' is covering a price objection — the real concern is money.",
    strongerApproach: "Address the cost objection directly first. Anchor to a daily cost, tie it to the emotional outcome, then re-ask for the decision.",
  },
  {
    label: 'Price-Stall Combination',
    types: ['need_to_think', 'cant_afford_it'],
    insight: "Prospect has a real budget concern masked as 'needing to think.' They may feel embarrassed admitting affordability is the issue.",
    strongerApproach: "Normalize the budget concern: 'A lot of people I speak with are on a fixed income. Let me show you the most affordable option first.'",
  },
  {
    label: 'Family-Stall Combination',
    types: ['need_to_think', 'need_spouse'],
    insight: "Prospect is using both objections together — this usually means they want to make the decision but feel they need permission or cover from their spouse.",
    strongerApproach: "Try to get the spouse on the call immediately. If not available, ask: 'What would your spouse's main question be?' and answer it now.",
  },
  {
    label: 'Family-Stall Combination',
    types: ['need_to_think', 'need_children'],
    insight: "Prospect feels they need their children's approval. This often indicates insecurity about the decision or a habit of deferring.",
    strongerApproach: "Reframe: 'You're making this decision FOR your children, so they don't have to worry. You're protecting them.' Empower the decision.",
  },
  {
    label: 'Coverage-Price Overlap',
    types: ['already_insured', 'too_expensive'],
    insight: "Prospect has existing coverage but is price-sensitive. They may be comparing your premium to their current policy without understanding the difference in benefit.",
    strongerApproach: "Ask about their existing benefit amount. Compare cost-per-thousand of coverage. Show the gap — then price becomes context, not barrier.",
  },
  {
    label: 'Coverage-Price Overlap',
    types: ['already_final_expense', 'too_expensive'],
    insight: "Prospect has final expense coverage but is balking at adding more cost. This often means the existing coverage is inadequate but they don't know it.",
    strongerApproach: "Find out the existing benefit amount and current premium. If they're paying more per thousand than your offer, the price objection resolves itself.",
  },
  {
    label: 'Government Benefits Confusion',
    types: ['government_will_pay', 'medicare_covers_it'],
    insight: "Prospect genuinely believes government benefits will cover final expenses. Both Social Security and Medicare come up — a common misconception among seniors.",
    strongerApproach: "Use the $255 Social Security death benefit as your anchor: 'The government pays $255 one time — the rest falls to your family. Is that what you had in mind?'",
  },
  {
    label: 'Government Benefits Confusion',
    types: ['government_will_pay', 'social_security_covers_it'],
    insight: "Prospect is confusing Social Security income with a death benefit. They believe their SS benefits will continue or pay for burial.",
    strongerApproach: "Clarify gently: 'Social Security stops the month you pass. There's only a one-time $255 payment. The funeral home will still need to be paid in full.'",
  },
  {
    label: 'Self-Insured Belief',
    types: ['have_savings', 'young_healthy'],
    insight: "Prospect believes they are both healthy enough and financially capable of self-insuring. This combination is particularly resistant to standard objection handling.",
    strongerApproach: "Acknowledge both points, then ask: 'If you stay healthy and financially secure, you may never need this — but the people who need it most are the ones who didn't plan for the unexpected. What if either of those things changed?'",
  },
  {
    label: 'Trust Barrier',
    types: ['dont_trust_insurance', 'never_buy_phone'],
    insight: "Multiple trust barriers active simultaneously. Prospect has deep skepticism about both the industry and the sales channel. This requires patience and credibility-building, not script-following.",
    strongerApproach: "Slow down completely. Ask about their specific past experience with insurance. Validate it. Offer to send written materials. Do not push for a close on this call — build trust first.",
  },
  {
    label: 'Information Delay Stack',
    types: ['send_information', 'call_later'],
    insight: "Double delay tactic — prospect wants to receive information AND schedule a future call. Both together suggest they want to exit the conversation politely.",
    strongerApproach: "Name it gently: 'I want to respect your time — if there's something specific that has you uncertain, I'd rather solve that now than put you through another call. What's the real question?'",
  },
  {
    label: 'Faith and Family Stall',
    types: ['need_to_pray', 'need_spouse'],
    insight: "Prospect is using both faith and family consultation as reasons to defer. This is often genuine — they make major decisions communally and spiritually.",
    strongerApproach: "Honor both. Ask: 'When do you usually pray together? Could we schedule a call right after that time so you can share your thoughts then?' Respect the process — don't shortcut it.",
  },
];

/** Returns all pattern matches for the given set of active objection types. */
export function detectPatterns(activeTypes: string[]): ObjectionPattern[] {
  if (activeTypes.length < 2) return [];
  const typeSet = new Set(activeTypes);
  return PATTERNS.filter(p => p.types.every(t => typeSet.has(t)));
}
