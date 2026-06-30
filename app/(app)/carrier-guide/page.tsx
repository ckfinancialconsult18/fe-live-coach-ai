export const metadata = { title: 'Carrier Guide' };

const carriers = [
  {
    name: 'Americo Eagle',
    product: 'Eagle Premier',
    ageRange: '50–85',
    maxFaceAmount: '$30,000',
    features: ['Tobacco OK', 'Diabetes OK', 'Level & Graded options', 'Immediate benefit available'],
    avoid: ['Oxygen users', 'Wheelchair bound'],
    color: '#D4AF37',
  },
  {
    name: 'Mutual of Omaha',
    product: 'Living Promise',
    ageRange: '45–85',
    maxFaceAmount: '$25,000',
    features: ['Strong brand', 'Tobacco OK', 'Instant decision', 'Level benefit most conditions'],
    avoid: ['CHF', 'Currently on oxygen'],
    color: '#22c55e',
  },
  {
    name: 'Corebridge Financial',
    product: 'AG Quick Issue Plus',
    ageRange: '50–80',
    maxFaceAmount: '$25,000',
    features: ['Competitive non-tobacco rates', 'Instant decision', 'No exam required'],
    avoid: ['Tobacco users', 'Cancer history', 'Stroke in last 2 years', 'Oxygen'],
    color: '#06b6d4',
  },
  {
    name: 'Transamerica',
    product: 'Immediate Solution',
    ageRange: '45–85',
    maxFaceAmount: '$25,000',
    features: ['Immediate benefit', 'Tobacco OK', 'Diabetics welcome', 'Competitive pricing'],
    avoid: ['CHF', 'Oxygen use', 'Wheelchair'],
    color: '#a78bfa',
  },
  {
    name: 'Foresters Financial',
    product: 'PlanRight',
    ageRange: '50–85',
    maxFaceAmount: '$35,000',
    features: ['Fraternal benefits', 'Member dividends', 'Competitive pricing', 'Tobacco OK'],
    avoid: ['Current oxygen use'],
    color: '#f59e0b',
  },
  {
    name: 'Royal Neighbors',
    product: 'Modified Benefit',
    ageRange: '50–80',
    maxFaceAmount: '$25,000',
    features: ['Accepts most conditions', 'Last resort option', 'Fraternal benefits'],
    avoid: ['2-year graded benefit — higher risk cases'],
    color: '#ec4899',
  },
];

export default function CarrierGuidePage() {
  return (
    <div className="space-y-6 max-w-[1400px]">
      <div>
        <h2 className="text-xl font-bold text-slate-100">Carrier Guide</h2>
        <p className="text-sm text-slate-500 mt-1">Final Expense carrier reference — updated underwriting guidelines</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {carriers.map((c) => (
          <div key={c.name} className="glass-card rounded-2xl p-5 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <div className="w-3 h-3 rounded-full" style={{ background: c.color }} />
                  <h3 className="text-base font-bold text-slate-100">{c.name}</h3>
                </div>
                <p className="text-xs text-slate-500">{c.product}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-500">Ages {c.ageRange}</p>
                <p className="text-xs font-semibold" style={{ color: c.color }}>Up to {c.maxFaceAmount}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[9px] font-bold text-green-400 uppercase tracking-wider mb-2">Good For</p>
                <div className="space-y-1">
                  {c.features.map((f) => (
                    <div key={f} className="flex items-center gap-1.5">
                      <span className="text-green-400 text-[10px]">✓</span>
                      <span className="text-[11px] text-slate-300">{f}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[9px] font-bold text-red-400 uppercase tracking-wider mb-2">Watch Out For</p>
                <div className="space-y-1">
                  {c.avoid.map((a) => (
                    <div key={a} className="flex items-start gap-1.5">
                      <span className="text-red-400 text-[10px] shrink-0 mt-0.5">✕</span>
                      <span className="text-[11px] text-slate-400">{a}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="glass-card rounded-2xl p-5 border border-amber-500/20 bg-amber-500/5">
        <p className="text-xs text-amber-400 font-semibold mb-1">⚠️ Important Disclaimer</p>
        <p className="text-xs text-slate-400 leading-relaxed">
          This guide is for reference only and does not represent official underwriting guidelines. Always verify eligibility directly with the carrier before quoting. Underwriting guidelines change frequently. Never guarantee approval to a client.
        </p>
      </div>
    </div>
  );
}
