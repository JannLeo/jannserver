// @ts-nocheck
/**
 * /api/ai/integrate-repo
 * 接收整合请求，后台 spawn Claude Code 整合流程
 * 立即返回 task ID，不阻塞 HTTP 响应
 */
import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import { db, initDb } from '@/lib/db/index';
import { tasks as tasksTable } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '无效的请求体' }, { status: 400 });
  }

  const repoUrl = String(body.repoUrl || '').trim();
  const repoName = String(body.repoName || '').trim();
  const integrationSteps = String(body.integrationSteps || '').trim();
  const complexity = String(body.complexity || 'medium');
  const effortHours = Number(body.effortHours) || 2;

  if (!repoUrl || !repoName) {
    return NextResponse.json({ error: '缺少必填参数 repoUrl / repoName' }, { status: 400 });
  }

  // 1. 创建任务记录
  initDb();
  const taskId = randomUUID();
  const title = `🤖 整合: ${repoName}`;
  const description = `**仓库：** ${repoName}\n**地址：** ${repoUrl}\n**复杂度：** ${complexity}\n**预估工时：** ${effortHours}h\n\n**整合步骤：**\n${integrationSteps || '由 Claude Code 自行分析'}\n\n---\n⏱️ 整合流程由 Claude Code 后台执行，预计 ${effortHours} 小时完成。\n完成后此任务将自动标记为已完成。`;

  try {
    db.insert(tasksTable).values({
      id: taskId,
      title,
      description,
      status: 'in_progress',
      priority: complexity === 'high' ? 'high' : 'medium',
      source: 'ai',
      tags: `integration,claude-code,${repoName.replace('/', '-')}`,
    }).run();
  } catch (e) {
    console.error('[integrate-repo] failed to create task:', e);
    return NextResponse.json({ error: '创建任务失败: ' + (e as Error).message }, { status: 500 });
  }

  // 2. Spawn 后台脚本
  const scriptPath = path.resolve(process.cwd(), 'scripts/auto-integrate.sh');
  const logFile = `/tmp/integration-${taskId}.log`;

  try {
    const child = spawn('bash', [
      scriptPath,
      repoUrl,
      repoName,
      integrationSteps,
      taskId,
    ], {
      detached: true,
      stdio: ['ignore', 'ignore', 'ignore'],
      env: { ...process.env, INTEGRATION_TASK_ID: taskId },
    });
    child.unref();

    // 记录 PID 供后续跟踪
    console.log(`[integrate-repo] spawned Claude Code integration: taskId=${taskId}, pid=${child.pid}, log=${logFile}`);
  } catch (e) {
    console.error('[integrate-repo] failed to spawn:', e);
    // 不返回错误，任务已创建，用户可以手动重试
  }

  return NextResponse.json({
    ok: true,
    taskId,
    logFile,
    message: '整合任务已创建并启动后台进程',
  });
}

// 简单的状态查询
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const taskId = searchParams.get('taskId');
  if (!taskId) return NextResponse.json({ error: 'taskId 必填' }, { status: 400 });

  initDb();
  const task = db.select().from(tasksTable).where(eq(tasksTable.id, taskId)).get();
  if (!task) return NextResponse.json({ error: '任务不存在' }, { status: 404 });

  return NextResponse.json({
    task: {
      id: task.id,
      title: task.title,
      status: task.status,
      description: task.description,
    },
    logFile: `/tmp/integration-${taskId}.log`,
  });
}