import { NextRequest, NextResponse } from 'next/server';
import { readAllKnowledge, appendToKnowledgeFile, compactIndex } from '@/lib/knowledge-reader';
import type { KnowledgeKey } from '@/lib/knowledge-reader';
import { buildLearnPrompt } from '@/lib/learn-prompts';
import { getOpenAI } from '@/lib/openai';

export const runtime = 'nodejs';

const FILE_KEY_MAP: Record<string, KnowledgeKey> = {
  objections:           'objections',
  buying_signals:       'buying_signals',
  medications:          'medications',
  underwriting:         'underwriting',
  carrier_rules:        'carrier_rules',
  closing_scripts:      'closing_scripts',
  compliance:           'compliance',
  personality_profiles: 'personality_profiles',
  sales_psychology:     'sales_psychology',
  coaching_rules:       'coaching_rules',
};

export async function POST(req: NextRequest) {
  try {
    const { transcript, sourceCall } = await req.json() as { transcript: string; sourceCall?: string };

    if (!transcript?.trim()) {
      return NextResponse.json({ error: 'transcript is required' }, { status: 400 });
    }

    // 1. Read all knowledge files
    const knowledge = await readAllKnowledge();
    const index = compactIndex(knowledge);

    const today = new Date().toISOString().split('T')[0];
    const prompt = buildLearnPrompt(transcript.trim(), index, today);

    // 2. Analyze with GPT-4o
    let analysisRaw: string;
    const hasKey = !!(process.env.OPENAI_API_KEY);

    if (hasKey) {
      const openai = getOpenAI();
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        max_tokens: 4096,
      });
      analysisRaw = completion.choices[0]?.message?.content ?? '';
    } else {
      analysisRaw = buildDemoAnalysis(today);
    }

    // 3. Parse response
    let analysis: AnalysisResult;
    try {
      analysis = JSON.parse(analysisRaw.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim());
    } catch {
      return NextResponse.json({ error: 'Failed to parse AI analysis', raw: analysisRaw }, { status: 500 });
    }

    // 4. Write new knowledge entries to files
    const writtenFiles: string[] = [];
    const newItems = (analysis.newKnowledge ?? []).filter((item) => item.isNew && item.markdownEntry);

    for (const item of newItems) {
      const fileKey = FILE_KEY_MAP[item.targetFile];
      if (!fileKey) continue;

      const entry = item.markdownEntry.includes('Source:')
        ? item.markdownEntry
        : `---\n**Learned:** ${today} | **Source:** ${sourceCall ?? 'Call Transcript'} | **Confidence:** ${item.confidence}%\n\n**Summary:** ${item.summary}\n\n${item.markdownEntry}\n---`;

      await appendToKnowledgeFile(fileKey, entry);
      if (!writtenFiles.includes(item.targetFile)) writtenFiles.push(item.targetFile);
    }

    // 5. Build response
    return NextResponse.json({
      success: true,
      callSummary: analysis.callSummary,
      callScore: analysis.callScore,
      callOutcome: analysis.callOutcome,
      extractedInsights: analysis.extractedInsights,
      report: {
        ...analysis.report,
        filesUpdated: writtenFiles,
        entriesWritten: newItems.length,
      },
      newKnowledge: newItems,
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface NewKnowledgeItem {
  targetFile: string;
  section: string;
  isNew: boolean;
  confidence: number;
  summary: string;
  markdownEntry: string;
}

interface AnalysisResult {
  callSummary: string;
  callScore: number;
  callOutcome: string;
  extractedInsights: Record<string, unknown>;
  newKnowledge: NewKnowledgeItem[];
  report: {
    filesUpdated: string[];
    newObjections: string[];
    newMedications: string[];
    newTechniques: string[];
    newBuyingSignals: string[];
    complianceFlags: string[];
    overallImprovements: string[];
    coachingImprovementScore: number;
  };
}

// ── Demo analysis (no API key) ────────────────────────────────────────────────

function buildDemoAnalysis(today: string): string {
  return JSON.stringify({
    callSummary: 'Agent spoke with Dorothy, a 68-year-old diabetic prospect who has $5,000 of AARP coverage and is concerned about funeral costs after a neighbor passed. The call ended with a stall objection — "I need to think about it."',
    callScore: 62,
    callOutcome: 'follow_up',
    extractedInsights: {
      objections: [
        {
          text: "I'd like to think about that. Can I call you back?",
          type: 'think_about_it',
          agentResponse: 'No response captured — call ended.',
          wasSuccessful: false,
          whyItFailed: 'Agent did not attempt to handle the stall objection or schedule a firm callback.',
        },
      ],
      buyingSignals: [
        {
          text: "I don't want to leave that burden on my kids.",
          strength: 'strong',
          context: 'Prospect shared that her neighbor\'s funeral cost over $12,000.',
          agentResponse: 'Agent acknowledged but did not pivot to a trial close.',
          responseWasOptimal: false,
        },
        {
          text: 'That sounds almost too good to be true.',
          strength: 'medium',
          context: 'Agent presented a $25–30/month quote for $10K coverage.',
          agentResponse: 'Agent explained the pricing rationale.',
          responseWasOptimal: true,
        },
      ],
      emotionalTriggers: [
        {
          trigger: 'Fear of burdening family',
          evidence: "I don't want to leave that burden on my kids.",
          howAgentUsedIt: 'Acknowledged but moved on too quickly — did not amplify or anchor to close.',
          wasEffective: false,
        },
        {
          trigger: 'Loss experience (neighbor passed)',
          evidence: 'My neighbor just passed and it cost over twelve thousand dollars.',
          howAgentUsedIt: 'Agent used this to contextualize the coverage amount.',
          wasEffective: true,
        },
      ],
      medications: [
        {
          name: 'Metformin',
          brandName: 'Glucophage',
          indicates: 'Type 2 Diabetes (oral management)',
          underwritingNote: 'Oral-only diabetic management — Americo Eagle very favorable. Most carriers accept.',
          mentionedInTranscript: 'I have type 2 diabetes, been managing it for about ten years with Metformin.',
        },
      ],
      healthConditions: [
        {
          condition: 'Type 2 Diabetes',
          details: 'Diagnosed ~10 years ago, managed with Metformin only, no insulin.',
          underwritingImpact: 'Level benefit available at most carriers. Best rate at Americo Eagle.',
          carriersSuggested: ['Americo Eagle', 'Mutual of Omaha'],
        },
      ],
      underwritingProfile: {
        age: '68',
        gender: 'female',
        tobacco: 'no',
        conditions: ['Type 2 Diabetes (oral-controlled)'],
        medications: ['Metformin'],
        mobility: null,
        hospitalizations: null,
      },
      carrierDiscussions: [],
      successfulRebuttals: [],
      unsuccessfulRebuttals: [
        {
          objection: "I'd like to think about that. Can I call you back?",
          rebuttal: 'Agent did not address this objection.',
          result: 'Call ended without a close or firm callback time.',
          betterApproach: 'Use the "What Specifically?" probe: "Of course — can I ask what part you\'d like to think about? Is it the price, the coverage, or something else?" Then handle the real objection.',
        },
      ],
      closingTechniques: [],
      complianceConcerns: [],
      personalityType: {
        type: 'Protector',
        blend: null,
        evidence: [
          "I don't want to leave that burden on my kids.",
          'Volunteered information about grandkids and neighbor.',
          'Primary concern was family — not price.',
        ],
        adaptationNotes: 'Classic Protector. Agent should have anchored heavily on the family burden and used the emotional close. Moved to price too quickly.',
      },
    },
    newKnowledge: [
      {
        targetFile: 'medications',
        section: 'Diabetes Medications',
        isNew: true,
        confidence: 97,
        summary: 'Metformin confirmed as oral-only T2D management — favorable underwriting signal',
        markdownEntry: `---\n**Learned:** ${today} | **Source:** Demo Call (Dorothy) | **Confidence:** 97%\n\n**Summary:** Metformin (oral-only) Type 2 Diabetes — confirmed level benefit eligibility at Americo Eagle and Mutual of Omaha.\n\n**Transcript Evidence:**\n> PROSPECT: "I have type 2 diabetes, been managing it for about ten years with Metformin."\n\n**Coaching Note:** When a prospect says Metformin with no mention of insulin, immediately flag Americo Eagle as primary carrier. This is one of the most favorable diabetic profiles in the market.\n\n---`,
      },
      {
        targetFile: 'buying_signals',
        section: 'Strong Signals',
        isNew: true,
        confidence: 95,
        summary: "Neighbor's funeral cost story triggers strong buying signal — agent missed the close",
        markdownEntry: `---\n**Learned:** ${today} | **Source:** Demo Call (Dorothy) | **Confidence:** 95%\n\n**Summary:** When a prospect volunteers a story about a neighbor or family member's recent death and funeral cost, it is a strong buying signal — not a conversation topic. Close immediately.\n\n**Transcript Evidence:**\n> PROSPECT: "My neighbor just passed and it cost over twelve thousand dollars. I don't want to leave that burden on my kids."\n\n**Coaching Note:** This is a two-signal sequence: loss experience + burden fear. The optimal response is NOT to explain the policy — it is to trial close: "That's exactly what this plan protects against. If I could show you $15,000 in coverage for less than you're currently paying, would you want to get that in place today?"\n\n---`,
      },
      {
        targetFile: 'personality_profiles',
        section: 'Profile 1: The Protector',
        isNew: true,
        confidence: 88,
        summary: 'Annotated Protector example: family-first, stall objection, missed emotional close',
        markdownEntry: `---\n**Learned:** ${today} | **Source:** Demo Call (Dorothy) | **Confidence:** 88%\n\n**Summary:** Dorothy (68F, diabetic, AARP policyholder) is a textbook Protector. Volunteered family concerns unprompted. Primary driver: not burdening kids. Agent moved to price too quickly — should have stayed in the emotional layer longer before presenting.\n\n**Transcript Evidence:**\n> PROSPECT: "I don't want to leave that burden on my kids."\n> AGENT: [moved to price quote immediately]\n\n**Coaching Note:** With a Protector, never leave the emotional layer until they have verbally confirmed their family concern. Ask: "How would it feel knowing your kids never had to worry about this?" Get the answer, THEN present the solution.\n\n---`,
      },
      {
        targetFile: 'closing_scripts',
        section: 'Close Failure Recovery',
        isNew: true,
        confidence: 90,
        summary: '"Think about it" stall — missed opportunity to probe and recover on this call',
        markdownEntry: `---\n**Learned:** ${today} | **Source:** Demo Call (Dorothy) | **Confidence:** 90%\n\n**Summary:** When a Protector-type prospect says "I'd like to think about it" after a strong buying signal sequence, the agent must probe immediately — not accept the callback offer.\n\n**Transcript Evidence:**\n> PROSPECT: "I'd like to think about that. Can I call you back?"\n> AGENT: [no recovery attempt]\n\n**Coaching Note:** Optimal recovery: "Of course — before we hang up, can I ask what specifically you'd like to think about? Is it the price, or something about the coverage itself?" If it's price: run the per-day breakdown. If it's something else: handle it. Never accept a raw callback from a Protector who just said they don't want to burden their kids.\n\n---`,
      },
    ],
    report: {
      filesUpdated: [],
      newObjections: [],
      newMedications: ['Metformin (oral-only T2D) — confirmed favorable underwriting signal'],
      newTechniques: ['Stall objection recovery after buying signal sequence'],
      newBuyingSignals: ["Neighbor's funeral cost story as double-signal (loss + burden fear)"],
      complianceFlags: [],
      overallImprovements: [
        'Added Metformin confirmation to medications.md with carrier guidance',
        'Added neighbor funeral story as documented double buying signal pattern to buying_signals.md',
        'Added annotated Protector profile example to personality_profiles.md',
        'Added stall recovery script for Protector-type to closing_scripts.md',
      ],
      coachingImprovementScore: 74,
    },
  });
}
