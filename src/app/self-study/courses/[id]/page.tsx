'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

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

export default function CourseDetailPage() {
  const params = useParams();
  const courseId = params.id as string;
  const [course, setCourse] = useState<any>(null);
  const [modules, setModules] = useState<any[]>([]);
  const [stats, setStats] = useState({ total: 0, completed: 0, progress: 0 });
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/self-study/courses/${courseId}`)
      .then(r => {
        if (r.status === 401) { window.location.href = '/login'; return null; }
        return r.json();
      })
      .then(d => {
        if (!d || d.error) {
          setLoading(false);
          return;
        }
        setCourse(d.course);
        setModules(d.modules ?? []);
        setStats(d.stats ?? { total: 0, completed: 0, progress: 0 });
        setLoading(false);
      }).catch((e) => {
        console.error('Course fetch error:', e);
        setLoading(false);
      });
  }, [courseId]);

  const updateProgress = async (moduleId: string, status: string) => {
    setUpdating(moduleId);
    await fetch('/api/self-study/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ moduleId, courseId, status, masteryScore: status === 'completed' ? 1 : 0 }),
    });
    // Refresh
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
      {/* Back */}
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

        {/* Progress bar */}
        <div className="mt-5">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-stone-600">学习进度</span>
            <span className="font-bold text-teal-700">{stats.progress}%</span>
          </div>
          <div className="mt-1.5 h-2.5 w-full rounded-full bg-stone-100">
            <div className="h-2.5 rounded-full bg-teal-500 transition-all duration-500" style={{ width: `${stats.progress}%` }} />
          </div>
          <div className="mt-1 text-xs text-stone-400">
            {stats.completed}/{stats.total} 模块已完成
          </div>
        </div>
      </div>

      {/* Modules */}
      <div className="space-y-3">
        <h2 className="text-lg font-bold text-stone-700">课程内容</h2>
        {modules.map((mod: any, idx: number) => (
          <div key={mod.id}
            className={`rounded-2xl border ${statusColor[mod.status]} transition overflow-hidden`}>
            {/* Module header */}
            <button onClick={() => setExpanded(expanded === mod.id ? null : mod.id)}
              className="flex w-full items-center gap-3 p-4 text-left">
              <span className="flex h-8 w-8 items-center justify-center text-lg">{statusIcon[mod.status] ?? '⭕'}</span>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-stone-700">
                  第 {idx + 1} 章：{mod.title}
                </div>
                <div className="text-xs text-stone-400 mt-0.5">
                  ~{mod.estimatedMinutes} 分钟 · {mod.description}
                </div>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                {mod.status !== 'completed' && (
                  <button onClick={(e) => { e.stopPropagation(); updateProgress(mod.id, 'completed'); }}
                    disabled={updating === mod.id}
                    className="rounded-lg bg-green-100 px-3 py-1 text-xs font-medium text-green-700 hover:bg-green-200 disabled:opacity-50">
                    {updating === mod.id ? '...' : '标记完成'}
                  </button>
                )}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                  className={`text-stone-400 transition ${expanded === mod.id ? 'rotate-180' : ''}`}>
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </div>
            </button>

            {/* Module content */}
            {expanded === mod.id && (
              <div className="border-t border-stone-200 px-4 pb-4 pt-3">
                <div className="prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(mod.content) }} />
                <div className="mt-4 flex gap-2">
                  <button onClick={() => updateProgress(mod.id, 'completed')}
                    className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700">
                    {mod.status === 'completed' ? '重新学习' : '标记完成'}
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Action links */}
      <div className="flex gap-3">
        <Link href={`/self-study/tutor?courseId=${courseId}`} className="rounded-xl bg-amber-50 border border-amber-200 px-5 py-3 text-sm font-medium text-amber-800 hover:bg-amber-100">
          🤖 就本课程向 AI 提问
        </Link>
        <Link href="/self-study/flashcards" className="rounded-xl bg-violet-50 border border-violet-200 px-5 py-3 text-sm font-medium text-violet-800 hover:bg-violet-100">
          🃏 创建本课闪卡
        </Link>
      </div>
    </div>
  );
}