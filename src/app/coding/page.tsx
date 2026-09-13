"use client";
import NavBar from '@/components/NavBar';
import { useEffect, useRef } from 'react';

export default function CodingPage() {
  // iframe will load the OpenCode proxy
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // When page mounts, ensure iframe src is set (Next may hydrate later)
  useEffect(() => {
    if (iframeRef.current) {
      iframeRef.current.src = '/coding-proxy/';
    }
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <NavBar title="🧩 编码助手" />
      <div className="p-4">
        <iframe
          ref={iframeRef}
          src="/coding-proxy/"
          className="w-full h-[calc(100vh-120px)] border border-gray-200 rounded-md"
          sandbox="allow-scripts allow-same-origin allow-forms"
        />
      </div>
    </div>
  );
}
