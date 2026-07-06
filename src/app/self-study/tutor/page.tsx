'use client';
import { useState, useRef, useEffect, Suspense } from 'react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Message { role: 'user' | 'assistant'; content: string; is_socratic?: boolean; }
interface CourseInfo { id: string; title: string; icon: string; }
interface ModuleInfo { id: string; title: string; description: string; content?: string; }
interface SessionInfo { id: string; module_id: string; mastery_score: number; message_count: number; current_topic: string; }

// Markdown renderer (matches course detail page style)
function MarkdownContent({ text }: { text: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h2: ({ children }) => <h2 className="text-base font-bold text-stone-800 mt-4 mb-1.5">{children}</h2>,
        h3: ({ children }) => <h3 className="text-sm font-semibold text-stone-700 mt-3 mb-1">{children}</h3>,
        p: ({ children }) => <p className="text-sm text-stone-700 leading-relaxed mb-2">{children}</p>,
        li: ({ children }) => <li className="text-sm text-stone-600 ml-4 list-disc mb-0.5">{children}</li>,
        table: ({ children }) => (
          <div className="overflow-x-auto my-2">
            <table className="min-w-full text-xs border-collapse">{children}</table>
          </div>
        ),
        th: ({ children }) => <th className="bg-stone-100 text-stone-600 px-2 py-1.5 text-left font-medium border border-stone-200">{children}</th>,
        td: ({ children }) => <td className="px-2 py-1.5 border border-stone-200 text-stone-600">{children}</td>,
        strong: ({ children }) => <strong className="font-semibold text-stone-800">{children}</strong>,
        code: ({ children }) => <code className="bg-stone-100 text-teal-700 px-1 py-0.5 rounded text-xs font-mono">{children}</code>,
        blockquote: ({ children }) => <blockquote className="border-l-3 border-teal-300 pl-3 text-stone-500 italic">{children}</blockquote>,
        hr: () => <hr className="border-stone-200 my-2" />,
      }}
    >
      {text}
    </ReactMarkdown>
  );
}

function TutorContent() {
  const [courses, setCourses] = useState<CourseInfo[]>([]);
  const [modules, setModules] = useState<ModuleInfo[]>([]);
  const [selectedCourse, setSelectedCourse] = useState('');
  const [selectedModule, setSelectedModule] = useState('');
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [mastery, setMastery] = useState(0);
  const [showTip, setShowTip] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Load courses
  useEffect(() => {
    fetch('/api/self-study/courses?category=english').then(r => r.json()).then(d => {
      const cs = d.courses ?? [];
      setCourses(cs);
      if (cs.length > 0) {
        const eng = cs.find((c: any) => c.id === 'eng-101') || cs[0];
        onCourseChange(eng.id);
      }
    });
  }, []);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // Load session history
  const loadHistory = async (sid: string, existingMessages?: Message[]) => {
    try {
      const res = await fetch(`/api/tutor/session/history?session_id=${sid}`);
      if (res.ok) {
        const data = await res.json();
        if (data.messages && data.messages.length > 0) {
          setMessages(data.messages.map((m: any) => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
            is_socratic: Boolean(m.is_socratic),
          })));
          return;
        }
      }
    } catch {}
    if (existingMessages && existingMessages.length === 0) {
      setMessages([{
        role: 'assistant',
        content: `👋 你好！我是 **小萨（Sarah）**，你的英语导师。\n\n我们正在学习 **00015 自考英语（一）**，相当于 CET-4 水平。\n\n**我的教学方式是苏格拉底式提问** ——我不会直接告诉你答案，而是通过提问引导你自己发现。\n\n可以问我：语法问题、词汇用法、阅读技巧、写作思路，或说"Let&apos;s practice"开始做题。\n\n准备好了吗？我们开始吧！🎯`,
        is_socratic: true,
      }]);
    }
  };

  // Create or resume session
  const ensureSession = async (courseId: string, moduleId?: string, existingMessages?: Message[]) => {
    try {
      const res = await fetch(`/api/tutor/session?course_id=${courseId}`);
      const data = await res.json();
      const sessions: SessionInfo[] = data.sessions ?? [];
      const active = sessions.find(s => !moduleId || s.module_id === moduleId);
      if (active) {
        setSessionId(active.id);
        setMastery(active.mastery_score ?? 0);
        await loadHistory(active.id, existingMessages);
        return;
      }
    } catch {}
    // Create new session
    try {
      const res = await fetch('/api/tutor/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseId, moduleId: moduleId || null }),
      });
      const data = await res.json();
      if (data.id) {
        setSessionId(data.id);
        setMastery(0);
        if (!existingMessages || existingMessages.length === 0) {
          setMessages([{
            role: 'assistant',
            content: `👋 你好！我是 **小萨（Sarah）**，你的英语导师。\n\n我们正在学习 **00015 自考英语（一）**，相当于 CET-4 水平。\n\n**我的教学方式是苏格拉底式提问** ——我不会直接告诉你答案，而是通过提问引导你自己发现。\n\n可以问我：语法问题、词汇用法、阅读技巧、写作思路，或说"Let's practice"开始做题。\n\n准备好了吗？我们开始吧！🎯`,
            is_socratic: true,
          }]);
        }
      }
    } catch (e) {
      console.error(e);
      setError('创建学习会话失败，请刷新重试。');
    }
  };

  const onCourseChange = (courseId: string) => {
    setSelectedCourse(courseId);
    setSelectedModule('');
    setMessages([]);
    setSessionId(null);
    setMastery(0);
    setError(null);
    fetch(`/api/self-study/courses/${courseId}`).then(r => r.json()).then(d => {
      const mods = d.modules ?? [];
      setModules(mods);
      ensureSession(courseId);
    });
  };

  const onModuleChange = (moduleId: string) => {
    setSelectedModule(moduleId);
    const mod = modules.find(m => m.id === moduleId);
    setMessages([]);
    ensureSession(selectedCourse, moduleId);
    if (mod) {
      setMessages([{
        role: 'assistant',
        content: `📖 现在我们进入 **${mod.title}** 模块。\n\n${mod.description}\n\n开始前，可以：说"给我讲讲重点"，说"Let's practice"开始做题，或直接问任何相关问题。`,
        is_socratic: true,
      }]);
    }
  };

  const send = async () => {
    if (!input.trim() || loading) return;
    if (!sessionId) { setError('请先选择一个课程'); return; }
    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/tutor/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, message: userMsg }),
      });
      const data = await res.json();
      if (data.error) {
        setMessages(prev => [...prev, { role: 'assistant', content: `⚠️ ${data.error}` }]);
      } else {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: data.answer ?? '抱歉，出了一点问题，请重试。',
          is_socratic: true,
        }]);
        if (data.mastery !== undefined) setMastery(data.mastery);
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: '⚠️ 网络错误，请重试。' }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const currentCourse = courses.find(c => c.id === selectedCourse);
  const currentModule = modules.find(m => m.id === selectedModule);
  const masteryColor = mastery < 30 ? '#ef4444' : mastery < 70 ? '#f59e0b' : '#22c55e';
  const masteryLabel = mastery < 30 ? '初学者' : mastery < 70 ? '进阶中' : '已掌握';

  return (
    <div className="mx-auto flex h-[calc(100vh-8rem)] max-w-4xl flex-col p-4 sm:p-6 gap-3">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-teal-400 to-blue-500 flex items-center justify-center text-white font-bold text-lg shadow">萨</div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-stone-800">Sarah 小萨</h1>
              <span className="text-xs bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full">苏格拉底导师</span>
            </div>
            <p className="text-xs text-stone-500">
              {currentCourse ? `${currentCourse.icon} ${currentCourse.title}` : '选择课程'}
              {currentModule ? ` › ${currentModule.title}` : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {sessionId && (
            <div className="text-right">
              <div className="text-xs text-stone-500">掌握度</div>
              <div className="flex items-center gap-1.5">
                <div className="w-20 h-1.5 bg-stone-200 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${mastery}%`, backgroundColor: masteryColor }} />
                </div>
                <span className="text-xs font-medium" style={{ color: masteryColor }}>{masteryLabel}</span>
              </div>
            </div>
          )}
          <button onClick={() => setShowTip(t => !t)}
            className="text-xs text-teal-600 hover:text-teal-700 border border-teal-200 rounded-lg px-2 py-1">
            ? 苏格拉底法
          </button>
        </div>
      </div>

      {/* Tip banner */}
      {showTip && (
        <div className="bg-gradient-to-r from-teal-50 to-blue-50 border border-teal-200 rounded-xl p-3 text-xs text-stone-600">
          <b>🔍 苏格拉底式教学法：</b>导师通过提问引导学习者自己发现答案。答对→深化追问；答错→反问引导；三次失败后才做解释。
          <button onClick={() => setShowTip(false)} className="ml-2 text-teal-500 hover:underline">收起</button>
        </div>
      )}

      {/* Selectors */}
      <div className="grid gap-2 sm:grid-cols-2">
        <select value={selectedCourse} onChange={e => onCourseChange(e.target.value)}
          className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm focus:border-teal-400 focus:outline-none focus:ring-1 focus:ring-teal-400">
          <option value="">📚 选择课程</option>
          {courses.map(c => <option key={c.id} value={c.id}>{c.icon} {c.title}</option>)}
        </select>
        <select value={selectedModule} onChange={e => onModuleChange(e.target.value)}
          disabled={!selectedCourse || modules.length === 0}
          className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm focus:border-teal-400 focus:outline-none focus:ring-1 focus:ring-teal-400 disabled:opacity-50">
          <option value="">📖 综合问答（全模块）</option>
          {modules.map(m => <option key={m.id} value={m.id}>📝 {m.title}</option>)}
        </select>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-2 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-3 rounded-2xl border border-stone-200 bg-stone-50 p-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-stone-400">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-teal-300 to-blue-400 flex items-center justify-center text-white text-2xl font-bold mb-3">萨</div>
            <div className="text-sm font-medium text-stone-500">小萨在等你提问</div>
            <div className="mt-2 text-xs text-center px-6 text-stone-400 space-y-1">
              <p>她会通过提问引导你思考</p>
              <p>不会直接给答案，但会陪你一步步理解</p>
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
              msg.role === 'user'
                ? 'bg-teal-600 text-white rounded-br-md'
                : msg.is_socratic
                  ? 'bg-white border border-teal-100 text-stone-700 rounded-bl-md shadow-sm'
                  : 'bg-stone-100 text-stone-700 rounded-bl-md'
            }`}>
              {msg.role === 'assistant' && (
                <div className="text-xs text-teal-500 font-medium mb-1.5 flex items-center gap-1 border-b border-stone-100 pb-1">
                  <span>萨</span>
                  {msg.is_socratic && <span className="text-teal-300">· 苏格拉底</span>}
                </div>
              )}
              {msg.role === 'assistant' ? (
                <MarkdownContent text={msg.content} />
              ) : (
                msg.content.split('\n').map((line, j) => (
                  <div key={j} className={line.trim() ? 'text-sm' : 'h-1'}>{line}</div>
                ))
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="rounded-2xl bg-white border border-stone-200 px-4 py-3 rounded-bl-md">
              <span className="flex items-center gap-2">
                {[0, 150, 300].map(delay => (
                  <span key={delay} className="w-2 h-2 bg-teal-400 rounded-full animate-bounce" style={{ animationDelay: `${delay}ms` }} />
                ))}
              </span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      {sessionId && (
        <div className="flex gap-2 items-end">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="用中文或英文提问，小萨会引导你思考..."
            rows={1}
            className="flex-1 resize-none rounded-2xl border border-stone-300 bg-white px-4 py-3 text-sm focus:border-teal-400 focus:outline-none focus:ring-1 focus:ring-teal-400 placeholder:text-stone-400"
            style={{ minHeight: '48px', maxHeight: '120px' }}
          />
          <button onClick={send} disabled={loading || !input.trim()}
            className="rounded-2xl bg-teal-600 px-5 py-3 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50 transition-colors flex items-center gap-1.5">
            发送
          </button>
        </div>
      )}
    </div>
  );
}

export default function TutorPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64 text-stone-400">加载中...</div>}>
      <TutorContent />
    </Suspense>
  );
}