'use client';
import { useState, useRef, useEffect } from 'react';

interface Message { role: 'user' | 'assistant'; content: string; isOverview?: boolean; }
interface ModuleInfo { id: string; title: string; description: string; hasRepo: boolean; repoContext: string; repoPath: string; }
interface OverviewData { fileTree: string; keyFiles: { relPath: string; content: string }[]; error?: string; }

export default function TutorPage() {
  const [courses, setCourses] = useState<any[]>([]);
  const [modules, setModules] = useState<ModuleInfo[]>([]);
  const [selectedCourse, setSelectedCourse] = useState('');
  const [selectedModule, setSelectedModule] = useState('');
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewSummary, setOverviewSummary] = useState<string>('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { fetch('/api/self-study/courses').then(r => r.json()).then(d => setCourses(d.courses ?? [])); }, []);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, overviewSummary]);

  const onCourseChange = (courseId: string) => {
    setSelectedCourse(courseId);
    setSelectedModule('');
    setOverview(null);
    setOverviewSummary('');
    setMessages([]);
    if (courseId) {
      fetch(`/api/self-study/courses/${courseId}`).then(r => r.json()).then(d => setModules(d.modules ?? []));
    } else {
      setModules([]);
    }
  };

  const onModuleSelect = async (moduleId: string) => {
    setSelectedModule(moduleId);
    setMessages([]);
    setOverviewSummary('');

    // Check if module has repo
    const mod = modules.find(m => m.id === moduleId);
    if (!mod?.hasRepo) {
      setOverview(null);
      setMessages([{ role: 'assistant', content: `👋 开始学习「${mod?.title}」！你可以向我提问任何相关问题。` }]);
      return;
    }

    // Load overview
    setOverview(null);
    setOverviewSummary('');
    setOverviewLoading(true);
    setMessages([{ role: 'assistant', content: `🔍 正在分析「${mod.title}」的代码架构...` }]);

    try {
      const courseId = mod.id.split('-').slice(0, -1).join('-');
      const res = await fetch(`/api/self-study/courses/${courseId}/overview`);
      const data = await res.json();
      const overviewMod = data.modules?.find((m: ModuleInfo) => m.id === moduleId);

      if (overviewMod?.error) {
        setMessages([{ role: 'assistant', content: `⚠️ ${overviewMod.error}` }]);
        setOverviewLoading(false);
        return;
      }

      // Call AI to generate architecture overview
      const overviewData: OverviewData = { fileTree: overviewMod.fileTree ?? '', keyFiles: overviewMod.keyFiles ?? [] };
      setOverview(overviewData);

      const overviewPrompt = `你是一个代码架构导师。请根据以下项目文件结构，生成一份学习概览，用中文回答。

## 📁 文件结构
${overviewData.fileTree.slice(0, 3000)}

## 📄 关键代码文件
${overviewData.keyFiles.map(kf => `### ${kf.relPath}\n\`\`\`\n${kf.content.slice(0, 2000)}\n\`\`\``).join('\n\n')}

请包含：
1. **架构总览** — 这个模块/目录的职责是什么，采用了什么设计模式/架构风格
2. **核心文件解析** — 每个关键文件的作用、关键函数/类的说明
3. **学习路线** — 建议怎么逐步阅读这些代码，关注哪些入口
4. **动手练习** — 给出一个能理解这个架构的小练习`;

      const aiRes = await fetch('/api/ai/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: overviewPrompt, mode: 'quick' }),
      });
      const aiData = await aiRes.json();
      const summary = aiData.answer || aiData.response || '无法生成概览。';
      setOverviewSummary(summary);
      setMessages([{ role: 'assistant', content: '', isOverview: true }]);
    } catch {
      setMessages([{ role: 'assistant', content: '⚠️ 代码概览生成失败，请重试。' }]);
    } finally {
      setOverviewLoading(false);
    }
  };

  const send = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setLoading(true);

    try {
      const mod = modules.find(m => m.id === selectedModule);
      let codeContext = '';

      // If module has repo and we have code overview, attach relevant code
      if (mod?.hasRepo && overview) {
        codeContext = `## 当前学习的代码仓库上下文\n模块：${mod.title}\n路径：${mod.repoPath}\n\n相关文件：\n${
          overview.keyFiles.map(kf => `### ${kf.relPath}\n\`\`\`\n${kf.content.slice(0, 1500)}\n\`\`\``).join('\n\n')
        }`;
      }

      const question = `${codeContext ? `${codeContext}\n\n---\n\n` : ''}用户问题：${userMsg}`;

      const res = await fetch('/api/ai/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, mode: 'quick' }),
      });
      const data = await res.json();
      const answer = data.answer ?? data.response ?? '抱歉，无法回答。';
      setMessages(prev => [...prev, { role: 'assistant', content: answer }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: '⚠️ 网络错误，请重试。' }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  return (
    <div className="mx-auto flex h-[calc(100vh-8rem)] max-w-4xl flex-col p-4 sm:p-6">
      {/* Top controls */}
      <div className="mb-4 grid gap-2 sm:grid-cols-3">
        <select value={selectedCourse} onChange={e => onCourseChange(e.target.value)}
          className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm">
          <option value="">📚 选择课程</option>
          {courses.map((c: any) => <option key={c.id} value={c.id}>{c.icon} {c.title}</option>)}
        </select>
        <select value={selectedModule} onChange={e => onModuleSelect(e.target.value)} disabled={!selectedCourse}
          className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm">
          <option value="">📖 选择章节</option>
          {modules.map((m: ModuleInfo) => (
            <option key={m.id} value={m.id}>
              {m.hasRepo ? '📂' : '📝'} {m.title}
            </option>
          ))}
        </select>
        {overview && (
          <div className="flex items-center gap-2 rounded-xl bg-teal-50 border border-teal-200 px-3 py-2 text-xs text-teal-700">
            <span>🔗</span>
            <span className="truncate">{modules.find(m => m.id === selectedModule)?.repoPath}</span>
          </div>
        )}
      </div>

      {/* Overview display */}
      {overviewSummary && (
        <div className="mb-4 rounded-2xl border border-teal-200 bg-teal-50 p-4 text-sm leading-relaxed text-stone-700">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-lg">🏗️</span>
            <span className="font-bold text-teal-800">代码架构概览</span>
          </div>
          <div className="prose prose-sm max-w-none space-y-1">
            {overviewSummary.split('\n').map((line, i) => {
              if (line.startsWith('**') && line.endsWith('**')) return <div key={i} className="font-bold text-stone-800 mt-3 mb-1">{line.slice(2, -2)}</div>;
              if (line.trim().startsWith('-')) return <div key={i} className="ml-2 text-stone-600">• {line.trim().slice(1).trim()}</div>;
              if (line.trim() === '') return <div key={i} className="h-1" />;
              return <div key={i} className="text-stone-600">{line}</div>;
            })}
          </div>
          <div className="mt-3 text-xs text-teal-600">学习了代码概览后，你可以在下面提问细节</div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 space-y-4 overflow-y-auto rounded-2xl border border-stone-200 bg-stone-50 p-4">
        {overviewLoading && (
          <div className="flex items-center gap-3 rounded-2xl bg-teal-50 border border-teal-200 px-5 py-4">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
            <div className="text-sm text-teal-700">正在分析代码结构 ...</div>
          </div>
        )}

        {messages.length === 0 && !overviewLoading && (
          <div className="flex flex-col items-center justify-center py-12 text-stone-400">
            <div className="text-4xl mb-3">🤖</div>
            <div className="text-sm">选择一个课程和章节开始学习</div>
            <div className="mt-2 text-xs">带 📂 的章节会先分析代码结构给你看</div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
              msg.role === 'user'
                ? 'bg-teal-600 text-white'
                : msg.isOverview ? ''
                : 'bg-white border border-stone-200 text-stone-700'
            }`}>
              {msg.content.split('\n').map((line, j) => (
                <div key={j} className={line.trim() ? '' : 'h-1'}>{line}</div>
              ))}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="rounded-2xl bg-white border border-stone-200 px-4 py-3 text-sm text-stone-400">
              <span className="animate-pulse">思考中...</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      {selectedModule && (
        <div className="mt-4 flex gap-2">
          <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKey}
            placeholder="提问代码细节... (Shift+Enter 换行)" rows={1}
            className="flex-1 resize-none rounded-2xl border border-stone-300 bg-white px-4 py-3 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500" />
          <button onClick={send} disabled={loading || !input.trim()}
            className="rounded-2xl bg-teal-600 px-6 py-3 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50">
            发送
          </button>
        </div>
      )}
    </div>
  );
}