'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import NavBar from '@/components/NavBar';

export default function NewNotePage() {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  const handleSave = async () => {
    if (!title.trim()) return alert('标题必填');
    setSaving(true);
    try {
      const res = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || '保存失败');
        return;
      }
      const data = await res.json();
      router.push(`/notes/${data.slug}`);
    } catch (e) {
      alert('网络错误，请重试');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page-shell">
      <NavBar title="📝 新建笔记" backTo="/notes" backLabel="返回笔记" />
      <main className="max-w-4xl mx-auto p-6">
        <div className="flex justify-end mb-4">
          <button onClick={handleSave} disabled={saving} className="app-button-primary px-4 py-2 rounded-lg text-sm disabled:opacity-50">
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
        <input
          className="w-full text-2xl font-bold border-none outline-none bg-transparent mb-4 placeholder:text-slate-300"
          placeholder="笔记标题"
          value={title}
          onChange={e => setTitle(e.target.value)}
        />
        <textarea
          className="w-full h-[60vh] app-input rounded-xl p-4 resize-none focus:outline-none font-mono text-sm"
          placeholder="支持 Markdown 格式..."
          value={content}
          onChange={e => setContent(e.target.value)}
        />
      </main>
    </div>
  );
}