// ── Missed Opportunity Detection Engine ──────────────────────────────────────
// Two detection layers:
//   1. Keyword / regex scan against the live transcript — instant, deterministic
//   2. AI overrides (discoveryUpdates from /api/coach) — nuanced, async
//
// AI overrides WIN: the model can detect things keyword scan misses (e.g. the
// prospect naturally volunteering information mid-answer without the agent asking).
// Keyword scan provides the floor; AI can promote any item.

import type { TranscriptLine, CallStage, DiscoveryItemState, DiscoveryItem, MissedOpportunityState } from './types';
import { DISCOVERY_ITEMS, sortedItemsByStage } from './discovery-items';

// ── Per-item state computation ────────────────────────────────────────────────

function computeItemState(
  item: (typeof DISCOVERY_ITEMS)[number],
  agentText: string,
  prospectLines: TranscriptLine[],
  allText: string,
): { state: DiscoveryItemState; note: string | null } {
  // 1. Complete signals — highest priority for the keyword layer
  for (const rx of item.completeSignals) {
    if (rx.test(allText)) {
      return { state: 'completed', note: null };
    }
  }

  // 2. Incomplete signals — prospect gave a partial answer
  const prospectText = prospectLines.map(l => l.text).join(' ');
  for (const sig of item.incompleteSignals) {
    if (sig.pattern.test(prospectText)) {
      return { state: 'needs_followup', note: sig.note };
    }
  }

  // 3. Agent trigger — agent asked about this topic
  const agentLower = agentText.toLowerCase();
  const agentTriggered = item.agentTriggers.some(t => agentLower.includes(t));
  if (agentTriggered) {
    return { state: 'in_progress', note: null };
  }

  return { state: 'not_started', note: null };
}

// ── Contradiction detection ────────────────────────────────────────────────────

function detectContradictions(allText: string): string[] {
  const found: string[] = [];
  for (const item of DISCOVERY_ITEMS) {
    for (const pair of item.contradictionPairs) {
      if (pair.a.test(allText) && pair.b.test(allText)) {
        found.push(`${item.label}: ${pair.description}`);
      }
    }
  }
  return found;
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Compute the full missed-opportunity state from:
 *  - transcript (keyword layer, instant)
 *  - aiOverrides (AI layer, applied when the model responds)
 *  - stage (determines priority ordering)
 *
 * Called via useMemo — must stay pure and side-effect free.
 */
export function computeMissedOpportunities(
  transcript: TranscriptLine[],
  aiOverrides: Record<string, DiscoveryItemState>,
  stage: CallStage,
): MissedOpportunityState {
  if (transcript.length === 0) {
    return {
      items: DISCOVERY_ITEMS.map(d => ({
        id: d.id, label: d.label, category: d.category,
        state: 'not_started', note: null,
      })),
      nextQuestion: null,
      progressPct: 0,
      contradictions: [],
    };
  }

  const agentLines   = transcript.filter(l => l.speaker === 'agent');
  const prospectLines = transcript.filter(l => l.speaker === 'prospect');
  const agentText    = agentLines.map(l => l.text).join(' ');
  const allText      = transcript.map(l => l.text).join(' ');

  // Build the item list in priority order for the current stage
  const sorted = sortedItemsByStage(stage);

  const items: DiscoveryItem[] = sorted.map(def => {
    const kw = computeItemState(def, agentText, prospectLines, allText);

    // AI override wins — but we keep the keyword note if AI just says "completed"
    const aiState = aiOverrides[def.id];
    const finalState: DiscoveryItemState = aiState ?? kw.state;

    // If AI promoted to completed without a keyword hit, keep note from keyword layer
    const note = kw.note ?? null;

    return {
      id: def.id,
      label: def.label,
      category: def.category,
      state: finalState,
      note: finalState === 'needs_followup' ? note : null,
    };
  });

  // Progress: completed items / total
  const completedCount = items.filter(i => i.state === 'completed').length;
  const progressPct = Math.round((completedCount / items.length) * 100);

  // Next question: highest-priority item that isn't completed yet
  // needs_followup items get priority because they need resolution
  const needsFollowup = items.find(i => i.state === 'needs_followup');
  const notStarted    = items.find(i => i.state === 'not_started');

  let nextQuestion: MissedOpportunityState['nextQuestion'] = null;

  const targetItem = needsFollowup ?? notStarted;
  if (targetItem) {
    const def = DISCOVERY_ITEMS.find(d => d.id === targetItem.id);
    if (def) {
      // Use the item's follow-up question if it needs follow-up and one is defined
      const followUpDef = def.incompleteSignals.find(s => s.pattern.test(
        prospectLines.map(l => l.text).join(' ')
      ));
      const question = (targetItem.state === 'needs_followup' && followUpDef)
        ? followUpDef.followUpQuestion
        : def.question;

      nextQuestion = {
        itemId: def.id,
        label: def.label,
        question,
        urgency: def.urgency,
      };
    }
  }

  const contradictions = detectContradictions(allText);

  return { items, nextQuestion, progressPct, contradictions };
}
