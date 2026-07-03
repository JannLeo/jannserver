import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Jann的个人工作台',
  description: '个人知识库与任务管理系统',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-slate-50 text-slate-900">{children}</body>
    </html>
  );
}