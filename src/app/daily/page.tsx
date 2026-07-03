'use client';
import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { useRouter } from 'next/navigation';

export default function DailyRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace(`/daily/${format(new Date(), 'yyyy-MM-dd')}`);
  }, [router]);
  return <div className="p-6 text-slate-400">跳转中...</div>;
}