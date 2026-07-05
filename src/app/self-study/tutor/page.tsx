'use client';
import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';

interface Message { role: 'user' | 'assistant'; content: string; }

const COURSE_HINTS: Record<string, string> = {
  'py-101': 'Python 编程',
  'web-101': 'Web 开发',
  'algo-101': '算法与数据结构',
  'ml-101': '机器学习',
  'linux-101': 'Linux 系统管理',
};

export default function TutorPage() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: '👋 我是你的 AI 学习导师！可以问我任何问题，比如：\n\n• 解释一个概念\n• 出一道练习题\n• 分析一段代码\n• 帮你理解某个知识点\n\n选择一个课程上下文可以让我更好地帮助你！' }
  ]);
  const [loading, setLoading] = useState(false);
  const [courseContext, setCourseContext] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setLoading(true);

    try {
      const res = await fetch('/api/ai/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: `${courseContext ? `【${COURSE_HINTS[courseContext] ?? ''}相关】` : ''}${userMsg}`,
          mode: 'quick',
        }),
      });
      const data = await res.json();
      const answer = data.answer ?? data.response ?? data.result ?? '抱歉，我暂时无法回答这个问题。';
      setMessages(prev => [...prev, { role: 'assistant', content: answer }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: '⚠️ 网络错误，请重试。' }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="mx-auto flex h-[calc(100vh-8rem)] max-w-3xl flex-col p-4 sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-stone-800">🤖 AI 导师</h1>
          <p className="text-sm text-stone-400">基于知识库的智能学习问答</p>
        </div>
        {/* Course context */}
        <select value={courseContext} onChange={e => setCourseContext(e.target.value)}
          className="rounded-xl border border-stone-200 bg-white px-3 py-1.5 text-sm text-stone-600">
          <option value="">通用问答</option>
          <option value="py-101">Python 入门</option>
          <option value="web-101">Web 开发基础</option>
          <option value="algo-101">算法与数据结构</option>
          <option value="ml-101">机器学习基础</option>
          <option value="linux-101">Linux 系统管理</option>
        </select>
      </div>

      {/* Messages */}
      <div className="flex-1 space-y-4 overflow-y-auto rounded-2xl border border-stone-200 bg-stone-50 p-4">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
              msg.role === 'user'
                ? 'bg-teal-600 text-white'
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
      <div className="mt-4 flex gap-2">
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="输入你的问题... (Shift+Enter 换行)"
          rows={1}
          className="flex-1 resize-none rounded-2xl border border-stone-300 bg-white px-4 py-3 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
        />
        <button onClick={send} disabled={loading || !input.trim()}
          className="rounded-2xl bg-teal-600 px-6 py-3 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50">
          发送
        </button>
      </div>

      {/* Quick questions */}
      <div className="mt-3 flex flex-wrap gap-2">
        {['解释什么是 Big-O 复杂度', 'Python 中的 list 和 tuple 有什么区别', '帮我出一道算法练习题'].map(q => (
          <button key={q} onClick={() => { setInput(q); }}
            className="rounded-full border border-stone-300 bg-white px-3 py-1 text-xs text-stone-500 hover:bg-stone-50 hover:border-stone-400">
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}