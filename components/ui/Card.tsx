interface CardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  glow?: boolean;
}

export function Card({ children, className = '', hover = false, glow = false }: CardProps) {
  return (
    <div className={`
      glass-card rounded-2xl p-6
      ${hover ? 'hover:bg-white/9 transition-all duration-200 cursor-pointer' : ''}
      ${glow ? 'hover:shadow-lg hover:shadow-blue-500/10' : ''}
      ${className}
    `}>
      {children}
    </div>
  );
}

export function CardHeader({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex items-center justify-between mb-5 ${className}`}>
      {children}
    </div>
  );
}

export function CardTitle({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <h3 className={`text-sm font-semibold text-slate-300 uppercase tracking-wider ${className}`}>
      {children}
    </h3>
  );
}
