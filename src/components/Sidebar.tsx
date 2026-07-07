'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface SidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

function LogoIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 5.5A1.5 1.5 0 015.5 4h4A1.5 1.5 0 0111 5.5v4A1.5 1.5 0 019.5 11h-4A1.5 1.5 0 014 9.5v-4z" />
      <path d="M13 5.5A1.5 1.5 0 0114.5 4h4A1.5 1.5 0 0120 5.5v4a1.5 1.5 0 01-1.5 1.5h-4A1.5 1.5 0 0113 9.5v-4z" />
      <path d="M4 14.5A1.5 1.5 0 015.5 13h4a1.5 1.5 0 011.5 1.5v4A1.5 1.5 0 019.5 20h-4A1.5 1.5 0 014 18.5v-4z" />
      <path d="M13 14.5a1.5 1.5 0 011.5-1.5h4a1.5 1.5 0 011.5 1.5v4a1.5 1.5 0 01-1.5 1.5h-4a1.5 1.5 0 01-1.5-1.5v-4z" />
    </svg>
  );
}

const ICONS: Record<string, React.ReactNode> = {
  '🏠': <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  '📝': <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>,
  '✅': <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>,
  '💡': <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="9" y1="18" x2="15" y2="18"/><line x1="10" y1="22" x2="14" y2="22"/><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0018 8 6 6 0 006 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 018.91 14"/></svg>,
  '🎨': <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a10 10 0 1010 10 4 4 0 01-5-5 4 4 0 01-5-5"/><path d="M8.5 8.5v.01"/><path d="M16 15.5v.01"/><path d="M12 12v.01"/><path d="M11 17v.01"/><path d="M7 14v.01"/></svg>,
  '📅': <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  '📁': <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>,
  '📚': <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>,
  '📖': <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/></svg>,
  '💳': <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>,
  '🤖': <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 8V4H8"/><rect x="4" y="8" width="16" height="12" rx="2"/><circle cx="9" cy="14" r="1" fill="currentColor"/><circle cx="15" cy="14" r="1" fill="currentColor"/><path d="M9 18h6"/></svg>,
  '🧠': <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.5 2A2.5 2.5 0 0112 4.5v15a2.5 2.5 0 01-4.96.44 2.5 2.5 0 01-2.96-3.08 3 3 0 01-.34-5.58 2.5 2.5 0 011.32-4.24 2.5 2.5 0 014.44-1.04z"/><path d="M14.5 2A2.5 2.5 0 0012 4.5v15a2.5 2.5 0 004.96.44 2.5 2.5 0 002.96-3.08 3 3 0 00.34-5.58 2.5 2.5 0 00-1.32-4.24 2.5 2.5 0 00-4.44-1.04z"/></svg>,
  '📰': <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 22h16a2 2 0 002-2V4a2 2 0 00-2-2H8a2 2 0 00-2 2v16a2 2 0 01-2 2zm0 0a2 2 0 01-2-2v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8"/><path d="M15 18h-5"/><path d="M10 6h8v4h-8V6z"/></svg>,
  '🔥': <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0011 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 11-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 002.5 2.5z"/></svg>,
  '📘': <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/></svg>,
  '🎯': <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>,
};

// 子菜单配置：key -> { emoji, label, tooltip, children }
const SUB_MENUS: Record<string, { emoji: string; label: string; tooltip: string; children: [string, string, string, string][] }> = {
  creative: {
    emoji: '📝',
    label: '创作',
    tooltip: '笔记·任务·备忘·图像生成',
    children: [
      ['/notes', '📝', '笔记', '笔记'],
      ['/tasks', '✅', '任务', '任务'],
      ['/memos', '💡', '备忘', '备忘录'],
      ['/image-gen', '🎨', '图像生成', 'AI 图像生成'],
    ],
  },
  study: {
    emoji: '🎯',
    label: '自学',
    tooltip: '学习仪表盘·课程·AI导师·闪卡',
    children: [
      ['/self-study', '📊', '学习仪表盘', '学习仪表盘'],
      ['/self-study/courses', '📚', '课程', '全部课程'],
      ['/self-study/tutor', '🤖', 'AI 导师', 'AI 学习问答'],
      ['/self-study/flashcards', '🃏', '闪卡', '间隔重复记忆'],
    ],
  },
};

// 从 navItems 中移除被子菜单收纳的项
const hiddenHrefs = new Set(Object.values(SUB_MENUS).flatMap((m) => m.children.map((c) => c[0])));

// 工作台单独提取，用于在子菜单前置顶渲染
const DASHBOARD_ITEM: [string, string, string, string] = ['/dashboard', '🏠', '工作台', '工作台'];

const navItems: [string, string, string, string][] = [
  ['/daily', '📅', 'Daily', '每日记录'],
  ['/knowledge-ask', '📚', '知识问答', '文档·代码·项目·Wiki·AI问答'],
  ['/usage', '💳', '用量', 'AI 使用情况'],
  ['/video-analysis', '🎬', '视频分析', '视频分析工作台'],
  ['/brain', '🧠', 'Brain', 'WorldQuant BRAIN Alphas'],
  ['/novel', '✍️', '小说', 'AI 小说创作'],
  ['/news', '📰', '新闻', '全球新闻聚合'],
  ['/trending', '🔥', '趋势', 'GitHub Trending'],
  ['/reading', '📘', '读书计划', '阅读·笔记·进度'],
  ['/tailssh', '🔌', 'SSH终端', 'Tailscale SSH 连接管理'],
];

export default function Sidebar({ mobileOpen = false, onMobileClose }: SidebarProps) {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState(true);
  const [openSubMenu, setOpenSubMenu] = useState<string | null>(null);

  // Close on route change (mobile)
  useEffect(() => {
    if (mobileOpen) onMobileClose?.();
  }, [pathname]);

  const isActive = (href: string) =>
    pathname === href || (href !== '/dashboard' && pathname.startsWith(href));

  // Check if any child of a submenu is active
  const isSubMenuActive = (children: [string, string, string, string][]) =>
    children.some(([href]) => isActive(href));

  const renderNavLink = ([href, emoji, label, tooltip]: [string, string, string, string], extraClasses = '') => {
    const active = isActive(href);
    return (
      <Link
        key={href}
        href={href}
        title={tooltip}
        className={
          'group relative flex items-center overflow-hidden rounded-2xl transition-all duration-200 ' +
          (expanded ? 'gap-3 px-3 py-2.5' : 'justify-center px-0 py-2.5') + ' ' +
          (active
            ? 'bg-amber-100 text-[#173f3c] shadow-[0_14px_30px_rgba(0,0,0,0.16)]'
            : 'text-teal-50/72 hover:bg-white/[0.08] hover:text-white') +
          (extraClasses ? ' ' + extraClasses : '')
        }
      >
        {/* Smooth active indicator bar — springs between nav items */}
        <motion.span
          layoutId="sidebarActiveBar"
          className="absolute left-0 top-1/2 h-7 w-1 -translate-y-1/2 rounded-r-full bg-teal-500"
          initial={false}
          transition={{ type: 'spring', stiffness: 450, damping: 38 }}
        />
        <motion.span
          whileHover={{ scale: active ? 1 : 1.06 }}
          whileTap={{ scale: active ? 1 : 0.96 }}
          className={'relative z-10 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl transition ' + (active ? 'bg-white/55' : 'bg-white/[0.06] group-hover:bg-white/[0.10]')}
        >
          {ICONS[emoji] || <span className="text-sm">{emoji}</span>}
        </motion.span>
        {expanded && <span className="relative z-10 truncate text-sm font-bold">{label}</span>}
      </Link>
    );
  };

  const renderSubMenu = (key: string, config: typeof SUB_MENUS[string]) => {
    const isOpen = openSubMenu === key;
    const hasActiveChild = isSubMenuActive(config.children);
    const parentHrefs = config.children.map(c => c[0]);
    const isParentActive = parentHrefs.includes(pathname);

    return (
      <div key={key} className="relative">
        {/* Parent toggle */}
        <button
          onClick={() => setOpenSubMenu(isOpen ? null : key)}
          title={config.tooltip}
          className={
            'group relative flex w-full items-center overflow-hidden rounded-2xl transition-all duration-200 ' +
            (expanded ? 'gap-3 px-3 py-2.5' : 'justify-center px-0 py-2.5') + ' ' +
            (isParentActive || hasActiveChild
              ? 'bg-amber-100 text-[#173f3c] shadow-[0_14px_30px_rgba(0,0,0,0.16)]'
              : 'text-teal-50/72 hover:bg-white/[0.08] hover:text-white')
          }
        >
          {hasActiveChild && <span className="absolute left-0 top-1/2 h-7 w-1 -translate-y-1/2 rounded-r-full bg-teal-500" />}
          <span className={'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl transition ' + (hasActiveChild ? 'bg-white/55' : 'bg-white/[0.06] group-hover:bg-white/[0.10]')}>
            {ICONS[config.emoji] || <span className="text-sm">{config.emoji}</span>}
          </span>
          {expanded && (
            <>
              <span className="flex-1 truncate text-left text-sm font-bold">{config.label}</span>
              <motion.svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                animate={{ rotate: isOpen ? 180 : 0 }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              >
                <polyline points="6 9 12 15 18 9" />
              </motion.svg>
            </>
          )}
        </button>

        {/* Children — animated expand/collapse */}
        <AnimatePresence initial={false}>
          {expanded && isOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              className="ml-3 mt-1 flex flex-col gap-0.5 border-l border-white/15 pl-3 overflow-hidden"
            >
              {config.children.map((child) => renderNavLink(child))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  const sidebarContent = (
    <>
      {/* Logo header */}
      <div className={'flex h-14 flex-shrink-0 items-center rounded-2xl border border-white/10 bg-white/[0.07] ' + (expanded ? 'gap-3 px-3' : 'justify-center px-0')}>
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-amber-100 text-[#173f3c] shadow-[0_12px_28px_rgba(0,0,0,0.16)]">
          <LogoIcon />
        </div>
        {expanded && (
          <div className="min-w-0 overflow-hidden">
            <div className="truncate text-sm font-black tracking-[-0.02em]">Jann Workspace</div>
            <div className="truncate text-[10px] font-semibold uppercase tracking-[0.18em] text-teal-100/60">Knowledge OS</div>
          </div>
        )}
      </div>

      {/* Nav items */}
      <nav className="mt-4 flex flex-1 flex-col gap-1.5 overflow-y-auto pr-0.5">
        {/* 工作台置顶 */}
        {renderNavLink(DASHBOARD_ITEM)}

        {/* Sub menus */}
        {Object.entries(SUB_MENUS).map(([key, config]) => renderSubMenu(key, config))}

        {/* Regular nav items */}
        {navItems.map((item) => renderNavLink(item))}
      </nav>

      {/* Collapse button */}
      <div className="mt-4 flex-shrink-0 border-t border-white/10 pt-3">
        <button
          onClick={() => setExpanded(!expanded)}
          title={expanded ? '收起侧边栏' : '展开侧边栏'}
          className="flex h-11 w-full items-center justify-center rounded-2xl text-teal-50/70 transition hover:bg-white/[0.08] hover:text-white"
        >
          <span className={'flex items-center gap-2 text-xs font-bold ' + (expanded ? 'px-3' : '')}>
            <motion.svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              animate={{ rotate: expanded ? 0 : 180 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            >
              <polyline points="15 18 9 12 15 6" />
            </motion.svg>
            {expanded && <span>收起导航</span>}
          </span>
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile overlay drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 sm:hidden">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={onMobileClose}
          />
          <aside
            style={{ width: expanded ? 232 : 72, minWidth: expanded ? 232 : 72 }}
            className="absolute left-2 top-2 flex h-[calc(100vh-1rem)] flex-shrink-0 flex-col rounded-[1.75rem] border border-stone-900/10 bg-[#173f3c] p-3 text-stone-100 shadow-[0_30px_80px_rgba(15,61,58,0.20)] transition-all duration-300"
          >
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Desktop sidebar — always visible */}
      <aside
        style={{ width: expanded ? 232 : 72, minWidth: expanded ? 232 : 72 }}
        className="hidden flex-shrink-0 flex-col rounded-[1.75rem] border border-stone-900/10 bg-[#173f3c] p-3 text-stone-100 shadow-[0_30px_80px_rgba(15,61,58,0.20)] transition-all duration-300 sm:flex lg:mr-4"
      >
        {sidebarContent}
      </aside>
    </>
  );
}
