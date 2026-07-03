'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface NavBarProps {
  title?: string;
  backTo?: string;
  backLabel?: string;
}

const navLinks: [string, string, string][] = [
  ['/dashboard', '🏠', '工作台'],
  ['/notes', '📝', '笔记'],
  ['/tasks', '✅', '任务'],
  ['/memos', '💡', '备忘'],
  ['/daily', '📅', 'Daily'],
  ['/projects', '📁', '项目'],
  ['/repos', '📚', '知识库'],
  ['/ask', '🤖', 'AI 问答'],
];

export default function NavBar({ title, backTo, backLabel }: NavBarProps) {
  const pathname = usePathname();
  const isDashboard = pathname === '/dashboard';

  return (
    <header className="sticky top-0 z-40 border-b bg-white/95 backdrop-blur shadow-sm">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14 gap-4">
          {/* 左侧：Logo + 标题 */}
          <div className="flex items-center gap-3 flex-shrink-0">
            {isDashboard ? (
              /* Dashboard 首页：无返回链接，Logo + 工作台 */
              <>
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-sm font-bold shadow-sm">
                    💼
                  </div>
                  <div className="hidden sm:block">
                    <div className="text-sm font-semibold text-slate-900 leading-tight">个人工作台</div>
                    <div className="text-[10px] text-slate-400 leading-tight">Personal Workspace</div>
                  </div>
                </div>
                {title && (
                  <span className="hidden md:block text-slate-300">|</span>
                )}
                {title && (
                  <h1 className="hidden md:block text-sm font-medium text-slate-600 truncate">{title}</h1>
                )}
              </>
            ) : (
              /* 子页面：返回链接 + 标题 */
              <>
                <Link
                  href={backTo ?? '/dashboard'}
                  className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-blue-600 whitespace-nowrap transition-colors flex-shrink-0"
                >
                  <span className="text-base">←</span>
                  <span className="hidden sm:inline">{backLabel ?? '工作台'}</span>
                </Link>
                {title && (
                  <>
                    <span className="text-slate-200 select-none">|</span>
                    <h1 className="text-sm font-semibold text-slate-700 truncate">{title}</h1>
                  </>
                )}
              </>
            )}
          </div>

          {/* 右侧：导航链接 */}
          <nav className="flex items-center gap-1 overflow-x-auto scrollbar-none ml-auto flex-shrink-0">
            {navLinks.map(([href, icon, label]) => {
              const isActive = pathname === href || (href !== '/dashboard' && pathname.startsWith(href));
              return (
                <Link
                  key={href}
                  href={href}
                  className={`
                    px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all flex-shrink-0 flex items-center gap-1.5
                    ${isActive
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
                    }
                  `}
                >
                  <span>{icon}</span>
                  <span>{label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
    </header>
  );
}