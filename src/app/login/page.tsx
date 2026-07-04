'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

function LogoIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="40" height="40" rx="10" fill="url(#grad)"/>
      <rect x="8" y="8" width="10" height="10" rx="3" fill="white" opacity="0.9"/>
      <rect x="22" y="8" width="10" height="10" rx="3" fill="white" opacity="0.6"/>
      <rect x="8" y="22" width="10" height="10" rx="3" fill="white" opacity="0.6"/>
      <rect x="22" y="22" width="10" height="10" rx="3" fill="white" opacity="0.9"/>
      <defs>
        <linearGradient id="grad" x1="0" y1="0" x2="40" y2="40">
          <stop stopColor="#3B82F6"/>
          <stop offset="1" stopColor="#6366F1"/>
        </linearGradient>
      </defs>
    </svg>
  );
}

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (res.ok) {
      router.push('/dashboard');
    } else {
      const data = await res.json();
      setError(data.error || '用户名或密码错误');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-100 via-blue-50 to-indigo-50">
      <div className="w-full max-w-sm mx-4">
        {/* Logo & Branding */}
        <div className="flex flex-col items-center mb-8">
          <div className="mb-4 drop-shadow-lg">
            <LogoIcon />
          </div>
          <h1 className="text-2xl font-bold text-slate-800">Jann 的工作台</h1>
          <p className="text-sm text-slate-500 mt-1">个人知识与任务管理系统</p>
        </div>

        {/* Login Card */}
        <div className="bg-white p-7 rounded-2xl shadow-lg shadow-blue-100/50 border border-slate-100">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">用户名</label>
              <input
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-300 transition"
                placeholder="输入用户名"
                value={username}
                onChange={e => setUsername(e.target.value)}
                autoComplete="username"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">密码</label>
              <input
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-300 transition"
                type="password"
                placeholder="输入密码"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            {error && (
              <div className="bg-red-50 border border-red-100 text-red-600 text-sm px-3 py-2 rounded-lg">
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-blue-500 to-indigo-500 text-white rounded-xl py-2.5 text-sm font-medium hover:from-blue-600 hover:to-indigo-600 transition shadow-sm shadow-blue-200 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  登录中...
                </>
              ) : '登录'}
            </button>
          </form>
        </div>

        <p className="text-xs text-slate-400 mt-5 text-center leading-relaxed">
          首次使用请先运行 <code className="bg-white/80 px-1.5 py-0.5 rounded text-slate-600 font-mono text-xs shadow-sm">pnpm init-admin</code> 初始化管理员账号
        </p>
      </div>
    </div>
  );
}