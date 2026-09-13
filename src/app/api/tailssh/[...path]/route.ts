import { NextRequest, NextResponse } from 'next/server';

const TAILSSH_BACKEND = process.env.TAILSSH_BACKEND || 'http://localhost:9222';

export async function GET(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const targetPath = path.join('/');
  const url = `${TAILSSH_BACKEND}/${targetPath}${request.nextUrl.search}`;
  try {
    const res = await fetch(url, {
      headers: { ...Object.fromEntries(request.headers.entries()) },
      credentials: 'include',
    });
    const data = await res.json().catch(() => null);
    if (data === null) return new Response(res.statusText, { status: res.status });
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: '网络错误', detail: e.message }, { status: 502 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const targetPath = path.join('/');
  const url = `${TAILSSH_BACKEND}/${targetPath}`;
  try {
    const body = await request.text();
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    const data = await res.json().catch(() => null);
    if (data === null) return new Response(res.statusText, { status: res.status });
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: '网络错误', detail: e.message }, { status: 502 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const targetPath = path.join('/');
  const url = `${TAILSSH_BACKEND}/${targetPath}`;
  try {
    const res = await fetch(url, { method: 'DELETE' });
    const data = await res.json().catch(() => null);
    if (data === null) return new Response(res.statusText, { status: res.status });
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: '网络错误', detail: e.message }, { status: 502 });
  }
}