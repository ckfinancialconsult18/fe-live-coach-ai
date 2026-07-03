// ── Static objection coaching library ────────────────────────────────────────
// Provides: labels, priority, mistakes to avoid, and closing bridges for all
// 25 supported objection types. These are FALLBACK defaults — the AI personalises
// each based on the actual transcript. Library data is shown immediately (no
// latency) while the AI response is still streaming.

export type ObjectionPriority = 'critical' | 'high' | 'medium' | 'low';

export interface ObjectionDef {
  type: string;
  label: string;
  priority: ObjectionPriority;
  mistakesToAvoid: string[];
  closingBridge: string;
  coachingNote: string; // shown when AI hasn't responded yet
}

export const OBJECTION_LIBRARY: ObjectionDef[] = [
  {
    type: 'too_expensive',
    label: 'Too Expensive',
    priority: 'critical',
    mistakesToAvoid: [
      "Don't justify the price or get defensive.",
      "Don't discount immediately — it destroys credibility.",
      "Don't say 'but it's really affordable' without a reference point.",
    ],
    closingBridge: "So for less than a dollar a day, doesn't that sound like a reasonable way to protect your family?",
    coachingNote: "Anchor to a daily cost. Tie the price to the emotional benefit already established.",
  },
  {
    type: 'need_to_think',
    label: 'Need to Think About It',
    priority: 'high',
    mistakesToAvoid: [
      "Don't ask 'what is there to think about?' — it's dismissive.",
      "Don't push hard immediately — let them feel heard.",
      "Don't leave without finding the real objection underneath.",
    ],
    closingBridge: "I completely understand — what piece of information would help you feel confident making a decision today?",
    coachingNote: "'Need to think' usually masks another objection. Ask what specifically they need to think about.",
  },
  {
    type: 'need_spouse',
    label: 'Need to Talk to Spouse',
    priority: 'high',
    mistakesToAvoid: [
      "Don't dismiss the spouse's role in the decision.",
      "Don't say 'you can decide this on your own' — it alienates them.",
      "Don't leave without asking if you can speak with the spouse now.",
    ],
    closingBridge: "That makes total sense — is your spouse available right now? I'd love to answer any questions for both of you.",
    coachingNote: "Respect the partner dynamic. Try to get the spouse on the call now — don't schedule a callback.",
  },
  {
    type: 'need_children',
    label: 'Need to Ask My Children',
    priority: 'high',
    mistakesToAvoid: [
      "Don't make them feel like they need permission to make their own decision.",
      "Don't skip asking what the children's specific concern might be.",
      "Don't leave without an email or date to follow up.",
    ],
    closingBridge: "I respect that — what would you want them to know about this coverage so they feel comfortable?",
    coachingNote: "Reframe: they're making the decision FOR their children, not needing approval FROM them.",
  },
  {
    type: 'already_insured',
    label: 'Already Have Insurance',
    priority: 'high',
    mistakesToAvoid: [
      "Don't immediately try to replace their policy — build a gap story instead.",
      "Don't assume their coverage is adequate without asking about the amount.",
      "Don't compete on price before establishing the gap.",
    ],
    closingBridge: "Is that coverage enough to fully handle final expenses — burial, medical bills, outstanding debt — without your family covering anything out of pocket?",
    coachingNote: "Discover the gap. Ask what type of coverage it is and how much the benefit is.",
  },
  {
    type: 'already_final_expense',
    label: 'Already Have Final Expense',
    priority: 'high',
    mistakesToAvoid: [
      "Don't immediately sell a replacement without understanding what they have.",
      "Don't challenge their existing policy without facts.",
    ],
    closingBridge: "That's great — is the benefit amount enough to cover everything at today's costs, or is there a gap we should fill?",
    coachingNote: "Ask about the carrier, benefit amount, and monthly cost. There's often an adequacy or rate gap.",
  },
  {
    type: 'dont_trust_insurance',
    label: "Don't Trust Insurance Companies",
    priority: 'critical',
    mistakesToAvoid: [
      "Don't get defensive about the insurance industry.",
      "Don't argue or lecture about regulations.",
      "Don't minimize their experience — validate it first.",
    ],
    closingBridge: "I hear you — and honestly I don't blame you. What would I need to show you to earn your trust?",
    coachingNote: "This is about credibility, not product. Build personal trust first. Ask about their past experience.",
  },
  {
    type: 'call_later',
    label: 'Call Me Later',
    priority: 'high',
    mistakesToAvoid: [
      "Don't just say 'OK, I'll call you back' — you'll never get through again.",
      "Don't end the call without a specific day and time commitment.",
      "Don't call back without asking what time actually works.",
    ],
    closingBridge: "Absolutely — what time works best for you today? I want to make sure I reach you.",
    coachingNote: "Get a specific time — today if possible. If they say 'next week,' try for 'tomorrow morning.'",
  },
  {
    type: 'not_interested',
    label: 'Not Interested',
    priority: 'critical',
    mistakesToAvoid: [
      "Don't argue or push harder — you'll lose the call permanently.",
      "Don't give up immediately either — ask one question first.",
      "Don't take it personally in your tone of voice.",
    ],
    closingBridge: "I completely respect that. Before I let you go — may I ask what specifically put you off, so I can do better next time?",
    coachingNote: "One soft question can reopen the conversation. 'What specifically' may reveal the real objection.",
  },
  {
    type: 'busy',
    label: 'Busy Right Now',
    priority: 'medium',
    mistakesToAvoid: [
      "Don't rush the call — that creates anxiety.",
      "Don't say 'this will only take a minute' — it feels pressured.",
    ],
    closingBridge: "No problem at all — when's a better time today? I can call you back in 30 minutes or at any time that works.",
    coachingNote: "Get a specific time today, not 'later this week.' Same-day callbacks have 3× higher completion rate.",
  },
  {
    type: 'send_information',
    label: 'Send Me Information',
    priority: 'high',
    mistakesToAvoid: [
      "Don't just say 'sure, I'll send something' — the mailer will go in the trash.",
      "Don't end the call thinking you've made progress — you haven't.",
      "Don't send generic brochures without a follow-up call scheduled.",
    ],
    closingBridge: "I can absolutely send something — what specific question do you want the information to answer for you?",
    coachingNote: "The 'send information' ask is usually a polite stall. Find out what question they need answered.",
  },
  {
    type: 'young_healthy',
    label: 'Healthy / Don\'t Need It',
    priority: 'high',
    mistakesToAvoid: [
      "Don't lecture them about health risks or mortality — it backfires.",
      "Don't say 'you never know' — it sounds like a scare tactic.",
      "Don't immediately pivot to health questions as a counter.",
    ],
    closingBridge: "That's actually the best news — because you're healthy now, you'd qualify for the very best rates. That locks in low premiums for life.",
    coachingNote: "Flip it: being healthy is exactly why NOW is the right time. Healthy = best rates = protect that health rating.",
  },
  {
    type: 'cant_afford_it',
    label: "Can't Afford It",
    priority: 'critical',
    mistakesToAvoid: [
      "Don't dismiss without understanding what they actually can afford.",
      "Don't offer lower coverage as a first move — find the budget first.",
      "Don't say 'well it's really cheap' without knowing their income situation.",
    ],
    closingBridge: "I understand. Let me show you the most affordable option we have — you might be surprised. What's the lowest monthly amount that would feel comfortable?",
    coachingNote: "Get a real number. Ask what they spend on coffee, cable, or other discretionary items to anchor a comparison.",
  },
  {
    type: 'have_savings',
    label: 'I Have Savings',
    priority: 'high',
    mistakesToAvoid: [
      "Don't challenge the amount of their savings directly.",
      "Don't imply their savings plan is wrong — redirect gently.",
    ],
    closingBridge: "That's great to have savings. Wouldn't it be even better to protect those savings and let insurance handle this, so your family keeps both?",
    coachingNote: "Reframe: savings are for living, not dying. Insurance preserves the savings for the family.",
  },
  {
    type: 'children_will_pay',
    label: 'My Children Will Pay',
    priority: 'high',
    mistakesToAvoid: [
      "Don't criticize their family plan directly.",
      "Don't skip asking about the children's financial situation.",
    ],
    closingBridge: "What if your children could keep that money instead — and you handled this yourself? That would be quite a gift to them.",
    coachingNote: "Appeal to the emotional desire not to burden the children. Reframe as giving the children a gift.",
  },
  {
    type: 'government_will_pay',
    label: 'Government Will Pay',
    priority: 'high',
    mistakesToAvoid: [
      "Don't lecture or be condescending about government benefits.",
      "Don't overwhelm with policy details — one specific number works better.",
    ],
    closingBridge: "The Social Security death benefit is only $255 — is that enough to cover what you have in mind for your service?",
    coachingNote: "Use the $255 Social Security death benefit as an anchor. One specific number is more persuasive than a general explanation.",
  },
  {
    type: 'social_security_covers_it',
    label: 'Social Security Will Cover It',
    priority: 'high',
    mistakesToAvoid: [
      "Don't get into a long policy explanation.",
      "Don't be condescending — many people genuinely believe this.",
    ],
    closingBridge: "Social Security pays a one-time death benefit of $255 — that's the full amount. Is that what you had in mind to cover your final expenses?",
    coachingNote: "Gently correct with the $255 fact. Then ask: 'Is that enough?' — the answer almost always opens the door.",
  },
  {
    type: 'medicare_covers_it',
    label: 'Medicare Covers It',
    priority: 'high',
    mistakesToAvoid: [
      "Don't confuse them with Part A/B/C/D distinctions right away.",
      "Don't argue — validate that Medicare does cover medical, then draw the line.",
    ],
    closingBridge: "Medicare covers medical costs — that's what it's designed for. Final expense and burial costs are a completely separate expense your family would pay out of pocket.",
    coachingNote: "Separate medical from final expense. Medicare = medical. Final expense = burial, headstone, funeral service.",
  },
  {
    type: 'funeral_prepaid',
    label: 'Funeral Already Planned',
    priority: 'medium',
    mistakesToAvoid: [
      "Don't assume the pre-plan is fully funded.",
      "Don't challenge it without knowing the details.",
    ],
    closingBridge: "That's wonderful planning — is everything fully paid for, or just arranged? There can often be a gap between the quoted price and what's actually covered.",
    coachingNote: "Many 'pre-arranged' funerals are not pre-PAID. Ask about funding — the gap is often $3,000–$8,000.",
  },
  {
    type: 'need_to_pray',
    label: 'Need to Pray About It',
    priority: 'medium',
    mistakesToAvoid: [
      "Don't challenge or minimize their faith — ever.",
      "Don't treat this as a delay tactic even if you think it might be.",
      "Don't skip asking for a follow-up time.",
    ],
    closingBridge: "Of course — I respect that completely. Would you feel comfortable finalizing this after your prayer time? I can call you back at a specific time you choose.",
    coachingNote: "Honor the faith element sincerely. Get a specific callback time. Connect the protection to their values: 'Providing for your family aligns with that.'",
  },
  {
    type: 'never_buy_phone',
    label: 'Never Buy Over the Phone',
    priority: 'critical',
    mistakesToAvoid: [
      "Don't argue that phone buying is safe — it won't help.",
      "Don't dismiss their concern or call it outdated.",
      "Don't pressure — this is a trust barrier, not a logic barrier.",
    ],
    closingBridge: "I completely understand — what if I emailed you the application to review at your own pace? You can still ask me any questions and we can go through it together.",
    coachingNote: "Offer a paper or email application as an alternative channel. The goal is to remove the phone barrier, not debate it.",
  },
  {
    type: 'no_banking_info',
    label: "Won't Provide Banking Information",
    priority: 'critical',
    mistakesToAvoid: [
      "Don't pressure them to provide it.",
      "Don't say 'it's completely safe' without explaining exactly what's protected.",
      "Don't skip explaining WHY you need it.",
    ],
    closingBridge: "That's a very fair concern. Let me explain exactly what we use the bank information for and how it's protected — and you can decide from there.",
    coachingNote: "Explain: bank draft is used ONLY for the monthly premium. No other access. Offer to send the policy first before any draft begins.",
  },
  {
    type: 'no_monthly_payments',
    label: "Don't Want Monthly Payments",
    priority: 'high',
    mistakesToAvoid: [
      "Don't just lower the monthly amount without addressing the objection.",
      "Don't ignore this — it may indicate a cash-flow concern.",
    ],
    closingBridge: "Would you prefer annual or semi-annual billing instead? Some people find that easier to budget for.",
    coachingNote: "Offer annual or semi-annual billing. Also explore if this is really a bank draft concern vs. a payment frequency concern.",
  },
  {
    type: 'generic_brushoff',
    label: 'Generic Brush-Off',
    priority: 'medium',
    mistakesToAvoid: [
      "Don't accept the brush-off at face value — it almost always covers something else.",
      "Don't apologize and hang up immediately.",
    ],
    closingBridge: "I completely understand. Before I let you go — may I ask one quick question about what concerned you most?",
    coachingNote: "Ask what's behind it. A single open question often reveals the real objection underneath.",
  },
  {
    type: 'other_objection',
    label: 'Other Objection',
    priority: 'medium',
    mistakesToAvoid: [
      "Don't skip clarifying what the objection actually is.",
      "Don't address the wrong objection.",
    ],
    closingBridge: "I want to make sure I understand your concern — can you help me understand exactly what's holding you back?",
    coachingNote: "Clarify the objection before responding. Addressing the wrong concern is worse than no response at all.",
  },
];

const LIBRARY_BY_TYPE = new Map(OBJECTION_LIBRARY.map(d => [d.type, d]));

export function getObjectionDef(type: string): ObjectionDef {
  return LIBRARY_BY_TYPE.get(type) ?? {
    type,
    label: type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    priority: 'medium',
    mistakesToAvoid: [],
    closingBridge: '',
    coachingNote: '',
  };
}

export const OBJECTION_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  OBJECTION_LIBRARY.map(d => [d.type, d.label]),
);
