import { getPromptFiles, PromptFile, CATEGORY_NAMES, formatDate, getModelIcon } from '@/lib/prompts';

export const dynamic = 'force-dynamic'; // 确保每次请求都读取文件系统

const categoryOrder = ['official', 'claude-code', 'claude', 'other'];

export default async function PromptsPage() {
  const files = await getPromptFiles();
  const grouped = files.reduce((acc, file) => {
    if (!acc[file.category]) acc[file.category] = [];
    acc[file.category].push(file);
    return acc;
  }, {} as Record<string, PromptFile[]>);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 text-white p-6">
      <div className="max-w-6xl mx-auto">
        <header className="mb-8">
          <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
            AI System Prompts 知识库
          </h1>
          <p className="text-slate-400">
            收集整理自 asgeirtj/system_prompts_leaks · 共 {files.length} 个系统提示文档
          </p>
          <div className="mt-4 flex gap-4">
            <a
              href="https://github.com/asgeirtj/system_prompts_leaks"
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors text-sm"
            >
              🌐 查看原仓库
            </a>
            <a
              href="https://www.diffchecker.com/QJn9jFNk/"
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors text-sm"
            >
              📊 查看 Opus 4.8 → Fable 5 差异
            </a>
          </div>
        </header>

        <div className="grid gap-6">
          {categoryOrder.map(category => {
            const categoryFiles = grouped[category];
            if (!categoryFiles?.length) return null;

            return (
              <section key={category} className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
                <h2 className="text-xl font-semibold mb-4 text-slate-200">
                  {CATEGORY_NAMES[category] || category}
                  <span className="ml-2 text-sm text-slate-500">({categoryFiles.length})</span>
                </h2>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {categoryFiles
                    .sort((a, b) => b.name.localeCompare(a.name))
                    .map(file => (
                      <a
                        key={file.path}
                        href={`/prompts/view?path=${encodeURIComponent(file.path)}`}
                        className="block p-4 bg-slate-700/50 hover:bg-slate-700 rounded-lg transition-all hover:scale-[1.02] group"
                      >
                        <div className="flex items-start gap-3">
                          <span className="text-2xl">{getModelIcon(file.model || file.name)}</span>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-medium text-slate-100 truncate group-hover:text-blue-400 transition-colors">
                              {file.model || file.name}
                            </h3>
                            <p className="text-sm text-slate-500 mt-1">
                              {formatDate(file.path)}
                            </p>
                            <p className="text-xs text-slate-600 mt-2 font-mono truncate">
                              {file.path.split('/').pop()?.replace('.md', '')}
                            </p>
                          </div>
                        </div>
                      </a>
                    ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}