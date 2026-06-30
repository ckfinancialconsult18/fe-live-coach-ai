export const metadata = { title: 'Knowledge Base' };

const sections = [
  {
    title: 'Opening Scripts',
    icon: '👋',
    color: '#D4AF37',
    articles: [
      {
        title: 'Standard Opening',
        content: `"Hi, may I speak with [Name]? ... Hi [Name], this is [Your Name] with [Company]. The reason I'm calling is you recently filled out a card online requesting information about final expense life insurance. Did you receive the information you were looking for?"`
      },
      {
        title: 'Callback Opening',
        content: `"Hi [Name], this is [Your Name] getting back with you. You had requested some information about final expense coverage — do you have just a few minutes to talk?"`
      },
    ],
  },
  {
    title: 'Objection Handling',
    icon: '🛡️',
    color: '#ef4444',
    articles: [
      {
        title: 'Already Have Insurance',
        content: `Ask: "What company is it with?" → "How much coverage do you have?" → "What are you paying for it?" → "What made you feel that wasn't quite enough to look at something else?" Their existing coverage is a buying signal — don't move on.`
      },
      {
        title: 'Need to Think About It',
        content: `"That's fair. Before I let you go — is there something specific you'd like to think about? I want to make sure I gave you everything you need to make the best decision for your family."`
      },
      {
        title: 'Too Expensive',
        content: `"I completely understand. When you say it feels expensive, are you comparing it to something, or is the budget just tight? Because most of our clients find a plan that works for them — let me ask: what monthly amount would feel comfortable?"`
      },
    ],
  },
  {
    title: 'Health Questions Script',
    icon: '❤️',
    color: '#22c55e',
    articles: [
      {
        title: 'Full Health Question Sequence',
        content: `1. "How is your overall health — are you in pretty good shape?"
2. "Are you a tobacco user at all?"
3. "Do you have any major health conditions like diabetes, heart problems, or cancer?"
4. "Have you been hospitalized in the last 2 years?"
5. "What medications are you currently taking?"
6. "Are you currently using oxygen or any assisted mobility devices?"`
      },
    ],
  },
  {
    title: 'Closing Scripts',
    icon: '✅',
    color: '#a78bfa',
    articles: [
      {
        title: 'The Assumptive Close',
        content: `"Based on everything you've told me, I can get you [coverage amount] with [carrier] for right around [price] a month. Would you like to go ahead and get that started today so we can get you protected right away?"`
      },
      {
        title: 'The Choice Close',
        content: `"Now I have you down for [option A] at [price] and [option B] at [price]. Which of those feels more comfortable for you?"`
      },
      {
        title: 'The Takeaway Close',
        content: `"I completely understand. You know, I talk to a lot of seniors who say the same thing. The ones who don't move forward today usually end up calling back in 6 months when their health has changed and they no longer qualify. I'd hate for that to happen to you."`
      },
    ],
  },
  {
    title: 'Budget Questions',
    icon: '💰',
    color: '#f59e0b',
    articles: [
      {
        title: 'Finding the Budget Number',
        content: `"The average plan runs between $30-60 per month depending on your age and health. Is there a monthly amount that would feel comfortable for you to set aside for this?" ... Wait for answer ... "Great, I can definitely work within that range."`
      },
    ],
  },
  {
    title: 'Funeral & Discovery Questions',
    icon: '🔍',
    color: '#06b6d4',
    articles: [
      {
        title: 'Discovery Script',
        content: `"Can I ask — what made you reach out about this?" ... "Have you given any thought to final arrangements — like whether you prefer burial or cremation?" ... "Do you have a specific funeral home in mind?" ... "Have you gotten any estimates on what that might cost?"`
      },
      {
        title: 'Beneficiary Question',
        content: `"Who would you want to receive the benefit when the time comes? ... And is that a spouse, a child, or a grandchild?" (Always collect full name, relationship, and date of birth)`
      },
    ],
  },
];

export default function KnowledgeBasePage() {
  return (
    <div className="space-y-6 max-w-[1200px]">
      <div>
        <h2 className="text-xl font-bold text-slate-100">Knowledge Base</h2>
        <p className="text-sm text-slate-500 mt-1">Scripts, objection handling, and sales frameworks — the AI references this during live calls</p>
      </div>

      <div className="space-y-5">
        {sections.map((section) => (
          <div key={section.title} className="glass-card rounded-2xl overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-4 border-b border-white/6"
              style={{ background: `${section.color}08` }}>
              <span className="text-xl">{section.icon}</span>
              <h3 className="text-sm font-bold text-slate-200">{section.title}</h3>
              <span className="ml-auto text-[10px] font-semibold text-slate-500">{section.articles.length} articles</span>
            </div>
            <div className="divide-y divide-white/4">
              {section.articles.map((article) => (
                <details key={article.title} className="group">
                  <summary className="flex items-center gap-3 px-5 py-3.5 cursor-pointer hover:bg-white/3 transition-colors list-none">
                    <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: section.color }} />
                    <span className="text-sm font-medium text-slate-300 flex-1">{article.title}</span>
                    <svg className="w-4 h-4 text-slate-600 group-open:rotate-180 transition-transform shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="6 9 12 15 18 9"/>
                    </svg>
                  </summary>
                  <div className="px-5 pb-4 pt-1">
                    <div className="rounded-xl p-4 bg-white/3 border border-white/6">
                      <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-line">{article.content}</p>
                    </div>
                  </div>
                </details>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
