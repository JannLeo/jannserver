'use client';
import { useState, useRef, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Message { role: 'user' | 'assistant'; content: string; }
interface CourseInfo { id: string; title: string; icon: string; }
interface ModuleInfo { id: string; title: string; description: string; content?: string; }
function TutorContent() {
  const searchParams = useSearchParams();
  const courseIdParam = searchParams.get('courseId') ?? '';

  const [courses, setCourses] = useState<CourseInfo[]>([]);
  const [modules, setModules] = useState<ModuleInfo[]>([]);
  const [selectedCourse, setSelectedCourse] = useState('');
  const [selectedModule, setSelectedModule] = useState('');
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Load courses
  useEffect(() => {
    fetch('/api/self-study/courses').then(r => r.json()).then(d => setCourses(d.courses ?? []));
  }, []);

  // Auto-select course from URL param
  useEffect(() => {
    if (courseIdParam && courses.length > 0) {
      const found = courses.find(c => c.id === courseIdParam);
      if (found) {
        setSelectedCourse(found.id);
        fetch(`/api/self-study/courses/${found.id}`)
          .then(r => r.json())
          .then(d => {
            const mods: ModuleInfo[] = (d.modules ?? []).map((m: any) => ({
              id: m.id, title: m.title, description: m.description ?? '',
              hasRepo: false, repoContext: '', repoPath: '',
              content: m.content ?? '',
            }));
            setModules(mods);
            // Auto-select first module and show welcome message
            if (mods.length > 0) {
              const firstMod = mods[0];
              setSelectedModule(firstMod.id);
              setMessages([{
                role: 'assistant',
                content: `👋 欢迎学习「${found.title}」！\n\n我现在已经了解这门课程的全部内容，你可以直接向我提问。例如：\n• "请解释这节课的重点语法"\n• "给我出几道练习题"\n• "这个词怎么记忆？"\n• "这个时态有什么用法？"\n\n输入你的问题开始吧！`,
              }]);
            }
          });
      }
    }
  }, [courseIdParam, courses]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const onCourseChange = (courseId: string) => {
    setSelectedCourse(courseId);
    setSelectedModule('');
    setModules([]);
    setMessages([]);
    if (courseId) {
      fetch(`/api/self-study/courses/${courseId}`).then(r => r.json()).then(d => {
        const mods: ModuleInfo[] = (d.modules ?? []).map((m: any) => ({
          id: m.id, title: m.title, description: m.description ?? '',
          hasRepo: false, repoContext: '', repoPath: '',
          content: m.content ?? '',
        }));
        setModules(mods);
        const course = (d.courses ?? []).find((c: any) => c.id === courseId) || { title: '该课程' };
        setMessages([{
          role: 'assistant',
          content: `👋 欢迎学习「${course.title}」！直接提问吧，我来帮你掌握这门课程。`,
        }]);
      });
    }
  };

  const send = async () => {
    if (!input.trim() || loading) return;
    if (!selectedCourse) return;
    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setLoading(true);

    try {
      const course = courses.find(c => c.id === selectedCourse);
      const mod = modules.find(m => m.id === selectedModule);

      // Build rich context: course name + module content
      let courseContext = `## 当前课程：${course?.icon ?? ''} ${course?.title ?? selectedCourse}`;
      if (mod?.content) {
        courseContext += `\n## 当前章节：${mod.title}\n${mod.content}`;
      } else if (modules.length > 0) {
        // Include all modules as context if no specific module selected
        const allContent = modules.map(m => `### ${m.title}\n${m.content ?? ''}`).join('\n\n');
        courseContext += `\n## 全部章节内容：\n${allContent}`;
      }

      const question = `${courseContext}\n\n---\n\n用户问题：${userMsg}`;

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

  const currentCourse = courses.find(c => c.id === selectedCourse);

  return (
    <div className="mx-auto flex h-[calc(100vh-8rem)] max-w-4xl flex-col p-4 sm:p-6">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-stone-800">🤖 AI 导师</h1>
          <p className="text-xs text-stone-500 mt-0.5">
            {currentCourse ? `正在学习：${currentCourse.icon} ${currentCourse.title}` : '选择一个课程开始学习'}
          </p>
        </div>
        <Link href="/self-study/courses" className="text-xs text-teal-600 hover:underline">← 返回课程</Link>
      </div>

      {/* Course/Module selectors */}
      <div className="mb-3 grid gap-2 sm:grid-cols-2">
        <select value={selectedCourse} onChange={e => onCourseChange(e.target.value)}
          className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm">
          <option value="">📚 选择课程</option>
          {courses.map(c => <option key={c.id} value={c.id}>{c.icon} {c.title}</option>)}
        </select>
        <select value={selectedModule} onChange={e => setSelectedModule(e.target.value)}
          disabled={!selectedCourse || modules.length === 0}
          className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm">
          <option value="">📖 全部章节（综合问答）</option>
          {modules.map(m => (
            <option key={m.id} value={m.id}>📝 {m.title}</option>
          ))}
        </select>
      </div>

      {/* Messages */}
      <div className="flex-1 space-y-4 overflow-y-auto rounded-2xl border border-stone-200 bg-stone-50 p-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-stone-400">
            <div className="text-4xl mb-3">🤖</div>
            <div className="text-sm">选择一个课程，然后输入你的问题</div>
            <div className="mt-2 text-xs text-center px-4 text-stone-400">
              AI 会根据课程内容为你解答
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
              msg.role === 'user'
                ? 'bg-teal-600 text-white'
                : 'bg-white border border-stone-200 text-stone-700'
            }`}>
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                className="prose prose-sm max-w-none prose-stone"
              >
                {msg.content}
              </ReactMarkdown>
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
      {selectedCourse && (
        <div className="mt-3 flex gap-2">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder={currentCourse ? `关于「${currentCourse.title}」提问...` : '输入你的问题...'}
            rows={1}
            className="flex-1 resize-none rounded-2xl border border-stone-300 bg-white px-4 py-3 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
          />
          <button onClick={send} disabled={loading || !input.trim()}
            className="rounded-2xl bg-teal-600 px-6 py-3 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50">
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