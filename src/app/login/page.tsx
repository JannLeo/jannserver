'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (res.ok) {
      router.push('/dashboard');
    } else {
      const data = await res.json();
      setError(data.error || '登录失败');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100">
      <div className="bg-white p-8 rounded-xl shadow-md w-full max-w-sm">
        <h1 className="text-2xl font-bold mb-6 text-center">个人工作台</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            className="w-full border border-slate-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="用户名"
            value={username}
            onChange={e => setUsername(e.target.value)}
          />
          <input
            className="w-full border border-slate-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            type="password"
            placeholder="密码"
            value={password}
            onChange={e => setPassword(e.target.value)}
          />
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button className="w-full bg-blue-500 text-white rounded-lg py-2 hover:bg-blue-600 transition">
            登录
          </button>
        </form>
        <p className="text-xs text-slate-400 mt-4 text-center">
          首次使用请先运行 <code className="bg-slate-100 px-1 rounded">pnpm init-admin</code> 初始化管理员账号
        </p>
      </div>
    </div>
  );
}