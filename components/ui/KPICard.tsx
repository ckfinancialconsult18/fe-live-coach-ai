interface KPICardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  trend?: { value: number; label: string };
  color?: 'blue' | 'green' | 'purple' | 'amber' | 'cyan' | 'rose';
  className?: string;
}

const colorMap = {
  blue:   { bg: 'bg-blue-500/10',   text: 'text-blue-400',   glow: 'shadow-blue-500/10',   border: 'border-blue-500/20' },
  green:  { bg: 'bg-green-500/10',  text: 'text-green-400',  glow: 'shadow-green-500/10',  border: 'border-green-500/20' },
  purple: { bg: 'bg-violet-500/10', text: 'text-violet-400', glow: 'shadow-violet-500/10', border: 'border-violet-500/20' },
  amber:  { bg: 'bg-amber-500/10',  text: 'text-amber-400',  glow: 'shadow-amber-500/10',  border: 'border-amber-500/20' },
  cyan:   { bg: 'bg-cyan-500/10',   text: 'text-cyan-400',   glow: 'shadow-cyan-500/10',   border: 'border-cyan-500/20' },
  rose:   { bg: 'bg-rose-500/10',   text: 'text-rose-400',   glow: 'shadow-rose-500/10',   border: 'border-rose-500/20' },
};

export function KPICard({ title, value, subtitle, icon, trend, color = 'blue', className = '' }: KPICardProps) {
  const c = colorMap[color];
  return (
    <div className={`
      glass-card rounded-2xl p-5 hover:bg-white/9 transition-all duration-200
      hover:shadow-xl ${c.glow}
      ${className}
    `}>
      <div className="flex items-start justify-between mb-4">
        <div className={`w-11 h-11 rounded-xl ${c.bg} ${c.border} border flex items-center justify-center ${c.text}`}>
          {icon}
        </div>
        {trend && (
          <span className={`text-xs font-medium px-2 py-1 rounded-full ${
            trend.value >= 0
              ? 'bg-green-500/10 text-green-400'
              : 'bg-red-500/10 text-red-400'
          }`}>
            {trend.value >= 0 ? '↑' : '↓'} {Math.abs(trend.value)}%
          </span>
        )}
      </div>
      <div>
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">{title}</p>
        <p className={`text-2xl font-bold ${c.text} leading-none`}>{value}</p>
        {subtitle && <p className="text-xs text-slate-500 mt-1.5">{subtitle}</p>}
        {trend && <p className="text-xs text-slate-600 mt-1">{trend.label}</p>}
      </div>
    </div>
  );
}
