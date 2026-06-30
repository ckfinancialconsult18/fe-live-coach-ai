'use client';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'purple';
  size?: 'sm' | 'md';
}

const variantClasses = {
  default: 'bg-white/10 text-slate-300 border-white/10',
  success: 'bg-green-500/15 text-green-400 border-green-500/20',
  warning: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
  danger:  'bg-red-500/15 text-red-400 border-red-500/20',
  info:    'bg-cyan-500/15 text-cyan-400 border-cyan-500/20',
  purple:  'bg-violet-500/15 text-violet-400 border-violet-500/20',
};

export function Badge({ children, variant = 'default', size = 'sm' }: BadgeProps) {
  return (
    <span className={`
      inline-flex items-center gap-1 rounded-full border font-medium
      ${size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm'}
      ${variantClasses[variant]}
    `}>
      {children}
    </span>
  );
}
