'use client';
import Link from 'next/link';

interface NavBarProps {
  title?: string;
  backTo?: string;
  backLabel?: string;
}

export default function NavBar({ title, backTo = '/dashboard', backLabel = '← 工作台' }: NavBarProps) {
  return (
    <header className="sticky top-0 z-40 border-b bg-white/95 backdrop-blur shadow-sm h-12 flex items-center px-4 sm:px-6">
      <Link
        href={backTo}
        className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-blue-600 whitespace-nowrap transition-colors flex-shrink-0 mr-3"
      >
        <span>{backLabel}</span>
      </Link>
      {title && (
        <h1 className="text-sm font-semibold text-slate-700 truncate">{title}</h1>
      )}
    </header>
  );
}