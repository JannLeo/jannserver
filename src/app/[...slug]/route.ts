import { NextRequest, NextResponse } from 'next/server';
import { documents } from '@/lib/system-prompts';
import * as fs from 'fs';
import * as path from 'path';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string[] } }
) {
  const slugParts = params.slug || [];
  const filename = slugParts[slugParts.length - 1] || '';

  // 支持 /slug.md 和 /slug 两种格式
  const docSlug = filename.replace(/\.md$/, '').replace(/-/g, '_');

  // 1. 先查 system-prompts.ts 数据库
  const doc = documents.find(d => d.slug === docSlug);
  if (doc) {
    return new NextResponse(doc.content, {
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  }

  // 2. 查 repos/ 下是否有对应 .md 文件（来自克隆的仓库）
  const reposDir = '/home/sz/workspace/repos';
  // 尝试直接文件路径
  for (const dir of fs.readdirSync(reposDir)) {
    const repoPath = path.join(reposDir, dir);
    const mdPath = path.join(repoPath, filename + '.md');
    if (fs.existsSync(mdPath)) {
      const content = fs.readFileSync(mdPath, 'utf8');
      return new NextResponse(content, {
        headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
      });
    }
  }

  return new NextResponse('# 404 Not Found\n\n文件不存在', {
    status: 404,
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  });
}