export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#090d18] px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 justify-center mb-8">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg"
            style={{ background: 'linear-gradient(135deg, #D4AF37, #9a7a0a)', boxShadow: '0 4px 16px rgba(212,175,55,0.35)' }}
          >
            <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-bold text-slate-100 leading-none tracking-tight">FE Live Coach</p>
            <p className="text-[10px] mt-0.5" style={{ color: '#D4AF37' }}>AI · Final Expense</p>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
