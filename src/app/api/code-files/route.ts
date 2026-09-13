import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/index';
import { projectCodeFiles, projectSymbols, repoSources } from '@/lib/db/schema';
import { eq, like, and, or } from 'drizzle-orm';
import { getCodeFileContent } from '@/lib/projectBrain';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_QUERY_LENGTH = 256;

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const repoIdStr = url.searchParams.get('repoId') || '';
  const repoId = Number(repoIdStr);
  if (!Number.isSafeInteger(repoId) || repoId <= 0) {
    return NextResponse.json({ error: 'repoId 是必填项' }, { status: 400 });
  }

  const q = (url.searchParams.get('q') || '').trim();
  const symbol = (url.searchParams.get('symbol') || '').trim();
  if (q.length > MAX_QUERY_LENGTH || symbol.length > MAX_QUERY_LENGTH) {
    return NextResponse.json({ error: '搜索参数过长' }, { status: 400 });
  }

  const fileIdStr = url.searchParams.get('fileId') || '';
  const fileId = fileIdStr ? Number(fileIdStr) : 0;
  if (fileIdStr && (!Number.isSafeInteger(fileId) || fileId <= 0)) {
    return NextResponse.json({ error: '无效的 fileId' }, { status: 400 });
  }

  // 校验 repo 存在
  const repoRow = db.select().from(repoSources).where(eq(repoSources.id, repoId)).get() as any;
  if (!repoRow) {
    return NextResponse.json({ error: 'repo not found' }, { status: 404 });
  }

  // 模式 1: 取单个文件内容（用于 /code 页面右侧详情）
  if (fileId) {
    // Bind fileId to repoId before touching disk. Previously a caller could use
    // repo A's id with repo B's file id and receive B's content labeled as A.
    const fileRow = db
      .select({ id: projectCodeFiles.id })
      .from(projectCodeFiles)
      .where(and(eq(projectCodeFiles.id, fileId), eq(projectCodeFiles.repoId, repoId)))
      .get();
    if (!fileRow) {
      return NextResponse.json({ error: 'file not found in repository' }, { status: 404 });
    }

    const content = getCodeFileContent(fileId);
    if (!content) {
      return NextResponse.json({ error: 'file not found or unreadable' }, { status: 404 });
    }
    return NextResponse.json({
      ok: true,
      repoId,
      repoName: repoRow.name,
      fileId,
      relPath: content.relPath,
      language: content.language,
      content: content.content,
      symbols: content.symbols,
    });
  }

  // 模式 2: 搜索文件 / 符号
  // 默认列出文件列表（最多 500 条），按 relPath 排序
  const fileRows = db
    .select({
      id: projectCodeFiles.id,
      relPath: projectCodeFiles.relPath,
      language: projectCodeFiles.language,
      sizeBytes: projectCodeFiles.sizeBytes,
      summary: projectCodeFiles.summary,
      indexedAt: projectCodeFiles.indexedAt,
    })
    .from(projectCodeFiles)
    .where(eq(projectCodeFiles.repoId, repoId))
    .all() as any[];

  let filteredFiles = fileRows;
  if (q) {
    const pattern = `%${q}%`;
    filteredFiles = fileRows.filter(
      (f) =>
        f.relPath.toLowerCase().includes(q.toLowerCase()) ||
        String(f.summary || '').toLowerCase().includes(q.toLowerCase())
    );
    // 若 LIKE 文件路径命中不足，尝试用 raw SQL pattern（drizzle like 用 ? 占位符）
    if (filteredFiles.length === 0) {
      try {
        const likeRows = db
          .select({
            id: projectCodeFiles.id,
            relPath: projectCodeFiles.relPath,
            language: projectCodeFiles.language,
            sizeBytes: projectCodeFiles.sizeBytes,
            summary: projectCodeFiles.summary,
            indexedAt: projectCodeFiles.indexedAt,
          })
          .from(projectCodeFiles)
          .where(
            and(
              eq(projectCodeFiles.repoId, repoId),
              or(like(projectCodeFiles.relPath, pattern), like(projectCodeFiles.summary, pattern))
            )
          )
          .limit(200)
          .all() as any[];
        filteredFiles = likeRows;
      } catch {}
    }
  }

  // 取符号（仅在 symbol 参数提供或单文件展开时返回）
  let symbolRows: any[] = [];
  if (symbol) {
    const pattern = `%${symbol}%`;
    symbolRows = db
      .select({
        id: projectSymbols.id,
        fileId: projectSymbols.fileId,
        symbolType: projectSymbols.symbolType,
        name: projectSymbols.name,
        signature: projectSymbols.signature,
        startLine: projectSymbols.startLine,
        endLine: projectSymbols.endLine,
      })
      .from(projectSymbols)
      .where(and(eq(projectSymbols.repoId, repoId), like(projectSymbols.name, pattern)))
      .limit(100)
      .all() as any[];

    // 把文件路径映射进符号结果
    const fileMap = new Map<number, string>();
    for (const f of fileRows) fileMap.set(f.id, f.relPath);
    symbolRows = symbolRows.map((s) => ({ ...s, relPath: fileMap.get(s.fileId) || '' }));
  }

  return NextResponse.json({
    ok: true,
    repoId,
    repoName: repoRow.name,
    files: filteredFiles.slice(0, 500),
    symbols: symbolRows,
    total: filteredFiles.length,
  });
}
