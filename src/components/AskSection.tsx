'use client';
import { useState, useCallback } from 'react';

interface Source {
  docType: string;
  docId: string;
  title: string;
  repoName?: string;
  repoId?: number;
  url?: string;
  excerpt: string;
}

interface AskResult {
  answer: string;
  sources: Source[];
  configured: boolean;
  usedKnowledgeBase?: boolean;
  error?: string;
}

function getTypeLabel(docType: string): string {
  const labels: Record<string, string> = {
    note: '笔记', memo: '备忘录', daily: '日报', github_md: 'GitHub 文档',
  };
  return labels[docType] || docType;
}

export default function AskSection() {
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AskResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(async () => {
    const q = question.trim();
    if (!q) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/ai/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.configured === false) {
          setResult({ answer: '', sources: [], configured: false, error: data.error || 'AI 未配置' });
        } else {
          setError(data.error || `请求失败 (${res.status})`);
        }
        return;
      }
      setResult(data);
    } catch (err: any) {
      setError(`网络错误: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [question]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100 mt-6">
      <h2 className="font-semibold text-lg mb-4">🤖 AI 知识库问答</h2>
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          value={question}
          onChange={e => setQuestion(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入问题，搜索知识库..."
          className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          disabled={loading}
        />
        <button
          onClick={handleSubmit}
          disabled={loading || !question.trim()}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? '查询中...' : '提问'}
        </button>
      </div>

      {result && !result.configured && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-700">
          {result.error}
        </div>
      )}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">{error}</div>
      )}
      {loading && (
        <p className="text-slate-400 text-sm animate-pulse">正在搜索知识库并生成回答...</p>
      )}
      {result && result.configured && result.answer && (
        <div className="mt-4 p-4 bg-slate-50 rounded-lg border border-slate-100">
          <div className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{result.answer}</div>
          {result.sources.length > 0 && (
            <div className="mt-3 pt-3 border-t border-slate-200">
              <p className="text-xs text-slate-400 mb-2">参考来源 ({result.sources.length})</p>
              <div className="flex flex-wrap gap-1.5">
                {result.sources.map((s, i) => (
                  <span key={i} className="text-xs bg-slate-200 text-slate-600 px-2 py-0.5 rounded">
                    {s.title || '无标题'}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}