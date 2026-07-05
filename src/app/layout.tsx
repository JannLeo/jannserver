import type { Metadata, Viewport } from 'next';
import './globals.css';
import Sidebar from '@/components/Sidebar';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export const metadata: Metadata = {
  title: 'Jann的工作台',
  description: '个人知识库与任务管理系统',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Jann工作台',
  },
  other: {
    'mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-status-bar-style': 'default',
  },
  icons: {
    icon: '/icons/icon-192.png',
    apple: '/icons/icon-192.png',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js').catch(function(e) {
                    console.warn('SW registration failed:', e);
                  });
                });
              }
            `,
          }}
        />
        <div className="relative z-10 flex min-h-screen overflow-hidden p-2 sm:p-3 lg:p-4">
          <Sidebar />
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-[1.75rem] border border-stone-900/10 bg-[#fffaf1]/70 shadow-[0_30px_90px_rgba(39,32,24,0.10)] backdrop-blur-xl">
            <header className="flex h-16 flex-shrink-0 items-center justify-between border-b border-stone-900/10 bg-[#fffaf1]/78 px-4 sm:px-6">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-[#173f3c] text-lg text-amber-100 shadow-[0_12px_30px_rgba(15,61,58,0.24)]">
                  ◆
                </div>
                <div className="min-w-0">
                  <p className="section-kicker hidden sm:block">Personal operations</p>
                  <span className="block truncate text-base font-black tracking-[-0.02em] text-stone-900">Jann 的个人工作台</span>
                </div>
              </div>
              <div className="hidden items-center gap-2 rounded-full border border-stone-900/10 bg-white/55 px-3 py-1.5 text-xs font-semibold text-stone-500 sm:flex">
                <span className="h-2 w-2 rounded-full bg-teal-500 shadow-[0_0_0_4px_rgba(20,184,166,0.14)]" />
                Ready
              </div>
            </header>
            <main className="h-[calc(100vh-5.5rem)] overflow-auto sm:h-[calc(100vh-6.5rem)] lg:h-[calc(100vh-7rem)]">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
