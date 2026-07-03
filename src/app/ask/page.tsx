'use client';
import { useState, useCallback } from 'react';
import Link from 'next/link';
import NavBar from '@/components/NavBar';

interface Source {
  docType: string;
  docId?: string;
  title: string;
  repoName?: string;
  repoId?: number;
  url?: string;
  excerpt?: string;
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
    note: '笔记',
    memo: '备忘录',
    daily: '日报',
    github_md: 'GitHub 文档',
    repo: '仓库',
  };
  return labels[docType] || docType;
}

function getTypeIcon(docType: string): string {
  const icons: Record<string, string> = {
    note: '📝',
    memo: '📋',
    daily: '📅',
    github_md: '📄',
    repo: '📦',
  };
  return icons[docType] || '📄';
}

export default function AskPage() {
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
    <div className="min-h-screen bg-slate-50">
      <NavBar title="🤖 AI 知识库问答" />

      <main className="max-w-3xl mx-auto p-6 space-y-6">
        {/* Input */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <div className="flex gap-3">
            <input
              type="text"
              value={question}
              onChange={e => setQuestion(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入问题，例如：WorldQuant fitness 是什么？"
              className="flex-1 px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              disabled={loading}
            />
            <button
              onClick={handleSubmit}
              disabled={loading || !question.trim()}
              className="px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? '查询中...' : '提问'}
            </button>
          </div>
        </div>

        {/* AI Not Configured */}
        {result && !result.configured && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6 text-center">
            <p className="text-4xl mb-2">⚙️</p>
            <p className="text-yellow-700 font-medium">{result.error}</p>
            <p className="text-sm text-yellow-600 mt-1">
              请配置 AI_BASE_URL、AI_API_KEY、AI_MODEL 环境变量后重试
            </p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center">
            <p className="text-slate-400 animate-pulse">正在搜索知识库并生成回答...</p>
          </div>
        )}

        {/* Used Knowledge Base notice */}
        {result && result.configured && result.usedKnowledgeBase === false && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700">
            ⚠️ 未命中知识库，以下为通用 AI 回答
          </div>
        )}

        {/* Answer */}
        {result && result.configured && result.answer && (
          <>
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">回答</h2>
              <div className="prose prose-sm max-w-none text-slate-700 whitespace-pre-wrap leading-relaxed">
                {result.answer}
              </div>
            </div>

            {/* Sources */}
            {result.sources.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">
                  参考来源 ({result.sources.length})
                </h2>
                <div className="space-y-2">
                  {result.sources.map((source, i) =>
                    source.url ? (
                      <a
                        key={`${source.docType}:${source.docId}:${i}`}
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-start gap-3 p-3 rounded-lg hover:bg-slate-50 border border-slate-100 transition-colors"
                      >
                        <span className="text-lg mt-0.5">{getTypeIcon(source.docType)}</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-slate-800 truncate">
                            {source.title || '无标题'}
                          </div>
                          <div className="text-xs text-slate-400 mt-0.5 space-x-2">
                            <span className="bg-slate-100 px-1.5 py-0.5 rounded">{getTypeLabel(source.docType)}</span>
                            {source.repoName && (
                              <span className="bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">{source.repoName}</span>
                            )}
                          </div>
                        </div>
                        <span className="text-slate-300 text-sm mt-1">↗</span>
                      </a>
                    ) : (
                      <div
                        key={`${source.docType}:${source.docId}:${i}`}
                        className="flex items-start gap-3 p-3 rounded-lg border border-slate-100 opacity-60"
                      >
                        <span className="text-lg mt-0.5">{getTypeIcon(source.docType)}</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-slate-800 truncate">
                            {source.title || '无标题'}
                          </div>
                          <div className="text-xs text-slate-400 mt-0.5 space-x-2">
                            <span className="bg-slate-100 px-1.5 py-0.5 rounded">{getTypeLabel(source.docType)}</span>
                            {source.repoName && (
                              <span className="bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">{source.repoName}</span>
                            )}
                          </div>
                        </div>
                        <span className="text-slate-400 text-sm mt-1">⊘</span>
                      </div>
                    )
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}