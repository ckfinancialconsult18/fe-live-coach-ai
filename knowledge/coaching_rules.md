# AI Coach Rules & Alert Logic

## Overview

This file defines the rules that govern what the AI coach alerts on, when it fires, what it recommends, and how it prioritizes competing signals. It is the source of truth for coaching behavior — changes here directly affect the real-time coaching engine.

---

## Alert Priority Hierarchy

When multiple conditions are detected simultaneously, the coach fires alerts in this order:

1. **CRITICAL** — Compliance violation detected (fires immediately, overrides all other alerts)
2. **HIGH** — Objection detected, prospect disengaging, or fatal mistake in progress
3. **MEDIUM** — Missed buying signal, stage transition opportunity, missing discovery item
4. **LOW** — Tonality suggestion, pacing note, question recommendation

---

## Stage Transition Rules

The coach monitors the transcript and fires a stage transition alert when certain linguistic patterns appear.

| Stage | Entry Trigger Phrases | Coach Alert |
|---|---|---|
| Introduction | Call start | Remind agent: state name, company, and purpose within 15 seconds |
| Permission | "Is now a good time?" / "Do you have a minute?" | None — agent should be asking this |
| Discovery | "Tell me about…" / "What made you…" / "Can I ask…" | Encourage open-ended questions if agent is telling instead of asking |
| Existing Coverage | "What company…" / "How much coverage…" / "AARP" / "Colonial Penn" | Surface replacement opportunity if existing coverage is low or overpriced |
| Health | "Do you have any…" / "Have you been diagnosed…" | Remind agent to capture tobacco status, medications, and hospitalizations |
| Budget | "How much…" / "What were you hoping to spend…" | Alert if agent reveals price before value is anchored |
| Presentation | "Let me show you…" / "Based on what you've shared…" | Confirm discovery is complete before agent moves to presentation |
| Objections | Objection keyword detected | Surface objection framework from objection_handbook.md |
| Close | "Go ahead and get this started…" / "If we could get started today…" | Remind agent to stop talking after closing question |

---

## Objection Detection Rules

The coach scans for the following patterns in prospect speech:

| Pattern | Classification | Alert Fired |
|---|---|---|
| "need to think" / "think about it" | Stall objection | Surface "Think About It" framework |
| "too expensive" / "can't afford" / "that's a lot" | Price objection | Surface "Too Expensive" framework + per-day breakdown |
| "already have" / "have coverage" / "have a policy" | Existing coverage objection | Surface replacement script |
| "call me back" / "not a good time" / "call later" | Avoidance | Surface same-call close urgency reminder |
| "need to ask" / "have to talk to" / "run it by" | Third-party objection | Surface three-way call offer |
| "not interested" | Early brush-off | Surface pattern interrupt + probe script |
| "I don't trust" / "I've been scammed" | Trust objection | Surface trust-building framework |
| "my son said" / "my daughter thinks" | Family influence objection | Surface family-influencer script |

---

## Buying Signal Detection Rules

The coach scans for positive signals in prospect speech:

| Pattern | Classification | Alert Fired |
|---|---|---|
| "I don't want to be a burden" | Strong buying signal | Alert: "Amplify this — tie it to the solution" |
| "how much would it be" | Price inquiry signal | Alert: "Anchor value before giving price" |
| "how does it work" | Interest signal | Alert: "Explain clearly, then trial close" |
| "my neighbor/friend passed" | Loss experience | Alert: "Ask how that affected the family financially" |
| "my kids would have to…" | Family burden signal | Alert: "Prospect is visualizing the problem — keep focus here" |
| "I've been meaning to" | Intention signal | Alert: "Validate + create mild urgency" |
| "that sounds good" / "that makes sense" | Positive response | Alert: "Trial close opportunity — ask a commitment question" |

---

## Compliance Alert Rules

The coach fires a CRITICAL compliance alert when:

| Trigger | Alert Text |
|---|---|
| Agent promises specific investment returns | "Stop — do not guarantee returns on life insurance. Correct immediately." |
| Agent implies policy covers medical bills | "Clarify — this is death benefit only, not health insurance." |
| Agent references a specific claim timeline not in the policy | "Stop — do not promise specific claim processing times without verifying the policy." |
| Agent uses guaranteed issue language for a non-GI product | "Correct — this product requires health qualification. Do not imply guaranteed acceptance." |
| Agent mentions a carrier's financial troubles or news | "Stop — avoid negative commentary about any carrier's financial standing." |
| Agent makes income promises tied to referrals | "Stop — do not promise compensation for referrals without proper disclosure." |

<!-- TODO: Add additional compliance rules based on state-specific requirements -->

---

## Coaching Cadence Rules

### When to Fire
- Minimum 3 transcript lines before first coaching alert (avoid firing before context is established)
- Maximum 1 alert per 30 seconds (avoid overwhelming the agent)
- Always wait for the prospect to finish speaking before firing an alert

### When NOT to Fire
- Agent is actively closing — do not interrupt with suggestions
- Prospect is telling a personal story — do not interrupt rapport-building
- Call is in the first 30 seconds (let the opening unfold)

---

## Discovery Completeness Checklist

The coach tracks whether the following items have been captured during the call. It alerts when approaching the presentation stage if items are missing.

| Item | Detection Pattern | Alert if Missing |
|---|---|---|
| Prospect age | "I'm [N]" / "[N] years old" | "Age not captured — ask before quoting" |
| Tobacco status | "I smoke" / "non-smoker" / "I quit" | "Tobacco status unknown — confirm before presenting rates" |
| Major health conditions | Health conditions mentioned | "No health conditions captured — ask before quoting" |
| Existing coverage | "I have" / "with AARP" / "through work" | "Existing coverage unknown — ask to identify replacement opportunity" |
| Coverage amount desired | "$X,XXX" / "ten thousand" | "Face amount preference unknown — ask before quoting" |
| Budget | "around $X" / "I pay about $X" | "Budget not established — anchor value before revealing price" |
| Beneficiary name | Beneficiary mentioned | "Beneficiary not captured — will need for application" |

---

## Score Calibration

The coach calculates a call score based on:

| Dimension | Weight | What It Measures |
|---|---|---|
| Discovery depth | 25% | # of qualifying questions asked; open vs. closed ratio |
| Emotional connection | 20% | # of emotional anchors used; prospect personal disclosure |
| Objection handling | 20% | # of objections resolved vs. left unaddressed |
| Close quality | 20% | Assumptive vs. timid close; silence after closing question |
| Compliance | 15% | Zero compliance violations = full score; each violation deducts points |

<!-- TODO: Add scoring algorithm details and thresholds for A/B/C/D grades -->

---

## Tuning Log

Track changes to coach rules here so the impact can be measured:

| Date | Change Made | Reason | Result |
|---|---|---|---|
| <!-- TODO --> | <!-- TODO --> | <!-- TODO --> | <!-- TODO --> |

---

> Last reviewed: <!-- TODO: insert date -->
> Owner: <!-- TODO: insert name -->
