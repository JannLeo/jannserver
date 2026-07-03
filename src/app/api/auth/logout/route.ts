import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { sessionOptions } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const res = NextResponse.json({ ok: true });
  const session = await getIronSession(req, res, sessionOptions);
  (session as any).destroy?.();
  return res;
}