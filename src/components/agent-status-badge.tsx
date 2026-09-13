'use client';
// Stub - original component missing
export default function AgentStatusBadge({ status }: { status?: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-slate-100 text-xs text-slate-600">
      <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
      {status || 'unknown'}
    </span>
  );
}
