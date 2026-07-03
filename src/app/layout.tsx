import type { Metadata } from 'next';
import './globals.css';
import Sidebar from '@/components/Sidebar';

export const metadata: Metadata = {
  title: 'Jann的个人工作台',
  description: '个人知识库与任务管理系统',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <div className="flex min-h-screen bg-slate-50">
          <Sidebar />
          <div className="flex-1 min-w-0 overflow-hidden">
            {/* 全宽顶部 header */}
            <header className="h-12 border-b border-slate-200 bg-white/95 flex items-center px-4 flex-shrink-0 z-20">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-sm font-bold shadow-sm mr-2.5 flex-shrink-0">
                💼
              </div>
              <span className="text-sm font-semibold text-slate-800">Jann的个人工作台</span>
            </header>
            {/* 页面内容 */}
            <main className="overflow-auto h-[calc(100vh-48px)]">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}