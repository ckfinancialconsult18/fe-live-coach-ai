import type { ObjectionKey, ObjectionResponse } from './types';

export const OBJECTION_RESPONSES: Record<ObjectionKey, ObjectionResponse> = {
  already_insured: {
    title: 'Already Have Insurance',
    framework: `Don't move on yet. Their existing coverage is a BUYING SIGNAL — they already understand the need.

Ask these questions to uncover gaps:
1. "What company is it with?"
2. "How much coverage do you have?"
3. "What are you paying for it monthly?"
4. "What made you feel that wasn't quite enough to look at something else?"

If they hesitate: "Many of our clients had some coverage but found it either wasn't enough or the price had gone up. I just want to make sure you have exactly what you need — nothing more, nothing less."`,
    keyPhrases: [
      "What company is that with?",
      "How much coverage do you currently have?",
      "What are you paying for it?",
      "What made you want to look at additional coverage?"
    ],
    avoidPhrases: [
      "Oh okay, well I won't bother you then",
      "Is that enough coverage?",
      "You should replace that"
    ]
  },

  think_about_it: {
    title: 'Need to Think About It',
    framework: `This is almost never about thinking — it's about an unresolved concern. Dig gently.

Say: "That's completely fair. Before I let you go, can I ask — is there something specific you'd like to think about? I want to make sure I gave you everything you need to make the best decision."

If they mention cost: "That's completely understandable. A minute ago you mentioned wanting to protect your family from burial costs. Let me ask you two quick questions — if I can't improve your situation, I'll tell you to keep exactly what you have."

Never pressure. Never chase. Find the REAL concern.`,
    keyPhrases: [
      "What specifically would you like to think about?",
      "Is there something I didn't explain well enough?",
      "Is it the coverage, the company, or the price?"
    ],
    avoidPhrases: [
      "What's there to think about?",
      "This offer won't last",
      "You really need this coverage"
    ]
  },

  too_expensive: {
    title: 'Too Expensive',
    framework: `Price objections are almost always a value problem, not a money problem. Reframe.

First, confirm what "expensive" means to them:
"I understand. When you say it's too expensive, are you comparing it to something else, or is it that the budget just isn't there right now?"

If it's value: "Let me ask you this — if I could show you a plan that covers a full burial and leaves your family with nothing to pay, all for less than you're spending on _____, would that be worth 5 more minutes?"

If it's budget: "What monthly amount would feel comfortable for you?" Then work backward from that number.`,
    keyPhrases: [
      "What monthly amount would feel right for you?",
      "What would comfortable look like?",
      "Would $X per month be something you could work with?"
    ],
    avoidPhrases: [
      "It's really not that expensive",
      "You can't afford NOT to have this",
      "Let me see if I can get you a discount"
    ]
  },

  call_later: {
    title: 'Call Me Later',
    framework: `Respect their time while keeping the momentum. "Later" without a time usually means never.

"Absolutely — I respect that. Before I let you go, can I ask — is now just a bad time, or is there something about what I shared that didn't feel right?"

If it's bad timing: "Of course. What day and time works best for you this week?" — Get a specific commitment.

If vague: "I want to make sure I'm not calling at the wrong time again. Would morning or afternoon work better?" Lock in a time.`,
    keyPhrases: [
      "What day and time works best for you?",
      "Morning or afternoon?",
      "I'll put it in my calendar right now"
    ],
    avoidPhrases: [
      "I'll try you again sometime",
      "Sure, I'll call whenever",
      "No problem, whenever is fine"
    ]
  },

  need_spouse: {
    title: 'Need to Talk to Spouse',
    framework: `Include the spouse rather than competing with them. Their input is actually a buying signal — they care about family protection.

"That's wonderful — it's always best when couples make these decisions together. Is your spouse home right now by any chance? I'd love to give you both the information at the same time so neither of you has to repeat it."

If spouse is not home: "That makes sense. What I can do is send you both something in writing so you can review it together. When do you think you'd have a chance to look it over — would tomorrow evening work?"`,
    keyPhrases: [
      "Is your spouse home right now?",
      "When would be a good time when you're both available?",
      "I'd love to speak with both of you together"
    ],
    avoidPhrases: [
      "You don't need their permission",
      "Can't you make this decision yourself?",
      "The spouse thing is usually just an excuse"
    ]
  },

  busy: {
    title: 'Too Busy Right Now',
    framework: `Quick, respectful, lock in the next step.

"I completely understand — I'll be quick. Is there a better time this week? I can call at exactly [time] and I promise I'll be respectful of your schedule."

If they seem interested despite being busy: "I hear you. Just two quick questions and I'll let you go — it'll take 90 seconds, and then we can schedule a proper time if you'd like."`,
    keyPhrases: [
      "What time this week works better?",
      "I can be quick — two questions",
      "I'll schedule for exactly when you say"
    ],
    avoidPhrases: [
      "This will only take a second",
      "I'll be really fast",
      "Just hear me out real quick"
    ]
  },

  not_interested: {
    title: 'Not Interested',
    framework: `Don't accept this at face value — but DO respect it. First, understand it.

"I appreciate your honesty. Can I ask — is it that you already have everything you need in place, or is it that now just isn't the right time?"

If they have coverage: pivot to the "already insured" framework.
If timing: pivot to "call later" framework.
If genuine: "I completely respect that. Before I go — just out of curiosity, is there anyone in your family who might benefit from knowing about this? I'd be happy to reach out to them instead."`,
    keyPhrases: [
      "Is it that you already have coverage, or just not the right time?",
      "I completely respect that",
      "Is there a family member who might benefit?"
    ],
    avoidPhrases: [
      "Are you sure?",
      "Why not?",
      "Most people feel that way at first"
    ]
  }
};
