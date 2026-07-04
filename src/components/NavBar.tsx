'use client';
import Link from 'next/link';

interface NavBarProps {
  title?: string;
  backTo?: string;
  backLabel?: string;
}

export default function NavBar({ title, backTo = '/dashboard', backLabel = '← 工作台' }: NavBarProps) {
  return (
    <header className="sticky top-0 z-40 flex h-14 items-center border-b border-stone-900/10 bg-[#fffaf1]/86 px-4 backdrop-blur-xl sm:px-6">
      <Link
        href={backTo}
        className="mr-3 flex flex-shrink-0 items-center gap-1.5 rounded-full border border-stone-900/10 bg-white/55 px-3 py-1.5 text-xs font-black text-stone-500 transition hover:border-teal-500/40 hover:text-teal-700"
      >
        <span>{backLabel}</span>
      </Link>
      {title && (
        <h1 className="truncate text-sm font-black tracking-[-0.02em] text-stone-800">{title}</h1>
      )}
    </header>
  );
}
