'use client';
import NavBar from '@/components/NavBar';

export default function StockAnalysisPage() {
  return (
    <div className="page-shell flex flex-col" style={{ height: '100vh', overflow: 'hidden' }}>
      <NavBar title="📊 股票智能分析" />
      <div className="flex-1 relative overflow-hidden">
        <iframe
          src="/stock/index.html"
          className="absolute inset-0 w-full h-full border-0"
          title="股票智能分析系统"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        />
      </div>
    </div>
  );
}