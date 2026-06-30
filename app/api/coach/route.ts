import { NextRequest, NextResponse } from 'next/server';
import { openai } from '@/lib/openai';
import { COACH_SYSTEM_PROMPT, UNDERWRITING_EXTRACT_PROMPT, STAGE_DETECTION_PROMPT } from '@/lib/coach-prompts';
import { requireUser } from '@/lib/api/guard';
import { retrieveRelevantChunks, formatChunksForPrompt } from '@/lib/rag/retrieve';

export async function POST(req: NextRequest) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;

  const { transcript, fullLength } = await req.json() as { transcript: string; fullLength: number };

  if (!transcript) return NextResponse.json({ error: 'No transcript' }, { status: 400 });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    // Return demo coaching data when no API key
    return NextResponse.json(getDemoInsight(fullLength));
  }

  // RAG: ground coaching in the agent's own carrier guides, scripts, objection
  // handling, and compliance docs instead of relying purely on model memory.
  // Best-effort — never blocks coaching if retrieval fails or finds nothing.
  const lastTurns = transcript.split('\n').slice(-6).join('\n');
  const retrievedChunks = await retrieveRelevantChunks(supabase, user.id, lastTurns, { matchCount: 4, minSimilarity: 0.45 }).catch(() => []);
  const ragContext = formatChunksForPrompt(retrievedChunks);

  try {
    const [coachRes, underwritingRes, stageRes] = await Promise.all([
      // Coach insight
      openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: COACH_SYSTEM_PROMPT },
          ...(ragContext
            ? [{ role: 'system' as const, content: `Relevant material from this agent's own carrier guides, scripts, and objection-handling docs — prefer this over general knowledge when it applies:\n\n${ragContext}` }]
            : []),
          { role: 'user', content: `Current conversation:\n\n${transcript}\n\nAnalyze this and respond in the exact JSON format specified.` },
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' },
      }),

      // Underwriting extraction
      openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: UNDERWRITING_EXTRACT_PROMPT },
          { role: 'user', content: transcript },
        ],
        temperature: 0,
        response_format: { type: 'json_object' },
      }),

      // Stage detection
      openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: STAGE_DETECTION_PROMPT },
          { role: 'user', content: transcript },
        ],
        temperature: 0,
        max_tokens: 30,
      }),
    ]);

    const insightText = coachRes.choices[0]?.message?.content ?? '{}';
    const underwritingText = underwritingRes.choices[0]?.message?.content ?? '{}';
    const stageText = stageRes.choices[0]?.message?.content?.trim() ?? 'introduction';

    let insight = {};
    let underwriting = {};
    const checklist: Record<string, boolean> = {};

    try { insight = JSON.parse(insightText); } catch { /* keep empty */ }
    try { underwriting = JSON.parse(underwritingText); } catch { /* keep empty */ }

    // Infer checklist from stage and transcript
    const lower = transcript.toLowerCase();
    checklist.beneficiary = lower.includes('beneficiary') || lower.includes('who would receive');
    checklist.reason = lower.includes('why') && (lower.includes('interested') || lower.includes('reach out') || lower.includes('fill'));
    checklist.existing = lower.includes('existing') || lower.includes('current coverage') || lower.includes('have insurance');
    checklist.funeral = lower.includes('funeral') || lower.includes('burial') || lower.includes('cemetery');
    checklist.health = lower.includes('health') || lower.includes('diabetes') || lower.includes('tobacco') || lower.includes('medication');
    checklist.budget = lower.includes('budget') || lower.includes('afford') || lower.includes('per month') || lower.includes('how much');
    checklist.close = lower.includes('get you started') || lower.includes('go ahead') || lower.includes('set you up') || lower.includes('fill out');

    const validStages = ['introduction','permission','discovery','existing_coverage','health','budget','presentation','objections','close'];
    const stage = validStages.includes(stageText) ? stageText : 'introduction';

    return NextResponse.json({
      insight,
      underwriting,
      stage,
      checklist,
      ragSources: retrievedChunks.map((c) => ({ id: c.id, similarity: c.similarity })),
    });
  } catch (err) {
    console.error('Coach API error:', err);
    return NextResponse.json(getDemoInsight(fullLength));
  }
}

function getDemoInsight(lineCount: number) {
  if (lineCount < 4) {
    return {
      insight: {
        detectedObjection: null,
        objectType: null,
        confidence: 0,
        recommendedResponse: 'Build rapport first. Ask open-ended questions and listen carefully.',
        alternativeResponses: [],
        whyThisWorks: 'Trust is built in the early moments. Rush nothing.',
        nextBestQuestion: 'Is now a good time to chat for just a few minutes?',
        buyingSignals: [],
        buyingSignalDetails: [],
        objectionAnalysis: null,
        nextBestAction: {
          nextQuestion: 'Is now a good time to chat for just a few minutes?',
          nextResponse: '',
          nextClose: '',
          talkListenGuidance: 'speak',
          readyForApplication: false,
          readyForApplicationReason: 'Call has just started — rapport has not been established yet.',
        },
        closeOpportunityPct: 10,
        emotionalOpportunities: [],
        urgency: 'low',
      },
      stage: 'introduction',
      underwriting: null,
      checklist: {},
    };
  }

  if (lineCount < 8) {
    return {
      insight: {
        detectedObjection: null,
        objectType: 'opportunity',
        confidence: 72,
        recommendedResponse: 'Ask about their current coverage before presenting anything.',
        alternativeResponses: ['What coverage do you currently have in place?', 'Who would handle the expenses if something happened to you today?'],
        whyThisWorks: 'Understanding their current situation prevents presenting the wrong solution.',
        nextBestQuestion: 'What company is your current coverage with, and how much do you have?',
        buyingSignals: ['Agreed to speak', 'Acknowledged interest'],
        buyingSignalDetails: [
          { category: 'agreement', quote: 'Sure, I have a few minutes', confidence: 70 },
          { category: 'curiosity', quote: "I've been meaning to look into that", confidence: 65 },
        ],
        objectionAnalysis: null,
        nextBestAction: {
          nextQuestion: 'What company is your current coverage with, and how much do you have?',
          nextResponse: '',
          nextClose: '',
          talkListenGuidance: 'listen',
          readyForApplication: false,
          readyForApplicationReason: 'Still in discovery — existing coverage and health have not been covered yet.',
        },
        closeOpportunityPct: 25,
        emotionalOpportunities: ['Mention protecting family from burden'],
        urgency: 'low',
      },
      stage: 'discovery',
      underwriting: null,
      checklist: { beneficiary: false, reason: true, existing: false, funeral: false, health: false, budget: false, close: false },
    };
  }

  return {
    insight: {
      detectedObjection: "I'd like to think about it",
      objectType: 'objection',
      confidence: 88,
      recommendedResponse: "That's completely fair. Before I let you go — is there something specific you'd like to think about? I want to make sure I gave you everything you need.",
      alternativeResponses: [
        "Is it the coverage amount, the company, or the monthly cost?",
        "What would need to be true for this to feel right to you?",
      ],
      whyThisWorks: "'Think about it' almost always means an unresolved concern. Gentle curiosity uncovers the real issue.",
      nextBestQuestion: 'Is there a specific part of this that doesn\'t feel right to you?',
      buyingSignals: ['Asked about beneficiary', 'Shared health information voluntarily', 'Asked about price'],
      buyingSignalDetails: [
        { category: 'trust', quote: 'Shared health information voluntarily', confidence: 80 },
        { category: 'financial_concern', quote: 'How much would something like that cost?', confidence: 75 },
        { category: 'hesitation', quote: "I'd like to think about that. Can I call you back?", confidence: 85 },
      ],
      objectionAnalysis: {
        type: 'think_about_it',
        quote: "I'd like to think about that. Can I call you back?",
        confidence: 88,
        whyItOccurred: 'This followed a price reveal with no pause to confirm comfort — likely price anxiety rather than genuine need for more time.',
        recommendedResponse: "That's completely fair. Before I let you go — is there something specific you'd like to think about? I want to make sure I gave you everything you need.",
        alternateResponse: 'Is it the coverage amount, the company, or the monthly cost you want to think through?',
        followUpQuestion: 'Is there a specific part of this that doesn\'t feel right to you?',
        emotionalContext: 'Likely feeling some price anxiety while still wanting the protection — she has not said no.',
      },
      nextBestAction: {
        nextQuestion: 'Is there a specific part of this that doesn\'t feel right to you?',
        nextResponse: "That's completely fair. Before I let you go — is there something specific you'd like to think about?",
        nextClose: 'If I could get that locked in at the rate we discussed, would you want to move forward today?',
        talkListenGuidance: 'speak',
        readyForApplication: false,
        readyForApplicationReason: 'An active objection needs to be resolved before moving to the application.',
      },
      closeOpportunityPct: 65,
      emotionalOpportunities: ['She mentioned not wanting to burden her children — come back to that'],
      urgency: 'high',
    },
    stage: 'objections',
    underwriting: { age: '68', gender: 'Female', diabetes: true, tobacco: false },
    checklist: { beneficiary: false, reason: true, existing: true, funeral: true, health: true, budget: false, close: false },
  };
}
