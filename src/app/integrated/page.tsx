import * as fs from 'fs';
import * as path from 'path';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

// 内置功能（不在 repos/ 目录里）
const BUILTIN_APPS = [
  {
    name: 'reading',
    displayName: 'reading（读书计划）',
    description: 'EPUB 读书管理，跟踪阅读进度',
    url: '/reading',
    files: ['page.tsx', 'lib/books.ts', 'components/'],
    builtin: true,
  },
  {
    name: 'voice',
    displayName: 'voice（语音助手）',
    description: '语音输入 AI 助手，实时对话',
    url: '/voice',
    files: ['page.tsx', 'components/', 'api/'],
    builtin: true,
  },
];

function scanRepo(safeName: string): { files: string[]; readme: string } {
  const repoDir = `/home/sz/workspace/repos/${safeName}`;
  if (!fs.existsSync(repoDir)) return { files: [], readme: '' };

  const files: string[] = [];
  const readme = (() => {
    for (const name of ['README.md', 'readme.md', 'README.txt']) {
      const p = path.join(repoDir, name);
      if (fs.existsSync(p)) {
        const content = fs.readFileSync(p, 'utf8').slice(0, 800);
        return content;
      }
    }
    return '';
  })();

  try {
    const entries = fs.readdirSync(repoDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && !entry.name.startsWith('.')) {
        files.push(entry.name);
      }
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        files.push(entry.name + '/');
      }
    }
  } catch {}
  return { files: files.slice(0, 30), readme };
}

export default function IntegratedPage() {
  const reposDir = '/home/sz/workspace/repos';
  let repoNames: string[] = [];
  try { repoNames = fs.readdirSync(reposDir); } catch {}

  const repos = repoNames.map(name => {
    const { files, readme } = scanRepo(name);
    const displayName = name.replace(/_/g, '/');
    return { name, displayName, files, readme, builtin: false };
  });

  const builtinSection = BUILTIN_APPS.map(app => ({
    name: app.name,
    displayName: app.displayName,
    files: app.files,
    readme: app.description,
    builtin: true,
    url: app.url,
  }));

  const allItems = [...builtinSection, ...repos];

  return (
    <div className="page-shell">
      <div className="p-4 max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-black tracking-[-0.04em] text-stone-900">🧩 整合仓库</h1>
            <p className="text-xs text-stone-500 mt-0.5">{repos.length} 个已整合仓库 · 源码在 workspace/repos/</p>
          </div>
          <div className="flex gap-2">
            <a href="/repos" className="text-xs px-3 py-1.5 rounded-lg bg-stone-100 text-stone-600 font-bold">AI 仓库</a>
            <a href="/dashboard" className="text-xs px-3 py-1.5 rounded-lg bg-stone-100 text-stone-600 font-bold">← 返回首页</a>
          </div>
        </div>

        {repos.length === 0 && BUILTIN_APPS.length === 0 ? (
          <div className="text-center py-20 text-stone-400">
            <div className="text-4xl mb-3">📦</div>
            <p className="font-bold">还没有整合仓库</p>
            <p className="text-xs mt-1">去首页热门仓库点「🤖 让 AI 整合」</p>
          </div>
        ) : (
          <div className="space-y-4">
            {allItems.map(item => (
              <div key={item.name} className="app-card rounded-2xl overflow-hidden">
                <div className="p-4 bg-stone-50 border-b border-stone-100 flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-black text-stone-800">{item.displayName}</h2>
                    <p className="text-[10px] text-stone-400 mt-0.5">
                      {item.builtin ? `内置功能 / ${item.name}/` : `repos/${item.name}/`}
                    </p>
                  </div>
                  <a
                    href={item.builtin ? item.url : `/${item.name}`}
                    className="text-xs px-3 py-1.5 rounded-lg bg-teal-600 text-white font-bold"
                  >
                    访问页面 →
                  </a>
                </div>

                {item.readme && (
                  <div className="px-4 py-2 border-b border-stone-100 bg-blue-50/50">
                    <p className="text-[10px] text-blue-700 font-bold mb-1">{item.builtin ? '功能' : 'README'}</p>
                    <p className="text-xs text-stone-600 line-clamp-2">{item.readme}</p>
                  </div>
                )}

                <div className="p-4">
                  <p className="text-[10px] font-bold text-stone-400 mb-2">
                    {item.files.length} 个文件
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {item.files.map((f, i) => (
                      <span key={i} className={`text-[10px] px-2 py-0.5 rounded font-mono ${
                        f.endsWith('/') ? 'bg-stone-200 text-stone-600' : 'bg-stone-100 text-stone-500'
                      }`}>
                        {f}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}