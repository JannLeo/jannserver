'use client';
import { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

function renderMarkdown(text: string | null | undefined) {
  if (!text) return '';
  return text
    .split('\n')
    .map(line => {
      if (line.startsWith('### ')) return `<h3 class="text-base font-bold text-stone-700 mt-4 mb-1">${line.slice(4)}</h3>`;
      if (line.startsWith('## ')) return `<h2 class="text-lg font-bold text-stone-800 mt-5 mb-2">${line.slice(3)}</h2>`;
      if (line.startsWith('| ')) {
        if (line.includes('---')) return '';
        return `<tr class="border-b border-stone-200">${line.split('|').filter(Boolean).map(c => `<td class="px-3 py-1.5 text-sm">${c.trim()}</td>`).join('')}</tr>`;
      }
      if (line.startsWith('```')) {
        const lang = line.slice(3).trim();
        return `<pre class="bg-stone-900 text-stone-100 rounded-xl p-4 my-3 overflow-x-auto text-sm"><code class="language-${lang}">`;
      }
      if (line === '```') return '</code></pre>';
      if (line.startsWith('- ') || line.startsWith('* ')) return `<li class="text-sm text-stone-600 ml-4 list-disc">${line.slice(2)}</li>`;
      if (line.match(/^\d+\. /)) return `<li class="text-sm text-stone-600 ml-4 list-decimal">${line.replace(/^\d+\. /, '')}</li>`;
      if (line.trim() === '') return '<br/>';
      return `<p class="text-sm text-stone-600 leading-relaxed">${line}</p>`;
    })
    .join('\n');
}

const DIFFICULTY_LABELS: Record<string, string> = { beginner: '入门', intermediate: '进阶', advanced: '高级' };

// ---- Exercise component ----
function ExerciseSection({ moduleId }: { moduleId: string }) {
  const [exercises, setExercises] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState<Record<string, boolean>>({});
  const [score, setScore] = useState<{ correct: number; total: number } | null>(null);

  useEffect(() => {
    setLoading(true);
    setAnswers({});
    setSubmitted({});
    setScore(null);
    fetch(`/api/self-study/exercises?module_id=${moduleId}&limit=5`).then(r => r.json()).then(d => {
      setExercises(d.exercises ?? []);
      setLoading(false);
    });
  }, [moduleId]);

  if (loading) return <div className="text-xs text-stone-400 py-2">加载题目中...</div>;
  if (exercises.length === 0) return <div className="text-xs text-stone-400 py-2">暂无题目</div>;

  const submitAll = () => {
    let correct = 0;
    const newSubmitted: Record<string, boolean> = {};
    exercises.forEach(e => {
      newSubmitted[e.id] = true;
      if (answers[e.id] === e.correct_answer) correct++;
    });
    setSubmitted(newSubmitted);
    setScore({ correct, total: exercises.length });
  };

  const resetAll = () => {
    setAnswers({});
    setSubmitted({});
    setScore(null);
  };

  return (
    <div className="mt-3 border-t border-stone-200 pt-3">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-semibold text-stone-700">📝 练习</h4>
        {score && (
          <span className={`text-xs font-bold ${score.correct >= score.total * 0.6 ? 'text-green-600' : 'text-amber-600'}`}>
            {score.correct}/{score.total} 正确 ({score.total > 0 ? Math.round(score.correct/score.total*100) : 0}%)
          </span>
        )}
      </div>

      {exercises.map((ex, i) => {
        const isCorrect = submitted[ex.id] && answers[ex.id] === ex.correct_answer;
        const isWrong = submitted[ex.id] && answers[ex.id] !== ex.correct_answer;
        const optLabels = ['A', 'B', 'C', 'D'];

        return (
          <div key={ex.id} className={`mb-3 rounded-xl border p-3 text-sm transition ${
            submitted[ex.id] ? (isCorrect ? 'border-green-300 bg-green-50' : 'border-red-200 bg-red-50') : 'border-stone-200 bg-white'
          }`}>
            <div className="font-medium text-stone-700 mb-2">
              {i+1}. {ex.question}
            </div>
            <div className="space-y-1.5">
              {ex.options.map((opt: string, j: number) => {
                const label = optLabels[j] || String.fromCharCode(65 + j);
                const selected = answers[ex.id] === label;
                const isAnswer = ex.correct_answer === label;
                let btnClass = 'border-stone-200 hover:bg-stone-50 text-stone-600';
                if (submitted[ex.id]) {
                  if (isAnswer) btnClass = 'border-green-400 bg-green-100 text-green-800';
                  else if (selected && !isAnswer) btnClass = 'border-red-400 bg-red-100 text-red-700';
                  else btnClass = 'border-stone-200 text-stone-400';
                } else if (selected) {
                  btnClass = 'border-teal-400 bg-teal-50 text-teal-700';
                }
                return (
                  <button key={j} onClick={() => !submitted[ex.id] && setAnswers(a => ({...a, [ex.id]: label}))}
                    disabled={!!submitted[ex.id]}
                    className={`block w-full text-left rounded-lg border px-3 py-1.5 text-xs transition disabled:cursor-default ${btnClass}`}>
                    <span className="font-mono mr-2">{label}.</span> {opt}
                  </button>
                );
              })}
            </div>
            {submitted[ex.id] && (
              <div className="mt-1.5 text-xs text-stone-500 bg-stone-50 rounded-lg px-2 py-1">
                {isCorrect ? '✅ 正确！' : `❌ 正确答案：${ex.correct_answer}`}
                {ex.explanation && <span className="ml-1">— {ex.explanation}</span>}
              </div>
            )}
          </div>
        );
      })}

      <div className="flex gap-2">
        {!score ? (
          <button onClick={submitAll} disabled={Object.keys(answers).length !== exercises.length}
            className="rounded-lg bg-amber-500 px-4 py-1.5 text-xs font-medium text-white hover:bg-amber-600 disabled:opacity-50">
            提交答案
          </button>
        ) : (
          <button onClick={resetAll}
            className="rounded-lg border border-stone-300 px-4 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-50">
            换一批题目
          </button>
        )}
      </div>
    </div>
  );
}

// ---- Inline AI Tutor Chat ----
function TutorChat({ moduleId, courseId }: { moduleId: string; courseId: string }) {
  const [messages, setMessages] = useState<{role: string; content: string}[]>([
    { role: 'assistant', content: '👋 我是小萨！关于这个模块的内容，可以问我任何问题，我会通过提问引导你思考。' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // Ensure session exists
  useEffect(() => {
    fetch(`/api/tutor/session?course_id=${courseId}`).then(r => r.json()).then(d => {
      const sessions = d.sessions ?? [];
      const active = sessions.find((s: any) => s.module_id === moduleId);
      setSessionId(active?.id ?? null);
    });
  }, [moduleId, courseId]);

  const send = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setLoading(true);

    try {
      // Create session if needed
      let sid = sessionId;
      if (!sid) {
        const res = await fetch('/api/tutor/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ courseId, moduleId }),
        });
        const data = await res.json();
        sid = data.id;
        setSessionId(sid);
      }

      const res = await fetch('/api/tutor/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sid, message: userMsg }),
      });
      const data = await res.json();
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.answer ?? '抱歉，出了一点问题。'
      }]);
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
    <div className="mt-3 border border-stone-200 rounded-2xl overflow-hidden">
      <div className="flex items-center gap-2 bg-gradient-to-r from-teal-50 to-blue-50 border-b border-stone-200 px-3 py-2">
        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-teal-400 to-blue-500 flex items-center justify-center text-white font-bold text-xs">萨</div>
        <span className="text-xs font-semibold text-stone-700">小萨 AI 导师</span>
        <span className="text-xs text-stone-400">· 苏格拉底提问法</span>
      </div>

      <div className="max-h-48 overflow-y-auto bg-stone-50 p-3 space-y-2">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
              msg.role === 'user'
                ? 'bg-teal-600 text-white rounded-br-sm'
                : 'bg-white border border-stone-100 text-stone-600 rounded-bl-sm shadow-sm'
            }`}>
              {msg.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-white border border-stone-100 rounded-xl px-3 py-2 text-xs text-stone-400">
              <span className="flex gap-1 items-center">
                <span className="w-1.5 h-1.5 bg-teal-400 rounded-full animate-bounce" />
                <span className="w-1.5 h-1.5 bg-teal-400 rounded-full animate-bounce" style={{animationDelay:'150ms'}} />
                <span className="w-1.5 h-1.5 bg-teal-400 rounded-full animate-bounce" style={{animationDelay:'300ms'}} />
              </span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="flex gap-1.5 border-t border-stone-200 p-2 bg-white">
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKey}
          placeholder="问小萨关于本模块的问题..."
          className="flex-1 rounded-lg border border-stone-300 px-3 py-1.5 text-xs focus:border-teal-400 focus:outline-none focus:ring-1 focus:ring-teal-400 placeholder:text-stone-400"
        />
        <button onClick={send} disabled={loading || !input.trim()}
          className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700 disabled:opacity-50">
          发送
        </button>
      </div>
    </div>
  );
}

// ---- Main Page ----
export default function CourseDetailPage() {
  const params = useParams();
  const courseId = params.id as string;
  const [course, setCourse] = useState<any>(null);
  const [modules, setModules] = useState<any[]>([]);
  const [stats, setStats] = useState({ total: 0, completed: 0, progress: 0 });
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [showExercises, setShowExercises] = useState<Record<string, boolean>>({});
  const [showTutor, setShowTutor] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetch(`/api/self-study/courses/${courseId}`)
      .then(r => {
        if (r.status === 401) { window.location.href = '/login'; return null; }
        return r.json();
      })
      .then(d => {
        if (!d || d.error) { setLoading(false); return; }
        setCourse(d.course);
        setModules(d.modules ?? []);
        setStats(d.stats ?? { total: 0, completed: 0, progress: 0 });
        setLoading(false);
      }).catch(() => setLoading(false));
  }, [courseId]);

  const updateProgress = async (moduleId: string, status: string) => {
    setUpdating(moduleId);
    const payload = status === 'relearn'
      ? { moduleId, courseId, status: 'not_started', masteryScore: 0 }
      : { moduleId, courseId, status, masteryScore: status === 'completed' ? 1 : 0 };
    await fetch('/api/self-study/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const res = await fetch(`/api/self-study/courses/${courseId}`);
    const d = await res.json();
    setModules(d.modules ?? []);
    setStats(d.stats ?? { total: 0, completed: 0, progress: 0 });
    setUpdating(null);
  };

  if (loading) return <div className="flex justify-center py-16"><div className="animate-pulse text-stone-400">加载中...</div></div>;
  if (!course) return <div className="py-16 text-center text-stone-400">课程不存在</div>;

  const statusIcon: Record<string, string> = { completed: '✅', in_progress: '📖', not_started: '⭕' };
  const statusColor: Record<string, string> = { completed: 'bg-green-50 border-green-200', in_progress: 'bg-amber-50 border-amber-200', not_started: 'bg-white border-stone-200' };

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6 space-y-6">
      <Link href="/self-study/courses" className="inline-flex items-center gap-1 text-sm text-stone-400 hover:text-teal-600">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
        返回课程目录
      </Link>

      {/* Course header */}
      <div className="rounded-2xl border border-stone-200 bg-white p-6">
        <div className="flex items-center gap-4">
          <span className="text-4xl">{course.icon}</span>
          <div>
            <h1 className="text-2xl font-bold text-stone-800">{course.title}</h1>
            <div className="mt-1 flex items-center gap-3 text-sm text-stone-500">
              <span>{DIFFICULTY_LABELS[course.difficulty] ?? course.difficulty}</span>
              <span>·</span>
              <span>{stats.total} 个模块</span>
            </div>
          </div>
        </div>
        <p className="mt-4 text-sm text-stone-600">{course.description}</p>
        <div className="mt-5">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-stone-600">学习进度</span>
            <span className="font-bold text-teal-700">{stats.progress}%</span>
          </div>
          <div className="mt-1.5 h-2.5 w-full rounded-full bg-stone-100">
            <div className="h-2.5 rounded-full bg-teal-500 transition-all duration-500" style={{ width: `${stats.progress}%` }} />
          </div>
          <div className="mt-1 text-xs text-stone-400">{stats.completed}/{stats.total} 模块已完成</div>
        </div>
      </div>

      {/* Modules */}
      <div className="space-y-3">
        <h2 className="text-lg font-bold text-stone-700">课程内容</h2>
        {modules.map((mod: any, idx: number) => (
          <div key={mod.id}
            className={`rounded-2xl border ${statusColor[mod.status]} transition overflow-hidden`}>
            <button onClick={() => setExpanded(expanded === mod.id ? null : mod.id)}
              className="flex w-full items-center gap-3 p-4 text-left">
              <span className="flex h-8 w-8 items-center justify-center text-lg">{statusIcon[mod.status] ?? '⭕'}</span>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-stone-700">第 {idx + 1} 章：{mod.title}</div>
                <div className="text-xs text-stone-400 mt-0.5">~{mod.estimatedMinutes} 分钟 · {mod.description}</div>
              </div>
              <div className="flex gap-2 flex-shrink-0 items-center">
                {mod.status !== 'completed' && (
                  <button onClick={(e) => { e.stopPropagation(); updateProgress(mod.id, mod.status === 'completed' ? 'relearn' : 'completed'); }}
                    disabled={updating === mod.id}
                    className="rounded-lg bg-green-100 px-3 py-1 text-xs font-medium text-green-700 hover:bg-green-200 disabled:opacity-50">
                    {updating === mod.id ? '...' : mod.status === 'completed' ? '重新学习' : '标记完成'}
                  </button>
                )}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                  className={`text-stone-400 transition ${expanded === mod.id ? 'rotate-180' : ''}`}>
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </div>
            </button>

            {/* Expanded content */}
            {expanded === mod.id && (
              <div className="border-t border-stone-200 px-4 pb-4 pt-3">
                {/* Module content */}
                <div className="prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(mod.content) }} />

                {/* Action buttons */}
                <div className="mt-4 flex gap-2 flex-wrap">
                  <button onClick={() => updateProgress(mod.id, mod.status === 'completed' ? 'relearn' : 'completed')}
                    className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700">
                    {mod.status === 'completed' ? '↺ 重新学习' : '✅ 标记完成'}
                  </button>
                  <button onClick={() => setShowExercises(e => ({...e, [mod.id]: !e[mod.id]}))}
                    className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                      showExercises[mod.id] ? 'bg-amber-100 text-amber-800 border border-amber-300' : 'bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100'
                    }`}>
                    📝 {showExercises[mod.id] ? '收起练习' : '做练习'}
                  </button>
                  <button onClick={() => setShowTutor(t => ({...t, [mod.id]: !t[mod.id]}))}
                    className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                      showTutor[mod.id] ? 'bg-teal-100 text-teal-800 border border-teal-300' : 'bg-teal-50 text-teal-700 border border-teal-200 hover:bg-teal-100'
                    }`}>
                    🤖 {showTutor[mod.id] ? '收起导师' : '问 AI 导师'}
                  </button>
                </div>

                {/* Exercise section */}
                {showExercises[mod.id] && <ExerciseSection moduleId={mod.id} />}

                {/* Tutor chat */}
                {showTutor[mod.id] && <TutorChat moduleId={mod.id} courseId={courseId} />}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}