'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { format } from 'date-fns';
import NavBar from '@/components/NavBar';

export default function DailyPage() {
  const router = useRouter();
  const params = useParams();
  const date = params.date as string || format(new Date(), 'yyyy-MM-dd');

  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState('');
  const [suggestedTasks, setSuggestedTasks] = useState<any[]>([]);
  const [showTaskModal, setShowTaskModal] = useState(false);

  const fetchDaily = async () => {
    const res = await fetch(`/api/daily/${date}`);
    const data = await res.json();
    setContent(data.content || '');
    setLoading(false);
  };

  useEffect(() => { fetchDaily(); }, [date]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch(`/api/daily/${date}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content }) });
    } catch {
      alert('保存失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setGenerateError('');
    setSuggestedTasks([]);
    try {
      const res = await fetch('/api/ai/daily-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date }),
      });
      const data = await res.json();
      if (!res.ok || !data.configured) {
        setGenerateError(data.error || 'AI 未配置或请求失败');
        return;
      }
      if (data.error) {
        setGenerateError(data.error);
        return;
      }
      if (data.markdown) {
        setContent(prev => {
          if (prev.trim()) {
            return prev + '\n\n---\n\n' + data.markdown;
          }
          return data.markdown;
        });
      }
      if (data.suggestedTasks?.length > 0) {
        setSuggestedTasks(data.suggestedTasks);
        setShowTaskModal(true);
      }
    } catch (err: any) {
      setGenerateError(err.message || '生成失败');
    }
    setGenerating(false);
  };

  const handleInsertPlan = () => {
    setShowTaskModal(false);
    setSuggestedTasks([]);
  };

  if (loading) return <div className="p-6 text-slate-400">加载中...</div>;

  return (
    <div className="page-shell">
      <NavBar title={`📅 ${date}`} />
      <main className="max-w-4xl mx-auto p-6 space-y-4">
        {/* 操作栏 */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={date}
              onChange={e => router.push(`/daily/${e.target.value}`)}
              className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="px-4 py-2 app-button-primary rounded-lg text-sm font-medium disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
            >
              {generating ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  生成中...
                </>
              ) : (
                <>🤖 AI 生成日计划</>
              )}
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 app-button-primary rounded-lg text-sm font-medium  disabled:opacity-50"
            >
              {saving ? '保存中...' : '💾 保存'}
            </button>
          </div>
        </div>

        {/* 错误提示 */}
        {generateError && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-600">
            ⚠️ {generateError}
            {!generateError.includes('AI 未配置') && (
              <span className="text-red-400 text-xs ml-2">（可能知识库数据不足，或 AI 服务异常）</span>
            )}
          </div>
        )}

        {/* 编辑器 */}
        <textarea
          className="w-full h-[65vh] app-input rounded-xl p-4 font-mono text-sm resize-none focus:outline-none"
          value={content}
          onChange={e => setContent(e.target.value)}
          placeholder={"今天做什么？\n\n可以手动输入，也可以点上面的「🤖 AI 生成日计划」让 AI 基于你的任务、备忘录和 GitHub 提交智能生成。"}
        />

        {/* 底部提示 */}
        <div className="text-xs text-slate-400 flex items-center justify-between">
          <span>基于 Tasks / Memos / Daily / GitHub Commits 智能生成</span>
          <span>{content.length} 字符</span>
        </div>
      </main>

      {/* 建议任务弹窗 */}
      {showTaskModal && suggestedTasks.length > 0 && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={handleInsertPlan}>
          <div className="app-card shadow-[0_30px_90px_rgba(39,32,24,0.18)] max-w-md w-full" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-slate-800">💡 建议新建的任务</h3>
                <p className="text-xs text-slate-400 mt-0.5">AI 根据你的情况推荐以下任务，可选择添加到计划中</p>
              </div>
              <button onClick={handleInsertPlan} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
            </div>
            <div className="p-5 space-y-3 max-h-72 overflow-y-auto">
              {suggestedTasks.map((task, i) => (
                <div key={i} className="app-panel rounded-xl p-3 border border-slate-100">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-700">{task.title}</div>
                      {task.reason && (
                        <div className="text-xs text-slate-400 mt-1">{task.reason}</div>
                      )}
                      <div className="flex items-center gap-2 mt-1.5">
                        {task.projectName && (
                          <span className="text-xs bg-teal-50 text-teal-700 px-1.5 py-0.5 rounded">{task.projectName}</span>
                        )}
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                          task.priority === 'high' ? 'bg-red-50 text-red-500' :
                          task.priority === 'medium' ? 'bg-amber-50 text-amber-500' :
                          'bg-slate-50 text-slate-400'
                        }`}>
                          {task.priority === 'high' ? '🔥 高' : task.priority === 'medium' ? '📌 中' : '💤 低'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="px-5 py-4 border-t border-slate-100 flex gap-2">
              <button
                onClick={handleInsertPlan}
                className="flex-1 px-4 py-2 app-button-primary rounded-lg text-sm font-medium "
              >
                知道了
              </button>
              <button
                onClick={() => { setShowTaskModal(false); }}
                className="px-4 py-2 app-button-secondary rounded-lg text-sm hover:bg-slate-50"
              >
                忽略
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}