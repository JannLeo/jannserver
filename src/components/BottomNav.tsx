'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS: { href: string; icon: string; label: string }[] = [
  { href: '/dashboard', icon: '🏠', label: '首页' },
  { href: '/notes', icon: '📝', label: '笔记' },
  { href: '/daily', icon: '📅', label: 'Daily' },
  { href: '/self-study/courses', icon: '📚', label: '课程' },
  { href: '/tasks', icon: '✅', label: '任务' },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex h-14 items-center justify-around border-t border-stone-900/10 bg-[#fffaf1]/95 backdrop-blur-xl sm:hidden">
      {TABS.map(tab => {
        const active = pathname === tab.href || pathname.startsWith(tab.href + '/');
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`flex flex-col items-center justify-center gap-0.5 px-3 py-1 rounded-2xl transition-colors ${
              active ? 'text-[#173f3c]' : 'text-stone-400'
            }`}
          >
            <span className="text-xl leading-none">{tab.icon}</span>
            <span className={`text-[10px] font-bold leading-tight ${active ? 'opacity-100' : 'opacity-70'}`}>
              {tab.label}
            </span>
            {active && <span className="absolute bottom-1 h-0.5 w-6 rounded-full bg-[#173f3c]" />}
          </Link>
        );
      })}
    </nav>
  );
}