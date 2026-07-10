# asgeirtj/system_prompts_leaks

## 分析
该仓库收集并公开了 ChatGPT、Claude 等 AI 模型的泄露系统提示词，旨在记录 AI 内部指令。其内容为静态 Markdown 文档，无后端逻辑或数据库依赖。完全适合整合到 Next.js 工作台，可通过 Markdown 渲染组件展示内容，利用 Next.js 的静态生成或 API 路由提供高效访问，构建为 AI 知识库或研究工具。

适合整合

## 代码
```tsx
'use client';

import NavBar from '@/components/NavBar';

const prompts = [
  {
    category: 'OpenAI',
    items: [
      { name: 'Tool: File Search', path: '/OpenAI/tool-file_search.md' },
      { name: 'Monday GPT', path: '/OpenAI/monday-gpt.md' },
      { name: 'ChatGPT GPT-5 Agent Mode', path: '/OpenAI/chatgpt-gpt-5-agent-mode.md' },
      { name: 'Tool: Create Image (Image Gen)', path: '/OpenAI/tool-create-image-image_gen.md' },
      { name: 'GPT-5.1 Nerdy', path: '/OpenAI/gpt-5.1-nerdy.md' },
      { name: 'GPT-5.5 API', path: '/OpenAI/gpt-5.5-api.md' },
      { name: 'Tool: Advanced Memory', path: '/OpenAI/tool-advanced-memory.md' },
    ],
  },
  {
    category: 'Anthropic',
    items: [
      { name: 'Claude Sonnet 5', path: '/Anthropic/claude-sonnet-5.md' },
      { name: 'Claude Design (Opus 4.8)', path: '/Anthropic/claude-design.md' },
    ],
  },
  {
    category: 'Microsoft',
    items: [
      { name: 'GitHub Copilot for macOS', path: '/Microsoft/copilot-macos-app.md' },
    ],
  },
];

export default function SystemPromptsLeaksPage() {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans">
      <NavBar />

      <main className="max-w-6xl mx-auto px-4 py-12">
        {/* Hero Section */}
        <section className="text-center mb-16">
          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight mb-6 bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-purple-600">
            System Prompts Leaks
          </h1>
          <p className="text-lg md:text-xl text-gray-600 max-w-3xl mx-auto mb-8">
            The purpose of this repo is to document the System Prompt instructions for all the AI chatbots out there - Claude, ChatGPT, Gemini etc.
          </p>
          
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 max-w-2xl mx-auto mb-8">
            <p className="text-sm text-gray-500 mb-2">📰 As seen in The Washington Post</p>
            <a 
              href="https://wapo.st/49t4gSb" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-800 font-medium underline decoration-blue-300 underline-offset-4"
            >
              See the hidden rules behind AI. Then use them to rewrite this article.
            </a>
            <p className="text-xs text-gray-400 mt-2">(May 11, 2026)</p>
          </div>

          <div className="flex flex-wrap justify-center gap-4 text-sm font-medium">
            <span className="flex items-center gap-2 bg-gray-100 px-3 py-1 rounded-full">
              <span>📅</span> Last Commit: 2026
            </span>
            <span className="flex items-center gap-2 bg-green-100 text-green-800 px-3 py-1 rounded-full">
              <span>🤝</span> PRs Welcome
            </span>
          </div>
        </section>

        {/* Recently Updated Banner */}
        <section className="mb-16 bg-white border-l-4 border-purple-500 p-6 rounded-r-xl shadow-sm">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <span>🆕</span> Recently Updated
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="py-2 px-4 font-semibold text-gray-700">What</th>
                  <th className="py-2 px-4 font-semibold text-gray-700">Date</th>
                  <th className="py-2 px-4 font-semibold text-gray-700">Link</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                <tr className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 px-4 font-medium">Claude Sonnet 5</td>
                  <td className="py-3 px-4 text-gray-500">July 1, 2026</td>
                  <td className="py-3 px-4">
                    <a href="/Anthropic/claude-sonnet-5.md" className="text-blue-600 hover:underline">System prompt</a>
                  </td>
                </tr>
                <tr className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 px-4 font-medium">Claude Design (Opus 4.8)</td>
                  <td className="py-3 px-4 text-gray-500">June 26, 2026</td>
                  <td className="py-3 px-4">
                    <a href="/Anthropic/claude-design.md" className="text-blue-600 hover:underline">System prompt</a>
                  </td>
                </tr>
                <tr className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 px-4 font-medium">GitHub Copilot for macOS</td>
                  <td className="py-3 px-4 text-gray-500">June 18, 2026</td>
                  <td className="py-3 px-4">
                    <a href="/Microsoft/copilot-macos-app.md" className="text-blue-600 hover:underline">System prompt</a>
                  </td>
                </tr>
                <tr className="hover:bg-gray-50">
                  <td className="py-3 px-4 font-medium">GPT-5.5 Codex</td>
                  <td className="py-3 px-4 text-gray-500">June 18, 2026</td>
                  <td className="py-3 px-4">
                    <a href="/OpenAI/Codex/gpt-5.5.md" className="text-blue-600 hover:underline">System prompt</a>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {prompts.map((group) => (
            <div key={group.category} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
              <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-bold text-gray-800">{group.category}</h3>
              </div>
              <div className="p-4 flex-1 flex flex-col gap-2">
                {group.items.map((item) => (
                  <a
                    key={item.name}
                    href={item.path}
                    className="group flex items-center justify-between p-3 rounded-lg hover:bg-blue-50 transition-colors duration-200"
                  >
                    <span className="text-gray-700 group-hover:text-blue-700 font-medium">
                      {item.name}
                    </span>
                    <span className="text-gray-400 group-hover:text-blue-500">→</span>
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <footer className="mt-20 pt-8 border-t border-gray-200 text-center text-gray-500 text-sm">
          <p>© 2026 System Prompts Leaks. All rights reserved.</p>
          <p className="mt-2">
            <a href="https://github.com/asgeirtj/system_prompts_leaks" target="_blank" rel="noopener noreferrer" className="hover:text-gray-900 underline">
              View on GitHub
            </a>
          </p>
        </footer>
      </main>
    </div>
  );
}
```

时间: 2026-07-10T06:32:02.352Z
