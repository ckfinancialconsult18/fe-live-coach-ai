'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/** Switcher between the two halves of the knowledge system: uploaded
 *  reference documents (/knowledge-base) and the call-learning pipeline
 *  (/knowledge-center). Both routes render under one "Knowledge" nav item. */
export function KnowledgeTabs() {
  const pathname = usePathname();
  const tabs = [
    { href: '/knowledge-base', label: '📄 Documents & Guides' },
    { href: '/knowledge-center', label: '🧠 Learned From Calls' },
  ];
  return (
    <div className="flex gap-1 p-1 rounded-xl bg-white/5 w-fit">
      {tabs.map((t) => {
        const active = pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              active
                ? 'bg-[rgba(212,175,55,0.14)] text-[#D4AF37] border border-[rgba(212,175,55,0.3)]'
                : 'text-slate-500 hover:text-slate-300 border border-transparent'
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
