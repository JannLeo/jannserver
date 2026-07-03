'use client';
import Link from 'next/link';

interface NavBarProps {
  title: string;
  backTo?: string;
  backLabel?: string;
}

export default function NavBar({ title, backTo = '/dashboard', backLabel = '返回首页' }: NavBarProps) {
  const navLinks = [
    ['/dashboard', '首页'],
    ['/notes', '笔记'],
    ['/tasks', '任务'],
    ['/memos', '备忘录'],
    ['/daily', 'Daily'],
    ['/projects', '项目'],
    ['/repos', '知识库'],
    ['/ask', '问答'],
  ];

  return (
    <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3 flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-3 min-w-0">
        <Link href={backTo} className="flex items-center gap-1 text-sm text-blue-500 hover:text-blue-700 whitespace-nowrap flex-shrink-0">
          ← {backLabel}
        </Link>
        <h1 className="text-lg font-bold text-slate-800 truncate">{title}</h1>
      </div>
      <nav className="flex gap-0.5 flex-wrap">
        {navLinks.map(([href, label]) => (
          <Link
            key={href}
            href={href}
            className="px-2.5 py-1.5 rounded-lg text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition whitespace-nowrap"
          >
            {label}
          </Link>
        ))}
      </nav>
    </header>
  );
}