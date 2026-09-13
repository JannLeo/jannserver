import { getPromptContent } from '@/lib/prompts';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

interface ViewPageProps {
  searchParams: { path?: string };
}

export default async function PromptViewPage({ searchParams }: ViewPageProps) {
  const filePath = searchParams.path;

  if (!filePath) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 text-white p-6">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-3xl font-bold mb-4">未指定文件路径</h1>
          <Link href="/prompts" className="text-blue-400 hover:underline">
            ← 返回文件列表
          </Link>
        </div>
      </div>
    );
  }

  const content = await getPromptContent(filePath);

  if (!content) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 text-white p-6">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-3xl font-bold mb-4">文件未找到</h1>
          <p className="text-slate-400 mb-4">路径: {filePath}</p>
          <Link href="/prompts" className="text-blue-400 hover:underline">
            ← 返回文件列表
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 text-white p-6">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <Link href="/prompts" className="text-blue-400 hover:underline text-sm">
            ← 返回文件列表
          </Link>
        </div>
        <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
          <h1 className="text-2xl font-bold mb-2 text-slate-100 truncate">
            {filePath.split('/').pop()?.replace('.md', '')}
          </h1>
          <p className="text-sm text-slate-500 mb-6 font-mono">{filePath}</p>
          <div className="prose prose-invert max-w-none">
            <pre className="whitespace-pre-wrap bg-slate-900/50 p-4 rounded-lg text-sm text-slate-200 overflow-x-auto">
              {content}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}