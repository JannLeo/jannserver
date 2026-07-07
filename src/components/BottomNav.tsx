'use client';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { usePathname } from 'next/navigation';

const TABS: { href: string; label: string; icon: React.ReactNode }[] = [
  {
    href: '/dashboard',
    label: '首页',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
  },
  {
    href: '/notes',
    label: '笔记',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
    ),
  },
  {
    href: '/daily',
    label: 'Daily',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    ),
  },
  {
    href: '/self-study/courses',
    label: '课程',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
      </svg>
    ),
  },
  {
    href: '/tasks',
    label: '任务',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="9 11 12 14 22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
    ),
  },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex h-16 items-end justify-around border-t border-stone-900/10 bg-[#fffaf1]/95 pb-1 backdrop-blur-xl sm:hidden">
      {TABS.map((tab) => {
        const active = pathname === tab.href || pathname.startsWith(tab.href + '/');
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className="relative flex flex-col items-center justify-end gap-0 px-3 pb-1 pt-2"
          >
            {/* Animated background pill */}
            <AnimatePresence>
              {active && (
                <motion.div
                  layoutId="bottomNavBg"
                  className="absolute inset-0 -top-1 rounded-2xl bg-[#173f3c]/8"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                />
              )}
            </AnimatePresence>

            {/* Animated active indicator bar */}
            <AnimatePresence>
              {active && (
                <motion.span
                  layoutId="bottomNavBar"
                  className="absolute -bottom-0.5 h-[3px] w-8 rounded-full bg-[#173f3c]"
                  initial={{ opacity: 0, scaleX: 0.5 }}
                  animate={{ opacity: 1, scaleX: 1 }}
                  exit={{ opacity: 0, scaleX: 0.5 }}
                  transition={{ type: 'spring', stiffness: 450, damping: 34 }}
                />
              )}
            </AnimatePresence>

            {/* Icon with spring scale animation */}
            <motion.div
              animate={{
                scale: active ? 1.18 : 1,
                y: active ? -2 : 0,
              }}
              transition={{
                type: 'spring',
                stiffness: 420,
                damping: 28,
              }}
              className={`relative ${active ? 'text-[#173f3c]' : 'text-stone-400'}`}
            >
              {tab.icon}
            </motion.div>

            {/* Label with fade + slide */}
            <motion.span
              animate={{
                opacity: active ? 1 : 0.72,
                y: active ? 0 : 1,
              }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className={`text-[10px] font-bold leading-tight ${active ? 'text-[#173f3c]' : 'text-stone-400'}`}
            >
              {tab.label}
            </motion.span>
          </Link>
        );
      })}
    </nav>
  );
}