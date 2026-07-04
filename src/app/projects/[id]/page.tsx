'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import NavBar from '@/components/NavBar';

const COLORS = ['#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#ec4899', '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#06b6d4', '#64748b'];

interface Note { id: string; title: string; excerpt: string; tags: string; updated_at: string; }
interface TaskItem { id: string; title: string; status: string; priority: string; tags: string; due_date: string | null; completed_at: string | null; updated_at: string; }
interface MemoItem { id: string; slug: string; content: string; excerpt: string; tags: string; updated_at: string; }

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [loading, setLoading] = useState(true);
  const [project, setProject] = useState<any>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [memos, setMemos] = useState<MemoItem[]>([]);
  const [stats, setStats] = useState({ notesCount: 0, tasksTotal: 0, tasksDone: 0, memosCount: 0 });

  // Editing
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editColor, setEditColor] = useState('#3b82f6');

  // Quick-add inputs
  const [newNoteTitle, setNewNoteTitle] = useState('');
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newMemoContent, setNewMemoContent] = useState('');
  const [adding, setAdding] = useState<string | null>(null); // 'note' | 'task' | 'memo'

  const fetchProject = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${id}`);
      if (!res.ok) { router.push('/projects'); return; }
      const data = await res.json();
      setProject(data.project);
      setNotes(data.notes || []);
      setTasks(data.tasks || []);
      setMemos(data.memos || []);
      setStats(data.stats || { notesCount: 0, tasksTotal: 0, tasksDone: 0, memosCount: 0 });
    } catch { router.push('/projects'); }
    setLoading(false);
  };

  useEffect(() => { if (id) fetchProject(); }, [id]);

  const handleEdit = async () => {
    if (!editName.trim()) return;
    await fetch(`/api/projects/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editName, description: editDesc, color: editColor }),
    });
    setEditing(false);
    fetchProject();
  };

  const handleDelete = async () => {
    if (!confirm('确定删除这个项目？关联的笔记、任务、备忘录不会被删除，但会解除绑定。')) return;
    await fetch(`/api/projects/${id}`, { method: 'DELETE' });
    router.push('/projects');
  };

  const addNote = async () => {
    if (!newNoteTitle.trim()) return;
    setAdding('note');
    await fetch('/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newNoteTitle, content: '', projectId: id }),
    });
    setNewNoteTitle('');
    setAdding(null);
    fetchProject();
  };

  const addTask = async () => {
    if (!newTaskTitle.trim()) return;
    setAdding('task');
    await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newTaskTitle, projectId: id }),
    });
    setNewTaskTitle('');
    setAdding(null);
    fetchProject();
  };

  const addMemo = async () => {
    if (!newMemoContent.trim()) return;
    setAdding('memo');
    await fetch('/api/memos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: newMemoContent, projectId: id }),
    });
    setNewMemoContent('');
    setAdding(null);
    fetchProject();
  };

  const toggleTask = async (task: TaskItem) => {
    const newStatus = task.status === 'done' || task.status === 'completed' ? 'todo' : 'done';
    await fetch(`/api/tasks/${task.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    fetchProject();
  };

  const formatDate = (iso: string | null) => {
    if (!iso) return '';
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <NavBar title="📁 项目" />
        <div className="flex items-center justify-center h-96 text-slate-400">加载中...</div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-slate-50">
        <NavBar title="📁 项目" />
        <div className="flex items-center justify-center h-96 text-slate-400">项目不存在</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <NavBar title={`📁 项目`} />

      {/* Project Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-5">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <span className="w-5 h-5 rounded-full flex-shrink-0" style={{ backgroundColor: project.color || '#3b82f6' }} />
              <div>
                {editing ? (
                  <div className="space-y-2">
                    <input
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      className="border border-slate-200 rounded-lg px-3 py-1.5 text-lg font-bold focus:outline-none focus:ring-2 focus:ring-blue-300"
                    />
                    <div className="flex items-center gap-2">
                      {COLORS.map(c => (
                        <button key={c} onClick={() => setEditColor(c)}
                          className={`w-6 h-6 rounded-full border-2 transition ${editColor === c ? 'border-slate-700 scale-125' : 'border-transparent'}`}
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                    <input
                      value={editDesc}
                      onChange={e => setEditDesc(e.target.value)}
                      placeholder="项目描述"
                      className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                    />
                    <div className="flex gap-2">
                      <button onClick={handleEdit} className="px-3 py-1 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600">保存</button>
                      <button onClick={() => setEditing(false)} className="px-3 py-1 border border-slate-200 text-sm rounded-lg hover:bg-slate-50">取消</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <h1 className="text-xl font-bold text-slate-800">{project.name}</h1>
                    {project.description && <p className="text-sm text-slate-500 mt-0.5">{project.description}</p>}
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => {
                setEditing(true);
                setEditName(project.name);
                setEditDesc(project.description || '');
                setEditColor(project.color || '#3b82f6');
              }} className="text-xs px-3 py-1.5 border border-slate-200 rounded-lg text-slate-500 hover:text-slate-700 hover:border-slate-300">
                编辑
              </button>
              <button onClick={handleDelete} className="text-xs px-3 py-1.5 border border-red-200 text-red-400 rounded-lg hover:bg-red-50 hover:text-red-600">
                删除
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="max-w-6xl mx-auto px-6 py-5">
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <div className="text-2xl font-bold text-indigo-600">{stats.notesCount}</div>
            <div className="text-xs text-slate-400 mt-1">笔记</div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <div className="text-2xl font-bold text-emerald-600">{stats.tasksDone}/{stats.tasksTotal}</div>
            <div className="text-xs text-slate-400 mt-1">任务</div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <div className="text-2xl font-bold text-amber-600">{stats.memosCount}</div>
            <div className="text-xs text-slate-400 mt-1">备忘录</div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <div className="text-2xl font-bold text-purple-600">{notes.length + tasks.length + memos.length}</div>
            <div className="text-xs text-slate-400 mt-1">全部项目内容</div>
          </div>
        </div>
      </div>

      {/* Three Columns */}
      <div className="max-w-6xl mx-auto px-6 pb-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

          {/* ─── Notes Column ─── */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <h2 className="font-semibold text-sm text-slate-700">📝 笔记</h2>
              <span className="text-xs text-slate-400">{notes.length}</span>
            </div>
            <div className="p-3">
              <div className="flex gap-2 mb-3">
                <input
                  value={newNoteTitle}
                  onChange={e => setNewNoteTitle(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addNote()}
                  placeholder="新建笔记…"
                  className="flex-1 border border-slate-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400"
                />
                <button onClick={addNote} disabled={adding === 'note'}
                  className="text-xs px-3 py-1.5 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 disabled:bg-indigo-300">
                  {adding === 'note' ? '…' : '+'}
                </button>
              </div>
              <div className="space-y-1.5 max-h-80 overflow-y-auto">
                {notes.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-6">还没有笔记</p>
                ) : notes.map(n => (
                  <Link key={n.id} href={`/notes/${n.id}`}
                    className="block p-2 rounded border border-slate-100 hover:border-indigo-200 hover:bg-indigo-50/30 transition text-sm">
                    <div className="font-medium text-slate-700 truncate">{n.title || '无标题'}</div>
                    {n.excerpt && <div className="text-xs text-slate-400 truncate mt-0.5">{n.excerpt}</div>}
                    <div className="text-[10px] text-slate-300 mt-0.5">{formatDate(n.updated_at)}</div>
                  </Link>
                ))}
              </div>
            </div>
          </div>

          {/* ─── Tasks Column ─── */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <h2 className="font-semibold text-sm text-slate-700">✅ 任务</h2>
              <span className="text-xs text-slate-400">{stats.tasksDone}/{stats.tasksTotal}</span>
            </div>
            <div className="p-3">
              <div className="flex gap-2 mb-3">
                <input
                  value={newTaskTitle}
                  onChange={e => setNewTaskTitle(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addTask()}
                  placeholder="新建任务…"
                  className="flex-1 border border-slate-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-400"
                />
                <button onClick={addTask} disabled={adding === 'task'}
                  className="text-xs px-3 py-1.5 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 disabled:bg-emerald-300">
                  {adding === 'task' ? '…' : '+'}
                </button>
              </div>
              <div className="space-y-1 max-h-80 overflow-y-auto">
                {tasks.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-6">还没有任务</p>
                ) : tasks.map(t => (
                  <div key={t.id}
                    className="flex items-start gap-2 p-2 rounded border border-slate-100 hover:border-emerald-200 transition text-sm">
                    <button
                      onClick={() => toggleTask(t)}
                      className={`mt-0.5 w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition ${
                        t.status === 'done' || t.status === 'completed'
                          ? 'bg-emerald-500 border-emerald-500 text-white'
                          : 'border-slate-300 hover:border-emerald-400'
                      }`}
                    >
                      {(t.status === 'done' || t.status === 'completed') && <span className="text-[10px]">✓</span>}
                    </button>
                    <div className="flex-1 min-w-0">
                      <span className={`${t.status === 'done' || t.status === 'completed' ? 'line-through text-slate-400' : 'text-slate-700'}`}>
                        {t.title}
                      </span>
                      {t.due_date && <span className="text-[10px] text-slate-400 ml-2">📅 {formatDate(t.due_date)}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ─── Memos Column ─── */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <h2 className="font-semibold text-sm text-slate-700">💬 备忘录</h2>
              <span className="text-xs text-slate-400">{memos.length}</span>
            </div>
            <div className="p-3">
              <div className="flex gap-2 mb-3">
                <input
                  value={newMemoContent}
                  onChange={e => setNewMemoContent(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addMemo()}
                  placeholder="记点东西…"
                  className="flex-1 border border-slate-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400"
                />
                <button onClick={addMemo} disabled={adding === 'memo'}
                  className="text-xs px-3 py-1.5 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:bg-amber-300">
                  {adding === 'memo' ? '…' : '+'}
                </button>
              </div>
              <div className="space-y-1.5 max-h-80 overflow-y-auto">
                {memos.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-6">还没有备忘录</p>
                ) : memos.map(m => (
                  <div key={m.id}
                    className="p-2 rounded border border-slate-100 hover:border-amber-200 hover:bg-amber-50/30 transition text-sm">
                    <div className="text-slate-700 line-clamp-2">{m.content || m.excerpt || '无内容'}</div>
                    <div className="text-[10px] text-slate-300 mt-0.5">{formatDate(m.updated_at)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}