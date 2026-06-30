export function buildExtractionPrompt(
  transcript: string,
  knowledgeIndex: string,
  today: string,
  jobId: string
): string {
  return `You are an expert final expense sales trainer and AI analyst. Extract every learnable insight from the transcript below. Be thorough — this data directly improves live coaching for future calls.

TODAY: ${today}
JOB_ID: ${jobId}

---
EXISTING KNOWLEDGE INDEX (headings only — for deduplication):
${knowledgeIndex}
---

TRANSCRIPT:
${transcript}
---

Return ONLY a raw JSON object with this exact structure (no markdown fences, no commentary):

{
  "callSummary": "2-3 sentence summary of what happened",
  "callType": "sales | coaching | training | unknown",
  "callOutcome": "policy_written | follow_up | not_interested | unknown",
  "callScore": 0-100,
  "insights": [
    {
      "type": "objection | rebuttal_successful | rebuttal_failed | buying_signal | emotional_trigger | medication | diagnosis | underwriting | carrier | compliance | closing_technique | successful_close | failed_close | discovery_question | sales_psychology | personality | financial_concern | family_dynamic | funeral_concern | coaching_opportunity | agent_mistake | agent_strength | memorable_phrase",
      "targetFile": "objection_handbook | carrier_rules | underwriting | medications | winning_calls | losing_calls | sales_psychology | coaching_rules | buying_signals | closing_scripts | personality_profiles | discovery_questions",
      "section": "exact section heading in that file where this belongs",
      "summary": "one-line description",
      "content": "detailed explanation of what was learned",
      "evidence": "exact quote or close paraphrase from the transcript",
      "confidence": 0-100,
      "tags": ["tag1", "tag2"],
      "isNew": true,
      "markdownEntry": "---\\n**Learned:** ${today} | **Source:** Job ${jobId} | **Confidence:** [N]%\\n\\n**Summary:** [summary]\\n\\n**Evidence:**\\n> [evidence]\\n\\n**Coaching Note:** [actionable lesson]\\n\\n---"
    }
  ]
}

EXTRACTION RULES:

1. Extract ALL of the following categories if present:
   - Objections: every objection the prospect raised, verbatim
   - Successful rebuttals: any objection handling that moved the conversation forward
   - Failed rebuttals: objection handling that did NOT work — include a "better approach" in the coaching note
   - Buying signals: any signal that the prospect was interested or ready to buy
   - Emotional triggers: fears, motivations, or emotional moments (burden on family, loss experience, etc.)
   - Medications: any medication mentioned — include generic name, brand, what it indicates, UW note
   - Diagnoses: any health condition — include UW impact and carrier recommendations
   - Underwriting: age, tobacco status, build, conditions, hospitalizations
   - Carrier discussions: any carrier mentioned by agent or prospect
   - Compliance concerns: anything the agent said that could be a compliance issue
   - Closing techniques: any close attempted — note if it worked
   - Successful closes: full closing sequence that resulted in agreement
   - Failed closes: close attempts that were deflected
   - Discovery questions: any question the agent asked to surface need
   - Sales psychology: influence techniques, emotional framing, silence usage
   - Personality type: classification with evidence
   - Financial concerns: anything the prospect said about cost, income, or affordability
   - Family dynamics: family members mentioned, their role in the decision
   - Funeral concerns: any reference to funeral cost or planning
   - Coaching opportunities: moments where better technique would have changed the outcome
   - Agent mistakes: specific errors with "what should have been done" in coaching note
   - Agent strengths: things the agent did particularly well
   - Memorable phrases: any phrase that was remarkably effective or ineffective

2. DEDUPLICATION: If an insight is substantially covered by the existing knowledge index, set "isNew": false and EXCLUDE it from the insights array entirely. Only include genuinely new or meaningfully different patterns.

3. CONFIDENCE SCORING:
   - 90-100: Verbatim quote, clear outcome, unambiguous
   - 70-89: Strong evidence, outcome reasonably clear
   - 50-69: Inferred from context, outcome uncertain
   - Below 50: Do not include

4. TARGET FILE MAPPING:
   - objections, rebuttal_* → objection_handbook
   - buying_signal → buying_signals
   - emotional_trigger, sales_psychology, personality → sales_psychology or personality_profiles
   - medication → medications
   - diagnosis, underwriting → underwriting
   - carrier → carrier_rules
   - compliance → coaching_rules
   - closing_technique, successful_close, failed_close → closing_scripts
   - discovery_question → discovery_questions
   - agent_mistake, coaching_opportunity → coaching_rules
   - agent_strength, successful_close (full call) → winning_calls
   - failed_close, agent_mistake (whole call) → losing_calls
   - memorable_phrase → sales_psychology

5. MARKDOWN ENTRY FORMAT: Every markdownEntry must include date, job ID, confidence, summary, verbatim evidence, and one actionable coaching note. Escape all quotes in JSON.

6. Return an empty insights array [] if no new knowledge is found — never invent or hallucinate.

7. Maximum 40 insights per call. Prioritize highest-confidence and most novel findings.`;
}
