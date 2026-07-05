'use client';

export default function ImageGenPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      {/* Banner */}
      <section className="surface-card relative overflow-hidden rounded-2xl p-6 sm:p-8">
        <div className="relative">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-stone-500">Creative</p>
          <h1 className="mt-2 text-3xl font-black tracking-[-0.04em] text-stone-950 sm:text-4xl">🎨 AI 图像生成</h1>
          <p className="mt-3 max-w-xl text-sm text-stone-600">
            使用 AI 生成图像（DALL·E / Stable Diffusion 等）
          </p>
        </div>
      </section>

      <div className="mt-10 rounded-2xl border border-dashed border-stone-200 py-20 text-center">
        <div className="text-6xl">✨</div>
        <p className="mt-4 text-lg font-bold text-stone-500">即将开放</p>
        <p className="mt-2 text-sm text-stone-400">AI 图像生成功能正在开发中…</p>
      </div>
    </div>
  );
}