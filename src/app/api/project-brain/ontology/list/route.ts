import { NextRequest, NextResponse } from 'next/server';
import { listOntologyEntities, getOntologySummary, type EntityType } from '@/lib/projectOntology';
import { getProjectContext } from '@/lib/projectBrain';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_ENTITY_TYPES = [
  'project', 'module', 'feature', 'config', 'build_target',
  'file', 'symbol', 'commit', 'bug', 'test_case',
  'requirement', 'decision', 'document',
];

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const repoName = (url.searchParams.get('repoName') || '').trim();
  const entityType = (url.searchParams.get('entityType') || '').trim() as EntityType | '';
  const q = (url.searchParams.get('q') || '').trim();
  const limitStr = url.searchParams.get('limit') || '';
  const limit = limitStr ? Math.min(500, Math.max(1, Number(limitStr) || 200)) : 200;

  if (!repoName) {
    return NextResponse.json({ error: 'repoName 是必填项' }, { status: 400 });
  }
  if (entityType && !VALID_ENTITY_TYPES.includes(entityType)) {
    return NextResponse.json(
      { error: `entityType 必须是: ${VALID_ENTITY_TYPES.join(', ')}` },
      { status: 400 }
    );
  }

  const ctx = getProjectContext(repoName);
  if (!ctx) {
    return NextResponse.json(
      {
        ok: false,
        error: `repo not found or path invalid: ${repoName}`,
        hint: '请先在 /repos 添加该 repo 并完成一次同步',
      },
      { status: 404 }
    );
  }

  const summary = getOntologySummary(ctx.repoId, ctx.repoName);
  const entities = listOntologyEntities(ctx.repoId, {
    entityType: (entityType || undefined) as EntityType | undefined,
    q: q || undefined,
    limit,
  });

  return NextResponse.json({
    ok: true,
    ...summary,
    entities,
  });
}
