'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

// Product logo icon: simple grid/layout (represents workspace)
function LogoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

// Nav icons: simple inline SVGs matching workspace theme
const ICONS: Record<string, React.ReactNode> = {
  '🏠': <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  '📝': <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>,
  '✅': <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>,
  '💡': <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="9" y1="18" x2="15" y2="18"/><line x1="10" y1="22" x2="14" y2="22"/><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0018 8 6 6 0 006 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 018.91 14"/></svg>,
  '📅': <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  '📁': <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>,
  '📚': <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>,
  '📖': <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/></svg>,
  '💳': <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>,
  '🤖': <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 8V4H8"/><rect x="4" y="8" width="16" height="12" rx="2"/><circle cx="9" cy="14" r="1" fill="currentColor"/><circle cx="15" cy="14" r="1" fill="currentColor"/><path d="M9 18h6"/></svg>,
  '🧠': <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.5 2A2.5 2.5 0 0112 4.5v15a2.5 2.5 0 01-4.96.44 2.5 2.5 0 01-2.96-3.08 3 3 0 01-.34-5.58 2.5 2.5 0 011.32-4.24 2.5 2.5 0 014.44-1.04z"/><path d="M14.5 2A2.5 2.5 0 0012 4.5v15a2.5 2.5 0 004.96.44 2.5 2.5 0 002.96-3.08 3 3 0 00.34-5.58 2.5 2.5 0 00-1.32-4.24 2.5 2.5 0 00-4.44-1.04z"/></svg>,
};

const navItems: [string, string, string, string][] = [
  ['/dashboard', '🏠', '工作台', '工作台'],
  ['/notes', '📝', '笔记', '笔记'],
  ['/tasks', '✅', '任务', '任务'],
  ['/memos', '💡', '备忘', '备忘录'],
  ['/daily', '📅', 'Daily', '每日记录'],
  ['/projects', '📁', '项目', '项目管理'],
  ['/repos', '📚', '知识库', 'GitHub 知识库'],
  ['/wiki', '📖', 'Wiki', 'LLM-Wiki 知识层'],
  ['/code', '📦', '代码', '项目代码浏览'],
  ['/usage', '💳', '用量', 'AI 使用情况'],
  ['/ask', '🤖', 'AI 问答', 'AI 知识库问答'],
  ['/video-analysis', '🎬', '视频分析', '视频分析工作台'],
  ['/brain', '🧠', 'Brain', 'WorldQuant BRAIN Alphas'],
];

export default function Sidebar() {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState(true);

  return (
    <aside
      style={{ width: expanded ? 200 : 56, minWidth: expanded ? 200 : 56 }}
      className="flex-shrink-0 flex flex-col bg-slate-50 border-r border-slate-200 transition-all duration-200 z-30"
    >
      {/* Logo 区域 */}
      <div className={'flex items-center h-11 border-b border-slate-200 flex-shrink-0 ' + (expanded ? 'px-4 gap-3' : 'justify-center px-0')}>
        <div className="w-7 h-7 rounded-md bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center flex-shrink-0 shadow-sm">
          <LogoIcon />
        </div>
        {expanded && (
          <div className="min-w-0 overflow-hidden">
            <div className="text-xs font-semibold text-slate-800 leading-tight truncate">Jann的工作台</div>
          </div>
        )}
      </div>

      {/* 导航 */}
      <nav className="flex-1 py-2 flex flex-col gap-0.5 overflow-y-auto">
        {navItems.map(([href, emoji, label, tooltip]) => {
          const isActive = pathname === href || (href !== '/dashboard' && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              title={tooltip}
              className={
                'group flex items-center rounded-lg transition-all duration-150 ' +
                (expanded
                  ? 'mx-2 pl-3 pr-3 py-2 gap-3'
                  : 'justify-center mx-1.5 py-2'
                ) + ' ' +
                (isActive
                  ? 'bg-blue-50 text-blue-600 font-medium'
                  : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                )
              }
            >
              <span className="flex-shrink-0 w-4 h-4 flex items-center justify-center">
                {ICONS[emoji] || <span className="text-sm">{emoji}</span>}
              </span>
              {expanded && (
                <span className="text-xs truncate">{label}</span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* 展开/收起按钮 */}
      <div className="flex-shrink-0 border-t border-slate-200">
        <button
          onClick={() => setExpanded(!expanded)}
          title={expanded ? '收起侧边栏' : '展开侧边栏'}
          className="w-full flex items-center h-10 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
        >
          {expanded ? (
            <span className="flex items-center gap-2 px-4 text-xs">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              <span>收起</span>
            </span>
          ) : (
            <span className="flex items-center justify-center w-full">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </span>
          )}
        </button>
      </div>
    </aside>
  );
}