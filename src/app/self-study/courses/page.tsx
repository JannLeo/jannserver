'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';

const CATEGORIES = [
  { key: 'all', label: '全部' },
  { key: 'programming', label: '编程' },
  { key: 'web', label: 'Web' },
  { key: 'ml', label: '机器学习' },
  { key: 'linux', label: 'Linux' },
  { key: 'english', label: '英语' },
  { key: 'math', label: '数学' },
];

const DIFFICULTY_COLORS: Record<string, string> = {
  beginner: 'bg-green-100 text-green-700',
  intermediate: 'bg-amber-100 text-amber-700',
  advanced: 'bg-red-100 text-red-700',
};

export default function CoursesPage() {
  const [courses, setCourses] = useState<any[]>([]);
  const [category, setCategory] = useState('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/self-study/courses?category=${category}`)
      .then(r => {
        if (r.status === 401) { window.location.href = '/login'; return; }
        return r.json();
      })
      .then(d => { if (d) { setCourses(d.courses ?? []); setLoading(false); } })
      .catch(() => setLoading(false));
  }, [category]);

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-stone-800">📚 课程目录</h1>
        <p className="mt-1 text-sm text-stone-500">选择感兴趣的课程开始学习</p>
      </div>

      {/* Category filter */}
      <div className="flex gap-2 flex-wrap">
        {CATEGORIES.map(cat => (
          <button key={cat.key} onClick={() => setCategory(cat.key)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${category === cat.key ? 'bg-teal-600 text-white' : 'bg-white border border-stone-200 text-stone-600 hover:bg-stone-50'}`}>
            {cat.label}
          </button>
        ))}
      </div>

      {/* Loading */}
      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-pulse text-stone-400">加载中...</div></div>
      ) : courses.length === 0 ? (
        <div className="text-center py-12 text-stone-400">暂无课程</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((course: any) => (
            <Link key={course.id} href={`/self-study/courses/${course.id}`}>
              <div className="group h-full rounded-2xl border border-stone-200 bg-white p-5 transition hover:shadow-lg hover:border-stone-300">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">{course.icon}</span>
                    <div>
                      <div className="font-bold text-stone-800 group-hover:text-teal-700">{course.title}</div>
                      <span className={`inline-block mt-0.5 rounded-full px-2 py-0.5 text-xs font-medium ${DIFFICULTY_COLORS[course.difficulty] ?? 'bg-stone-100 text-stone-600'}`}>
                        {course.difficulty === 'beginner' ? '入门' : course.difficulty === 'intermediate' ? '进阶' : '高级'}
                      </span>
                    </div>
                  </div>
                </div>

                <p className="mt-3 text-sm text-stone-500 line-clamp-2">{course.description}</p>

                <div className="mt-4 flex items-center justify-between">
                  <span className="text-xs text-stone-400">{course.module_count} 个模块</span>
                  {course.progress > 0 && (
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-20 rounded-full bg-stone-100">
                        <div className="h-1.5 rounded-full bg-teal-500" style={{ width: `${course.progress}%` }} />
                      </div>
                      <span className="text-xs text-stone-500">{course.progress}%</span>
                    </div>
                  )}
                  {course.progress === 100 && (
                    <span className="text-xs font-bold text-green-600">✅ 已完成</span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Add new course */}
      <div className="rounded-2xl border border-dashed border-stone-300 p-6 text-center">
        <p className="text-sm text-stone-400">更多课程持续添加中...</p>
      </div>
    </div>
  );
}