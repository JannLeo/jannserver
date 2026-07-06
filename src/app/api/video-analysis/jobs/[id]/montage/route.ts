// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { db, initDb } from '@/lib/db/index';
import { videoAnalysisJobs, videoAnalysisItems } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { spawn } from 'child_process';
import { writeFileSync, mkdirSync } from 'fs';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/video-analysis/jobs/[id]/montage — check status/output
// POST /api/video-analysis/jobs/[id]/montage — trigger montage generation
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const id = parseInt(params.id, 10);
  if (isNaN(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  initDb();
  const job = db.select().from(videoAnalysisJobs).where(eq(videoAnalysisJobs.id, id)).get();
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

  return NextResponse.json({
    id,
    status: job.status,
    hasMontage: !!job.message?.includes('montage') || false,
  });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const id = parseInt(params.id, 10);
  if (isNaN(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  initDb();
  const job = db.select().from(videoAnalysisJobs).where(eq(videoAnalysisJobs.id, id)).get();
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

  // Get top items for context
  const items = db
    .select()
    .from(videoAnalysisItems)
    .where(eq(videoAnalysisItems.jobId, id))
    .limit(5)
    .all();

  const itemList = items.map(it => ({
    title: it.title,
    author: it.authorName,
    content: (it.content || '').slice(0, 500),
  }));

  const description = itemList.length > 0
    ? itemList.map(i => `《${i.title}》by ${i.author}：${i.content}`).join('\n---\n')
    : job.message || '';

  const title = `【视频分析报告】${job.keyword || job.targetUrl || `Job #${id}`}`;

  // Spawn Python background process
  const scriptPath = path.resolve(process.cwd(), 'scripts/run_montage.py');
  const outputDir = path.resolve(process.cwd(), 'public/montage-outputs');
  mkdirSync(outputDir, { recursive: true });

  return new Promise<Response>((resolve) => {
    const proc = spawn(
      'python3',
      [scriptPath, String(id), title, description],
      { cwd: process.cwd(), env: { ...process.env } }
    );

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });

    proc.on('error', (err) => {
      resolve(NextResponse.json({ ok: false, error: err.message }, { status: 500 }));
    });

    proc.on('close', (code) => {
      try {
        if (code === 0) {
          const result = JSON.parse(stdout);
          resolve(NextResponse.json({ ok: true, ...result }));
        } else {
          resolve(NextResponse.json({
            ok: false,
            error: `Script failed (exit ${code}): ${stderr || stdout}`.slice(0, 500)
          }, { status: 500 }));
        }
      } catch (e) {
        resolve(NextResponse.json({
          ok: false,
          error: `Parse error: ${(stderr || stdout).slice(0, 300)}`
        }, { status: 500 }));
      }
    });

    // Timeout after 3 minutes
    setTimeout(() => {
      proc.kill();
      resolve(NextResponse.json({ ok: false, error: '生成超时（3分钟）' }, { status: 504 }));
    }, 180_000);
  });
}