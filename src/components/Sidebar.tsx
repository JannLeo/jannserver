'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

const navItems: [string, string, string, string][] = [
  ['/dashboard', '🏠', '工作台', '工作台'],
  ['/notes', '📝', '笔记', '笔记'],
  ['/tasks', '✅', '任务', '任务'],
  ['/memos', '💡', '备忘', '备忘录'],
  ['/daily', '📅', 'Daily', '每日记录'],
  ['/projects', '📁', '项目', '项目管理'],
  ['/repos', '📚', '知识库', 'GitHub 知识库'],
  ['/wiki', '📖', 'Wiki', 'LLM-Wiki 知识层'],
  ['/usage', '💳', '用量', 'AI 使用情况'],
  ['/ask', '🤖', 'AI 问答', 'AI 知识库问答'],
];

export default function Sidebar() {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState(false);

  return (
    <aside
      style={{ width: expanded ? 180 : 56, minWidth: expanded ? 180 : 56 }}
      className="flex-shrink-0 flex flex-col bg-slate-50 border-r border-slate-200 transition-all duration-200 z-30"
    >
      {/* Logo 区域 */}
      <div className={'flex items-center h-12 border-b border-slate-200 flex-shrink-0 ' + (expanded ? 'justify-start px-3 gap-2' : 'justify-center px-0')}>
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-sm font-bold shadow-sm flex-shrink-0">
          💼
        </div>
        {expanded && (
          <div className="min-w-0 overflow-hidden">
            <div className="text-xs font-semibold text-slate-800 leading-tight truncate">Jann的个人工作台</div>
          </div>
        )}
      </div>

      {/* 导航 */}
      <nav className="flex-1 py-2 flex flex-col gap-0.5 overflow-y-auto">
        {navItems.map(([href, icon, label, tooltip]) => {
          const isActive = pathname === href || (href !== '/dashboard' && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              title={tooltip}
              className={
                'flex items-center rounded-lg transition-all ' +
                (expanded
                  ? 'mx-1.5 px-2.5 py-2 gap-2.5'
                  : 'justify-center mx-1 px-0 py-2'
                ) + ' ' +
                (isActive
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                )
              }
            >
              <span className="text-sm flex-shrink-0 leading-none mt-0.5">{icon}</span>
              {expanded && (
                <span className="text-xs font-medium truncate">{label}</span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* 展开/收起按钮 */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex-shrink-0 flex items-center justify-center h-10 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors border-t border-slate-200"
        title={expanded ? '收起' : '展开'}
      >
        <svg className={`w-4 h-4 transition-transform ${expanded ? '' : 'rotate-180'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </button>
    </aside>
  );
}