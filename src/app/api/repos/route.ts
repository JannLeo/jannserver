// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import {
  getAllRepos,
  createRepo,
  validateRepoUrl,
  validateLocalPath,
} from '@/lib/repos';
import path from 'path';
import { REPOS_BASE_DIR } from '@/lib/paths';

// GET /api/repos
export async function GET() {
  try {
    const repos = getAllRepos();
    return NextResponse.json(repos);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// POST /api/repos
export async function POST(req: NextRequest) {
  try {
    const { name, url, branch } = await req.json();

    if (!name || !url) {
      return NextResponse.json({ error: 'name 和 url 必填' }, { status: 400 });
    }

    if (!validateRepoUrl(url)) {
      return NextResponse.json(
        { error: 'URL 必须以 https://github.com/JannLeo/ 开头' },
        { status: 400 }
      );
    }

    const localPath = path.resolve(REPOS_BASE_DIR, name);
    if (!validateLocalPath(localPath)) {
      return NextResponse.json({ error: '无效的本地路径' }, { status: 400 });
    }

    createRepo({ name, url, branch: branch || 'main' });

    const repos = getAllRepos();
    const created = repos.find(r => r.name === name);
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}