'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function TerminalRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/tailssh'); }, [router]);
  return null;
}