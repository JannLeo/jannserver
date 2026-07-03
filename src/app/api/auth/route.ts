import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { sessionOptions } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const res = NextResponse.next();
  const session = await getIronSession(req, res, sessionOptions);
  return NextResponse.json({
    userId: (session as any).userId || null,
    username: (session as any).username || null,
  });
}