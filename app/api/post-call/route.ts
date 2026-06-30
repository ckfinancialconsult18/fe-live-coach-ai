import { NextRequest, NextResponse } from 'next/server';
import { openai } from '@/lib/openai';
import { POST_CALL_PROMPT } from '@/lib/coach-prompts';

export async function POST(req: NextRequest) {
  const { transcript } = await req.json() as { transcript: string };
  if (!transcript) return NextResponse.json({ error: 'No transcript' }, { status: 400 });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(getDemoReport());
  }

  try {
    const res = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: POST_CALL_PROMPT },
        { role: 'user', content: `Full transcript:\n\n${transcript}` },
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' },
    });

    const content = res.choices[0]?.message?.content ?? '{}';
    let report = {};
    try { report = JSON.parse(content); } catch { /* keep empty */ }
    return NextResponse.json(report);
  } catch (err) {
    console.error('Post-call API error:', err);
    return NextResponse.json(getDemoReport());
  }
}

function getDemoReport() {
  return {
    summary: "Agent established good initial rapport and gathered key health information including diabetes diagnosis. The prospect showed genuine interest by sharing personal details about funeral cost concerns. Call ended with a 'think about it' objection that was partially addressed.",
    overallScore: 74,
    scores: {
      introduction: 88, permission: 82, discovery: 79, existingCoverage: 71,
      health: 84, budget: 52, presentation: 68, objections: 61, closing: 45,
      confidence: 77, rapport: 85, emotion: 80,
    },
    strengths: [
      "Excellent rapport building in the introduction",
      "Prospect voluntarily shared health information — a strong buying signal",
      "Good use of empathy when discussing funeral costs",
    ],
    missedOpportunities: [
      "Budget question was never clearly asked — prospect's specific number was not captured",
      "Did not circle back to the emotional pain point about not burdening children",
      "Objection handling ended too quickly — should have dug deeper into the real concern",
    ],
    buyingSignals: [
      "Voluntarily shared health details (diabetes, medications)",
      "Expressed concern about funeral costs for her neighbor",
      "Said 'that sounds almost too good to be true' — indicating interest",
    ],
    objections: [
      "'I'd like to think about it' — primary close objection",
      "Price sensitivity — compared to current $30/month plan",
    ],
    followUpText: "Hi Dorothy! This is Courtney from FE Financial. It was great speaking with you today. I'm sending over a quick summary of the Mutual of Omaha plan we discussed — $10,000 coverage for around $28/month. Happy to answer any questions. Talk soon!",
    followUpEmail: "Dear Dorothy,\n\nThank you for taking the time to speak with me today. I really enjoyed our conversation.\n\nAs I mentioned, Mutual of Omaha's Living Promise plan would provide your family with $10,000 in final expense coverage for approximately $28/month — less than you're currently paying for $5,000 in coverage.\n\nI know you wanted some time to think it over, and I completely respect that. If you have any questions at all, please don't hesitate to reach out.\n\nWarm regards,\nCourtney K.\nFE Financial",
    crmNotes: "Dorothy Williams, 68F, diabetic (Metformin), non-smoker. Currently has $5,000 AARP policy at $30/month. Concerned about burial costs after neighbor's $12,000 funeral. Good candidate for Mutual of Omaha Living Promise. Price point is ~$28/month for $10K. Objection: 'need to think about it.' Follow up in 2 days.",
    improvementPlan: [
      "Practice the budget question — get a specific number before presenting price",
      "Role play 'think about it' objection — dig deeper with 'Is it the price, the company, or the coverage amount?'",
      "Circle back to emotional triggers more deliberately — she mentioned her children twice",
    ],
  };
}
