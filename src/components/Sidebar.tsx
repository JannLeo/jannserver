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
  ['/ask', '🤖', 'AI 问答', 'AI 知识库问答'],
];

export default function Sidebar() {
  const pathname = usePathname();
  const isDashboard = pathname === '/dashboard';

  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={`
        sticky top-0 h-screen flex flex-col
        bg-white border-r border-slate-200
        transition-all duration-200 ease-in-out flex-shrink-0
        ${collapsed ? 'w-[64px]' : 'w-[220px]'}
      `}
    >
      {/* Logo 区域 */}
      <div className="flex items-center gap-2.5 px-4 h-14 border-b border-slate-100 flex-shrink-0">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-sm font-bold shadow-sm flex-shrink-0">
          💼
        </div>
        {!collapsed && (
          <div className="min-w-0 overflow-hidden">
            <div className="text-sm font-semibold text-slate-900 leading-tight truncate">Jann的个人工作台</div>
            <div className="text-[10px] text-slate-400 leading-tight">Personal Workspace</div>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="ml-auto text-slate-400 hover:text-slate-600 transition-colors p-1 flex-shrink-0"
          title={collapsed ? '展开侧边栏' : '收起侧边栏'}
        >
          <svg className={`w-4 h-4 transition-transform ${collapsed ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      </div>

      {/* 导航列表 */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {navItems.map(([href, icon, label, tooltip]) => {
          const isActive = pathname === href || (href !== '/dashboard' && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              title={collapsed ? tooltip : undefined}
              className={`
                flex items-center gap-2.5 rounded-lg transition-all
                ${collapsed ? 'justify-center px-2 py-2' : 'px-3 py-2'}
                ${isActive
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-800'
                }
              `}
            >
              <span className="text-base flex-shrink-0">{icon}</span>
              {!collapsed && (
                <span className="text-sm font-medium truncate">{label}</span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* 底部：GitHub 状态小徽章 */}
      {!collapsed && (
        <div className="px-4 py-3 border-t border-slate-100 flex-shrink-0">
          <div className="text-[10px] text-slate-400 leading-relaxed">
            <div>📚 知识库已同步</div>
            <div className="text-slate-300 mt-0.5">Powered by JannServer</div>
          </div>
        </div>
      )}
    </aside>
  );
}