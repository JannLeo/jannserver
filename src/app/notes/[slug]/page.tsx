'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSlug from 'rehype-slug';
import NavBar from '@/components/NavBar';

export default function NoteDetailPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;

  const [note, setNote] = useState<any>(null);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/notes/${slug}`).then(r => r.json()).then(data => {
      setNote(data);
      setTitle(data.title);
      setContent(data.content || '');
      setLoading(false);
    });
  }, [slug]);

  const handleSave = async () => {
    try {
      await fetch(`/api/notes/${slug}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content }),
      });
      setEditing(false);
      setNote({ ...note, title, content });
    } catch {
      alert('保存失败，请重试');
    }
  };

  if (loading) return <div className="p-6 text-slate-400">加载中...</div>;
  if (!note) return <div className="p-6 text-red-500">笔记不存在</div>;

  return (
    <div className="page-shell">
      <NavBar title={note.title} backTo="/notes" backLabel="返回笔记" />
      <main className="max-w-4xl mx-auto p-6">
        <div className="flex justify-end gap-2 mb-4">
          {editing ? (
            <>
              <button onClick={() => setEditing(false)} className="border border-slate-300 px-4 py-2 rounded-lg text-sm">取消</button>
              <button onClick={handleSave} className="app-button-primary px-4 py-2 rounded-lg text-sm">保存</button>
            </>
          ) : (
            <button onClick={() => setEditing(true)} className="border border-slate-300 px-4 py-2 rounded-lg text-sm">编辑</button>
          )}
        </div>
        {editing ? (
          <>
            <input className="w-full text-2xl font-bold border-none outline-none bg-transparent mb-4" value={title} onChange={e => setTitle(e.target.value)} />
            <textarea className="w-full h-[60vh] app-input rounded-xl p-4 resize-none font-mono text-sm" value={content} onChange={e => setContent(e.target.value)} />
          </>
        ) : (
          <article className="prose prose-slate max-w-none">
            <h1>{note.title}</h1>
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSlug]}>{content || note.content}</ReactMarkdown>
          </article>
        )}
      </main>
    </div>
  );
}