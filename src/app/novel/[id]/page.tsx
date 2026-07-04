'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import NavBar from '@/components/NavBar';
import { useRouter } from 'next/navigation';

const PHASES = [
  { key: 'setup', label: '📝 设定', color: 'from-blue-500 to-indigo-500', agent: 'updater' },
  { key: 'outline', label: '🗺️ 纲', color: 'from-violet-500 to-purple-500', agent: 'volume/chapter-planner' },
  { key: 'draft', label: '✍️ 写作', color: 'from-green-500 to-emerald-500', agent: 'writer + anti-ai' },
  { key: 'review', label: '🔍 评审', color: 'from-amber-500 to-orange-500', agent: 'reader' },
  { key: 'archive', label: '📚 归档', color: 'from-slate-500 to-slate-600', agent: 'updater' },
];

function countWords(text: string): number {
  if (!text) return 0;
  return text.replace(/\s/g, '').length;
}

export default function NovelWritingPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [novel, setNovel] = useState<any>(null);
  const [chapters, setChapters] = useState<any[]>([]);
  const [volumes, setVolumes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Setup phase state
  const [worldSetting, setWorldSetting] = useState('');
  const [genreSetting, setGenreSetting] = useState('');
  const [characterSettings, setCharacterSettings] = useState('');

  // Outline phase state
  const [showVolumeModal, setShowVolumeModal] = useState(false);
  const [newVolumeTitle, setNewVolumeTitle] = useState('');

  // Draft phase state
  const [selectedChapter, setSelectedChapter] = useState<any>(null);
  const [chapterContent, setChapterContent] = useState('');
  const [showChapterDetail, setShowChapterDetail] = useState(false);

  // AI generation
  const [generating, setGenerating] = useState(false);
  const [genPhase, setGenPhase] = useState('');
  const [genError, setGenError] = useState('');

  const fetchNovel = useCallback(async () => {
    const res = await fetch(`/api/novels/${params.id}`);
    if (!res.ok) { router.push('/novel'); return; }
    const data = await res.json();
    setNovel(data);
    setChapters(data.chapters || []);
    setVolumes(data.volumes || []);
    setWorldSetting(data.worldSetting || '');
    setGenreSetting(data.genreSetting || '');
    try {
      const chars = JSON.parse(data.characterSettings || '[]');
      setCharacterSettings(Array.isArray(chars) ? chars.map((c: any) => `【${c.role}】${c.name}：${c.personality}`).join('\n') : '');
    } catch { setCharacterSettings(''); }
    setLoading(false);
  }, [params.id, router]);

  useEffect(() => { fetchNovel(); }, [fetchNovel]);

  const handleSave = async (updates: Record<string, any>) => {
    setSaving(true);
    await fetch(`/api/novels/${params.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    fetchNovel();
    setSaving(false);
  };

  const handleGen = async (phase: string, options: any = {}) => {
    setGenerating(true);
    setGenPhase(phase);
    setGenError('');
    try {
      const res = await fetch(`/api/novels/${params.id}/ai-generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phase, options }),
      });
      const data = await res.json();
      if (!data.configured) { setGenError(data.error || 'AI 未配置'); return; }
      if (data.error) { setGenError(data.error); return; }

      // Auto-apply generated content
      if (phase === 'setup') {
        try {
          let cleaned = data.content.trim();
          if (cleaned.startsWith('```')) cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
          const parsed = JSON.parse(cleaned);
          setWorldSetting(parsed.world_setting || '');
          setGenreSetting(parsed.genre_setting || '');
          const chars = Array.isArray(parsed.character_settings) ? parsed.character_settings : [];
          setCharacterSettings(chars.map((c: any) => `【${c.role}】${c.name}：${c.personality} — ${c.background}`).join('\n'));
          await handleSave({ worldSetting: parsed.world_setting || '', genreSetting: parsed.genre_setting || '', characterSettings: JSON.stringify(parsed.character_settings || []) });
        } catch { setGenError('解析 AI 返回失败，内容已复制到剪贴板'); navigator.clipboard.writeText(data.content); }
      } else if (phase === 'chapter_draft' && selectedChapter) {
        setChapterContent(prev => prev + '\n\n' + data.content);
      } else if (phase === 'chapter_anti_ai' && selectedChapter) {
        setChapterContent(data.content);
      } else {
        navigator.clipboard.writeText(data.content);
        alert('内容已复制到剪贴板，请手动粘贴');
      }
    } catch (err: any) { setGenError(err.message); }
    setGenerating(false);
  };

  const handleSaveChapter = async () => {
    if (!selectedChapter) return;
    const wordCount = countWords(chapterContent);
    await fetch(`/api/novels/${params.id}/chapters`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chapterId: selectedChapter.id, content: chapterContent, wordCount, status: 'draft' }),
    });
    // Update total words
    const totalWords = chapters.reduce((sum: number, c: any) => sum + (c.id === selectedChapter.id ? wordCount : c.wordCount || 0), 0);
    await handleSave({ totalWords });
    fetchNovel();
  };

  const handleCreateChapter = async () => {
    const volNum = volumes.length > 0 ? volumes[0].volumeNumber : 1;
    const res = await fetch(`/api/novels/${params.id}/chapters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ volumeNumber: volNum }),
    });
    if (res.ok) {
      const ch = await res.json();
      setChapters(prev => [...prev, ch]);
      setSelectedChapter(ch);
      setChapterContent('');
      setShowChapterDetail(true);
    }
  };

  const handleCreateVolume = async () => {
    if (!newVolumeTitle.trim()) return;
    const res = await fetch(`/api/novels/${params.id}/volumes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newVolumeTitle }),
    });
    if (res.ok) { setShowVolumeModal(false); setNewVolumeTitle(''); fetchNovel(); }
  };

  const handleAdvancePhase = async () => {
    const idx = PHASES.findIndex(p => p.key === novel.currentPhase);
    if (idx < PHASES.length - 1) {
      await handleSave({ currentPhase: PHASES[idx + 1].key });
    }
  };

  if (loading) return <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-400">加载中...</div>;

  const currentPhaseIdx = PHASES.findIndex(p => p.key === novel.currentPhase);

  return (
    <div className="min-h-screen bg-slate-50">
      <NavBar title={`✍️ ${novel?.title || '小说'}`} />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {/* Phase pipeline */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-slate-400">写作流程</span>
            <button
              onClick={handleAdvancePhase}
              disabled={currentPhaseIdx >= PHASES.length - 1}
              className="text-xs px-3 py-1 bg-indigo-50 text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-100 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              推进阶段 →
            </button>
          </div>
          <div className="flex items-center gap-1 overflow-x-auto">
            {PHASES.map((p, i) => {
              const isActive = i === currentPhaseIdx;
              const isDone = i < currentPhaseIdx;
              return (
                <div key={p.key} className="flex items-center">
                  <div className={`flex flex-col items-center gap-1 px-3 py-2 rounded-xl min-w-[80px] text-center transition-all ${
                    isActive ? `bg-gradient-to-br ${p.color} text-white shadow-sm` :
                    isDone ? 'bg-green-50 text-green-600 border border-green-200' :
                    'bg-slate-50 text-slate-400'
                  }`}>
                    <span className="text-base">{p.label.split(' ')[0]}</span>
                    <span className="text-xs font-medium">{p.label.split(' ')[1]}</span>
                  </div>
                  {i < PHASES.length - 1 && <span className="mx-0.5 text-slate-300">›</span>}
                </div>
              );
            })}
          </div>
        </div>

        {/* Phase Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Left: Chapter list */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <span className="font-semibold text-slate-700 text-sm">章节</span>
              <button onClick={handleCreateChapter} className="text-xs text-indigo-600 hover:text-indigo-700">+ 新建章节</button>
            </div>
            <div className="divide-y divide-slate-50 max-h-[60vh] overflow-y-auto">
              {chapters.length === 0 ? (
                <div className="p-6 text-center text-slate-400 text-sm">暂无章节<br /><span className="text-xs">点击右上角新建</span></div>
              ) : chapters.map((ch: any) => (
                <div
                  key={ch.id}
                  onClick={() => { setSelectedChapter(ch); setChapterContent(ch.content || ''); setShowChapterDetail(true); }}
                  className={`px-4 py-3 cursor-pointer hover:bg-indigo-50/50 transition-colors ${selectedChapter?.id === ch.id ? 'bg-indigo-50' : ''}`}
                >
                  <div className="text-sm font-medium text-slate-700">{ch.title}</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                      ch.status === 'done' ? 'bg-green-50 text-green-600' :
                      ch.status === 'draft' ? 'bg-blue-50 text-blue-600' :
                      'bg-slate-50 text-slate-400'
                    }`}>
                      {ch.status === 'done' ? '✓完成' : ch.status === 'draft' ? '✍️草稿' : '📐纲'}
                    </span>
                    <span className="text-xs text-slate-300">{ch.wordCount || 0} 字</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Content / Editor */}
          <div className="lg:col-span-2 space-y-4">

            {/* === SETUP PHASE === */}
            {novel.currentPhase === 'setup' && (
              <div className="space-y-4">
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-slate-700 text-sm">📝 世界观设定</h3>
                    <button
                      onClick={() => handleGen('setup', { genre: novel.genre, existingWorld: worldSetting, existingCharacter: characterSettings })}
                      disabled={generating}
                      className="text-xs px-3 py-1.5 bg-gradient-to-r from-blue-500 to-indigo-500 text-white rounded-lg hover:from-blue-600 hover:to-indigo-600 disabled:opacity-50 flex items-center gap-1"
                    >
                      {generating && genPhase === 'setup' ? <><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> 生成中...</> : '🤖 AI 生成'}
                    </button>
                  </div>
                  <textarea
                    value={worldSetting}
                    onChange={e => setWorldSetting(e.target.value)}
                    onBlur={() => handleSave({ worldSetting })}
                    className="w-full h-40 border border-slate-200 rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-300"
                    placeholder="描述世界观：力量体系、社会结构、地理环境、历史背景..."
                  />
                </div>

                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-slate-700 text-sm">🎭 题材设定</h3>
                  </div>
                  <textarea
                    value={genreSetting}
                    onChange={e => setGenreSetting(e.target.value)}
                    onBlur={() => handleSave({ genreSetting })}
                    className="w-full h-32 border border-slate-200 rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-300"
                    placeholder="题材特点、风格定位、目标读者群、文风建议..."
                  />
                </div>

                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-slate-700 text-sm">👤 角色设定</h3>
                    <button
                      onClick={() => handleGen('setup', { genre: novel.genre, existingWorld: worldSetting, existingCharacter: characterSettings })}
                      disabled={generating}
                      className="text-xs px-3 py-1.5 bg-gradient-to-r from-violet-500 to-purple-500 text-white rounded-lg hover:from-violet-600 hover:to-purple-600 disabled:opacity-50 flex items-center gap-1"
                    >
                      {generating ? <><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> 生成中...</> : '🤖 AI 生成角色'}
                    </button>
                  </div>
                  <textarea
                    value={characterSettings}
                    onChange={e => setCharacterSettings(e.target.value)}
                    onBlur={() => {
                      const lines = characterSettings.split('\n').filter(Boolean);
                      const chars = lines.map((l, i) => ({ id: String(i), name: l.split('：')[0].replace(/^[【\[][^\]】]+[\】\]]/, '').trim(), role: '待定', personality: l.split('：')[1] || '' }));
                      handleSave({ characterSettings: JSON.stringify(chars) });
                    }}
                    className="w-full h-48 border border-slate-200 rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-violet-300"
                    placeholder={'【主角】姓名：性格特点\n【配角】姓名：性格特点\n【反派】姓名：性格特点'}
                  />
                </div>
              </div>
            )}

            {/* === OUTLINE PHASE === */}
            {novel.currentPhase === 'outline' && (
              <div className="space-y-4">
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-slate-700 text-sm">📖 卷目列表</h3>
                    <button onClick={() => setShowVolumeModal(true)} className="text-xs px-3 py-1.5 bg-violet-50 text-violet-600 border border-violet-200 rounded-lg hover:bg-violet-100">+ 新建卷</button>
                  </div>
                  {volumes.length === 0 ? (
                    <p className="text-sm text-slate-400">暂无卷目，点击右上角创建</p>
                  ) : (
                    <div className="space-y-2">
                      {volumes.map((v: any) => (
                        <div key={v.id} className="bg-slate-50 rounded-lg px-3 py-2.5 text-sm">
                          <div className="font-medium text-slate-700">第{v.volumeNumber}卷：{v.title}</div>
                          {v.synopsis && <div className="text-xs text-slate-400 mt-0.5">{v.synopsis.slice(0, 80)}</div>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-slate-700 text-sm">📑 章纲列表</h3>
                    <button onClick={handleCreateChapter} className="text-xs px-3 py-1.5 bg-fuchsia-50 text-fuchsia-600 border border-fuchsia-200 rounded-lg hover:bg-fuchsia-100">+ 新建章节</button>
                  </div>
                  {chapters.filter((c: any) => c.status !== 'done').length === 0 ? (
                    <p className="text-sm text-slate-400">暂无章纲，创建章节后将自动生成章纲</p>
                  ) : (
                    <div className="space-y-2">
                      {chapters.filter((c: any) => c.status === 'outline').map((ch: any) => (
                        <div key={ch.id} className="bg-slate-50 rounded-lg px-3 py-2.5 text-sm">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1">
                              <div className="font-medium text-slate-700">{ch.title}</div>
                              {ch.outline && <div className="text-xs text-slate-400 mt-0.5 line-clamp-2">{ch.outline}</div>}
                            </div>
                            <button
                              onClick={() => handleGen('outline', { volumeTitle: volumes[0]?.title, volumeSynopsis: volumes[0]?.synopsis, chapterCount: 10 })}
                              disabled={generating}
                              className="text-xs px-2 py-1 bg-gradient-to-r from-fuchsia-500 to-pink-500 text-white rounded-lg hover:from-fuchsia-600 hover:to-pink-600 disabled:opacity-50 flex-shrink-0"
                            >
                              🤖 AI 生成
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* === DRAFT PHASE === */}
            {novel.currentPhase === 'draft' && (
              <div className="space-y-4">
                {!showChapterDetail || !selectedChapter ? (
                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center">
                    <div className="text-4xl mb-3">✍️</div>
                    <p className="text-slate-400">从左侧选择一个章节开始写作</p>
                    <p className="text-slate-300 text-xs mt-1">或新建章节</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <input
                            value={selectedChapter.title}
                            onChange={async (e) => {
                              const newTitle = e.target.value;
                              setSelectedChapter((c: any) => ({ ...c, title: newTitle }));
                              await fetch(`/api/novels/${params.id}/chapters`, {
                                method: 'PATCH',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ chapterId: selectedChapter.id, title: newTitle }),
                              });
                            }}
                            className="text-base font-bold text-slate-800 border-b border-transparent hover:border-slate-200 focus:border-indigo-400 focus:outline-none bg-transparent"
                          />
                          <div className="text-xs text-slate-400 mt-0.5">{countWords(chapterContent)} 字</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleGen('chapter_draft', { chapterTitle: selectedChapter.title, chapterOutline: selectedChapter.outline, genre: novel.genre, wordCount: 3000, previousSummary: chapters[chapters.indexOf(selectedChapter) - 1]?.content?.slice(-200) || '' })}
                            disabled={generating}
                            className="text-xs px-3 py-1.5 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-lg hover:from-green-600 hover:to-emerald-600 disabled:opacity-50 flex items-center gap-1"
                          >
                            {generating && genPhase === 'chapter_draft' ? <><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> 生成中...</> : '✍️ AI 续写'}
                          </button>
                          <button
                            onClick={() => handleGen('chapter_anti_ai', { content: chapterContent, genre: novel.genre })}
                            disabled={generating || !chapterContent}
                            className="text-xs px-3 py-1.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-lg hover:from-amber-600 hover:to-orange-600 disabled:opacity-50 flex items-center gap-1"
                          >
                            🧹 去AI味
                          </button>
                          <button
                            onClick={handleSaveChapter}
                            disabled={saving}
                            className="text-xs px-3 py-1.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
                          >
                            {saving ? '保存中...' : '💾 保存'}
                          </button>
                        </div>
                      </div>
                      <textarea
                        value={chapterContent}
                        onChange={e => setChapterContent(e.target.value)}
                        className="w-full h-[50vh] border border-slate-200 rounded-lg p-4 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-green-300 font-mono leading-relaxed"
                        placeholder="开始写作...\n\n选中章节后，点击「✍️ AI 续写」让 AI 根据章纲续写正文，或直接在此手动输入。"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* === REVIEW PHASE === */}
            {novel.currentPhase === 'review' && (
              <div className="space-y-4">
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-slate-700 text-sm">🔍 章节评审</h3>
                    <button
                      onClick={() => handleGen('review', { genre: novel.genre, worldSetting: novel.worldSetting, content: chapterContent || selectedChapter?.content || '' })}
                      disabled={generating || !chapterContent}
                      className="text-xs px-3 py-1.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-lg hover:from-amber-600 hover:to-orange-600 disabled:opacity-50 flex items-center gap-1"
                    >
                      {generating ? <><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> 评审中...</> : '🔍 AI 评审'}
                    </button>
                  </div>
                  <p className="text-sm text-slate-400">选择左侧一个章节后，点击「AI 评审」获取反馈</p>
                </div>
              </div>
            )}

            {/* === ARCHIVE PHASE === */}
            {novel.currentPhase === 'archive' && (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                <h3 className="font-semibold text-slate-700 mb-3">📚 归档管理</h3>
                <p className="text-sm text-slate-400 mb-4">归档完成的章节，生成最终文稿</p>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="bg-slate-50 rounded-lg px-3 py-2.5">
                    <div className="text-xs text-slate-400">已完成章节</div>
                    <div className="text-xl font-bold text-slate-700">{chapters.filter((c: any) => c.status === 'done').length} 章</div>
                  </div>
                  <div className="bg-slate-50 rounded-lg px-3 py-2.5">
                    <div className="text-xs text-slate-400">总字数</div>
                    <div className="text-xl font-bold text-slate-700">{novel.totalWords?.toLocaleString() || 0}</div>
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>

        {/* Error Banner */}
        {genError && (
          <div className="mt-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600 flex items-center gap-2">
            ⚠️ {genError}
            <button onClick={() => setGenError('')} className="ml-auto text-slate-400 hover:text-slate-600">✕</button>
          </div>
        )}
      </div>

      {/* Volume Create Modal */}
      {showVolumeModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowVolumeModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-semibold text-slate-800">新建卷目</h3>
              <button onClick={() => setShowVolumeModal(false)} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
            </div>
            <div className="p-5">
              <label className="block text-xs font-medium text-slate-500 mb-1">卷名</label>
              <input type="text" value={newVolumeTitle} onChange={e => setNewVolumeTitle(e.target.value)}
                placeholder="例如：第1卷 少年崛起"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
              />
            </div>
            <div className="px-5 py-4 border-t border-slate-100 flex gap-2">
              <button onClick={handleCreateVolume} className="flex-1 px-4 py-2 bg-gradient-to-r from-violet-500 to-purple-500 text-white rounded-lg text-sm font-medium hover:from-violet-600 hover:to-purple-600">
                创建
              </button>
              <button onClick={() => setShowVolumeModal(false)} className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg text-sm hover:bg-slate-50">取消</button>
            </div>
          </div>
        </div>
      )}

      {/* Back Link */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
        <Link href="/novel" className="text-sm text-slate-400 hover:text-indigo-600">← 返回小说列表</Link>
      </div>
    </div>
  );
}