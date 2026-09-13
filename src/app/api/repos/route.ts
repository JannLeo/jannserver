import { NextRequest, NextResponse } from 'next/server';
import {
  createRepo,
  getAllRepos,
  validateBranch,
  validateRepoName,
  validateRepoUrl,
} from '@/lib/repos';

// GET /api/repos
export async function GET() {
  try {
    return NextResponse.json(getAllRepos());
  } catch (error) {
    console.error('[api/repos] failed to list repositories', error);
    return NextResponse.json({ error: 'Failed to list repositories' }, { status: 500 });
  }
}

// POST /api/repos
export async function POST(req: NextRequest) {
  try {
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: '请求体必须是 JSON' }, { status: 400 });
    }

    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const url = typeof body.url === 'string' ? body.url.trim() : '';
    const branch = typeof body.branch === 'string' && body.branch.trim() ? body.branch.trim() : 'main';

    if (!name || !url) {
      return NextResponse.json({ error: 'name 和 url 必填' }, { status: 400 });
    }
    if (!validateRepoName(name)) {
      return NextResponse.json(
        { error: 'name 只能包含字母、数字、点、下划线和连字符，最长 100 字符' },
        { status: 400 },
      );
    }
    if (!validateRepoUrl(url)) {
      return NextResponse.json(
        { error: 'URL 必须是 https://github.com/JannLeo/<repo>' },
        { status: 400 },
      );
    }
    if (!validateBranch(branch)) {
      return NextResponse.json({ error: '无效的 Git 分支名' }, { status: 400 });
    }

    const duplicate = getAllRepos().find((repo) => repo.name === name || repo.url === url);
    if (duplicate) {
      return NextResponse.json({ error: '该仓库已经登记' }, { status: 409 });
    }

    const created = createRepo({ name, url, branch });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error('[api/repos] failed to create repository', error);
    return NextResponse.json({ error: 'Failed to create repository' }, { status: 500 });
  }
}
