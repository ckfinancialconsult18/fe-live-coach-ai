export function buildLearnPrompt(transcript: string, knowledgeIndex: string, today: string): string {
  return `You are an expert final expense sales trainer and AI analyst. Your job is to analyze a sales call transcript and extract structured knowledge that can improve future coaching.

TODAY'S DATE: ${today}

---
## EXISTING KNOWLEDGE INDEX (headings only — used to detect duplicates)
${knowledgeIndex}
---

## TRANSCRIPT TO ANALYZE
${transcript}
---

## YOUR TASK

Analyze the transcript above and return a single JSON object (no markdown fences, raw JSON only) with this exact shape:

{
  "callSummary": "2–3 sentence summary of what happened on this call",
  "callScore": 0-100,
  "callOutcome": "policy_written | follow_up | not_interested | unknown",

  "extractedInsights": {
    "objections": [
      {
        "text": "exact quote from prospect",
        "type": "price | think_about_it | existing_coverage | call_later | spouse | not_interested | trust | family_influence | other",
        "agentResponse": "exact or paraphrased agent reply",
        "wasSuccessful": true | false,
        "whyItWorked": "brief explanation if successful",
        "whyItFailed": "brief explanation if not successful"
      }
    ],
    "buyingSignals": [
      {
        "text": "exact quote from prospect",
        "strength": "strong | medium | weak",
        "context": "brief description of what preceded this signal",
        "agentResponse": "how agent responded",
        "responseWasOptimal": true | false
      }
    ],
    "emotionalTriggers": [
      {
        "trigger": "label for the trigger (e.g. fear of burdening family)",
        "evidence": "exact quote or paraphrase from transcript",
        "howAgentUsedIt": "description of how agent responded",
        "wasEffective": true | false
      }
    ],
    "medications": [
      {
        "name": "generic name",
        "brandName": "brand name if mentioned",
        "indicates": "condition it suggests",
        "underwritingNote": "implications for FE underwriting",
        "mentionedInTranscript": "exact quote"
      }
    ],
    "healthConditions": [
      {
        "condition": "condition name",
        "details": "as described by prospect",
        "underwritingImpact": "how this affects carrier selection",
        "carriersSuggested": ["list of carriers that may work"]
      }
    ],
    "underwritingProfile": {
      "age": "if mentioned",
      "gender": "if determinable",
      "tobacco": "yes | no | unknown",
      "conditions": ["list of conditions mentioned"],
      "medications": ["list of medications mentioned"],
      "mobility": "any mobility aids mentioned",
      "hospitalizations": "any recent hospitalizations mentioned"
    },
    "carrierDiscussions": [
      {
        "carrier": "carrier name",
        "context": "why it was discussed",
        "prospectReaction": "how prospect responded"
      }
    ],
    "successfulRebuttals": [
      {
        "objection": "what prospect said",
        "rebuttal": "what agent said (exact or close paraphrase)",
        "result": "how prospect responded after",
        "techniqueUsed": "name of the technique (e.g. Feel/Felt/Found, Pattern Interrupt)"
      }
    ],
    "unsuccessfulRebuttals": [
      {
        "objection": "what prospect said",
        "rebuttal": "what agent said",
        "result": "how it failed",
        "betterApproach": "what should have been said instead"
      }
    ],
    "closingTechniques": [
      {
        "technique": "technique name",
        "script": "exact or paraphrased closing language used",
        "result": "prospect's response",
        "wasSuccessful": true | false
      }
    ],
    "complianceConcerns": [
      {
        "concern": "description of the concern",
        "severity": "high | medium | low",
        "quote": "the problematic statement from the transcript",
        "correction": "what should have been said instead"
      }
    ],
    "personalityType": {
      "type": "Protector | Skeptic | Decisive | Agreeable | Mixed",
      "blend": "if Mixed, describe the blend",
      "evidence": ["list of quotes or behaviors that indicate this type"],
      "adaptationNotes": "how agent should have adapted (or did adapt well)"
    }
  },

  "newKnowledge": [
    {
      "targetFile": "objections | buying_signals | medications | underwriting | carrier_rules | closing_scripts | compliance | personality_profiles | sales_psychology | coaching_rules",
      "section": "the section heading in that file where this belongs",
      "isNew": true | false,
      "confidence": 0-100,
      "summary": "one-line description of what's new",
      "markdownEntry": "the full formatted markdown block to append — use the entry format below"
    }
  ],

  "report": {
    "filesUpdated": ["list of file keys that will be updated"],
    "newObjections": ["list of new objection types or variants discovered"],
    "newMedications": ["list of new medications identified"],
    "newTechniques": ["list of new sales techniques or script variants"],
    "newBuyingSignals": ["list of new buying signal patterns"],
    "complianceFlags": ["list of compliance issues found"],
    "overallImprovements": ["list of 3–5 specific improvements this call adds to the coaching engine"],
    "coachingImprovementScore": 0-100
  }
}

## ENTRY FORMAT FOR markdownEntry

Every entry you write into markdownEntry must follow this format:

---
**Learned:** ${today} | **Source:** Call Transcript | **Confidence:** [N]%

**Summary:** [one-line description]

**Transcript Evidence:**
> [relevant quote or exchange from the call]

**Coaching Note:** [actionable lesson for future calls]

---

## DEDUPLICATION RULES

- If a medication, objection, technique, or signal is already represented in the knowledge index (even partially), set isNew to false and do NOT include it in newKnowledge.
- Only include items where isNew is true in the newKnowledge array.
- A minor variation of an existing script is NOT new — only genuinely novel patterns count.
- If complianceConcerns is empty, return an empty array [].
- Always include at least the personalityType insight as a newKnowledge entry (these are always call-specific).

## OUTPUT RULES

- Return ONLY raw JSON — no explanation, no markdown fences, no preamble.
- All string values must be properly escaped for JSON.
- Confidence scores must be integers 0–100.
- If a field is unknown or not mentioned in the transcript, use null or [].
`;
}
