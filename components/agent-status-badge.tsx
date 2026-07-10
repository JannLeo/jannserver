'use client';
// components/agent-status-badge.tsx

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  idle:    { label: '空闲',   color: 'text-gray-400',  bg: 'bg-gray-100'  },
  running: { label: '运行中', color: 'text-blue-600',  bg: 'bg-blue-50'   },
  blocked: { label: '阻塞',   color: 'text-amber-600', bg: 'bg-amber-50'  },
  done:    { label: '已完成', color: 'text-green-600', bg: 'bg-green-50'  },
  error:   { label: '错误',   color: 'text-red-600',   bg: 'bg-red-50'    },
};

interface Props {
  status: string;
  className?: string;
}

export default function AgentStatusBadge({ status, className = '' }: Props) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, color: 'text-gray-500', bg: 'bg-gray-50' };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color} ${cfg.bg} ${className}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${
        status === 'running' ? 'bg-blue-500 animate-pulse' :
        status === 'blocked' ? 'bg-amber-500' :
        status === 'done'    ? 'bg-green-500' :
        status === 'error'   ? 'bg-red-500' :
        'bg-gray-400'
      }`} />
      {cfg.label}
    </span>
  );
}