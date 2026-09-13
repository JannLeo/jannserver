import * as fs from 'fs';
import * as path from 'path';
import { REPOS_BASE_DIR, isPathUnderReposBase } from '@/lib/paths';

export const dynamic = 'force-dynamic';

type IntegratedItem = {
  name: string;
  displayName: string;
  files: string[];
  readme: string;
  builtin: boolean;
  url?: string;
};

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
] as const;

function scanRepo(safeName: string): { files: string[]; readme: string } {
  const repoDir = path.resolve(REPOS_BASE_DIR, safeName);
  if (!isPathUnderReposBase(repoDir) || !fs.existsSync(repoDir)) {
    return { files: [], readme: '' };
  }

  const files: string[] = [];
  const readme = (() => {
    for (const name of ['README.md', 'readme.md', 'README.txt']) {
      const readmePath = path.join(repoDir, name);
      if (fs.existsSync(readmePath)) {
        return fs.readFileSync(readmePath, 'utf8').slice(0, 800);
      }
    }
    return '';
  })();

  try {
    const entries = fs.readdirSync(repoDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      if (entry.isFile()) files.push(entry.name);
      if (entry.isDirectory()) files.push(`${entry.name}/`);
    }
  } catch {
    return { files: [], readme };
  }

  return { files: files.slice(0, 30), readme };
}

export default function IntegratedPage() {
  let repoNames: string[] = [];
  try {
    repoNames = fs.readdirSync(REPOS_BASE_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .map((entry) => entry.name);
  } catch {
    repoNames = [];
  }

  const repos: IntegratedItem[] = repoNames.map((name) => {
    const { files, readme } = scanRepo(name);
    return {
      name,
      displayName: name.replace(/_/g, '/'),
      files,
      readme,
      builtin: false,
    };
  });

  const builtinSection: IntegratedItem[] = BUILTIN_APPS.map((app) => ({
    name: app.name,
    displayName: app.displayName,
    files: [...app.files],
    readme: app.description,
    builtin: true,
    url: app.url,
  }));

  const allItems: IntegratedItem[] = [...builtinSection, ...repos];

  return (
    <div className="page-shell">
      <div className="p-4 max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-black tracking-[-0.04em] text-stone-900">🧩 整合仓库</h1>
            <p className="text-xs text-stone-500 mt-0.5">{repos.length} 个已整合仓库 · 源码在 data/repos/</p>
          </div>
          <div className="flex gap-2">
            <a href="/repos" className="text-xs px-3 py-1.5 rounded-lg bg-stone-100 text-stone-600 font-bold">AI 仓库</a>
            <a href="/dashboard" className="text-xs px-3 py-1.5 rounded-lg bg-stone-100 text-stone-600 font-bold">← 返回首页</a>
          </div>
        </div>

        {allItems.length === 0 ? (
          <div className="text-center py-20 text-stone-400">
            <div className="text-4xl mb-3">📦</div>
            <p className="font-bold">还没有整合仓库</p>
            <p className="text-xs mt-1">去首页热门仓库点「🤖 让 AI 整合」</p>
          </div>
        ) : (
          <div className="space-y-4">
            {allItems.map((item) => (
              <div key={item.name} className="app-card rounded-2xl overflow-hidden">
                <div className="p-4 bg-stone-50 border-b border-stone-100 flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-black text-stone-800">{item.displayName}</h2>
                    <p className="text-[10px] text-stone-400 mt-0.5">
                      {item.builtin ? `内置功能 / ${item.name}/` : `data/repos/${item.name}/`}
                    </p>
                  </div>
                  <a
                    href={item.builtin && item.url ? item.url : `/${item.name}`}
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
                  <p className="text-[10px] font-bold text-stone-400 mb-2">{item.files.length} 个文件</p>
                  <div className="flex flex-wrap gap-1.5">
                    {item.files.map((file, index) => (
                      <span
                        key={`${file}-${index}`}
                        className={`text-[10px] px-2 py-0.5 rounded font-mono ${
                          file.endsWith('/')
                            ? 'bg-stone-200 text-stone-600'
                            : 'bg-stone-100 text-stone-500'
                        }`}
                      >
                        {file}
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
