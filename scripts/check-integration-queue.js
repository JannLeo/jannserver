#!/usr/bin/env node
/**
 * scripts/check-integration-queue.js
 * 每 5 分钟 cron 调用，检查待执行的 Claude Code 整合任务并执行
 */
const Database = require('better-sqlite3');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.resolve(__dirname, '../data/app.db');
const WORKSPACE_DIR = path.resolve(__dirname, '..');

const log = (msg) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);

async function markDone(taskId) {
  let db;
  try {
    db = new Database(DB_PATH);
    db.prepare("UPDATE tasks SET status='done', completed_at=datetime('now') WHERE id=?").run(taskId);
    db.close();
  } catch (e) {
    log(`markDone failed: ${e.message}`);
  }
}

function runIntegration(task) {
  const taskId = task.id;
  const title = task.title || '';
  const description = task.description || '';
  const repoName = title.replace('🤖 整合: ', '').trim();

  // 从 description 提取 repo URL
  const urlMatch = description.match(/https:\/\/github\.com\/[^\s*]+/);
  const repoUrl = urlMatch ? urlMatch[0] : `https://github.com/${repoName}`;

  log(`开始: ${repoName}`);

  const safeName = repoName.replace(/[^a-zA-Z0-9]/g, '_');
  const cloneDir = `/tmp/integration-workspace/${safeName}`;
  const logFile = `/tmp/integration-${taskId}.log`;
  fs.mkdirSync('/tmp/integration-workspace', { recursive: true });

  // Claude Code prompt
  const prompt = `You are integrating GitHub repository '${repoName}' into Jann's personal workspace at ${WORKSPACE_DIR}.

WORKSPACE STACK: Next.js 14 (App Router) + TypeScript + Tailwind CSS + SQLite (better-sqlite3) + Prisma/Drizzle ORM
ALREADY HAS: Task management, Notes, GitHub repo sync (爬取文档建立知识库), AI Q&A, News, Video analysis, Self-study courses, Novel writing, WorldQuant BRAIN quant, TailSSH terminal, Code search

YOUR JOB:
1. If ${cloneDir} doesn't exist, git clone ${repoUrl} there first
2. Explore the repo at ${cloneDir}
3. Decide: can it be integrated as a new page/route/API/script in ${WORKSPACE_DIR}?
   - If yes → implement it (keep it simple, <30min)
   - If too complex → create ${WORKSPACE_DIR}/INTEGRATION_PLAN_${safeName}.md with a plan
4. Commit any changes you make
5. When done, mark task ${taskId} as completed by running:
   sqlite3 ${DB_PATH} "UPDATE tasks SET status='done', completed_at=datetime('now') WHERE id='${taskId}'"
6. Also manually run: sqlite3 ${DB_PATH} "UPDATE tasks SET status='done', completed_at=datetime('now') WHERE id='${taskId}'"

IMPORTANT:
- Be practical, only implement what's doable in 30min
- If integration requires >2h work, just write a plan file and mark done
- After your work finishes, ALWAYS run the sqlite3 UPDATE command above`;

  const promptFile = `/tmp/claude-prompt-${taskId}.txt`;
  fs.writeFileSync(promptFile, prompt);

  const shScript = `#!/bin/bash
set -e
cd ${WORKSPACE_DIR}

# 先清除代理，确保 git 直连 GitHub
unset http_proxy https_proxy HTTP_PROXY HTTPS_PROXY no_proxy NO_PROXY

# Clone if needed
if [ ! -d "${cloneDir}" ]; then
  echo "Cloning ${repoUrl}..." | tee -a ${logFile}
  git clone --depth 1 "${repoUrl}" "${cloneDir}" 2>&1 | tee -a ${logFile} || { echo "Clone failed (continuing)" | tee -a ${logFile}; }
fi

# Claude Code 环境
export CLAUDE_CODE_SIMPLE=1
export ANTHROPIC_BASE_URL=http://127.0.0.1:8082
export ANTHROPIC_API_KEY=freecc
export HOME=/home/sz
export PATH=/home/sz/.nvm/versions/node/v22.23.1/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

echo "Starting Claude Code at $(date)" >> ${logFile}
timeout 1200 /home/sz/.nvm/versions/node/v22.23.1/bin/claude --dangerously-skip-auth < ${promptFile} >> ${logFile} 2>&1 || echo "Claude exited $?"

# Always mark done
node -e "
const Database = require('better-sqlite3');
const db = new Database('${DB_PATH}');
db.prepare(\"UPDATE tasks SET status='done', completed_at=datetime('now') WHERE id=?\").run('${taskId}');
db.close();
console.log('Task ${taskId} marked done');
" 2>&1 >> ${logFile}

echo "Done at $(date)" >> ${logFile}
rm -f ${promptFile}
`;

  const shFile = `/tmp/run-int-${taskId}.sh`;
  fs.writeFileSync(shFile, shScript);
  fs.chmodSync(shFile, 0o755);

  // 启动后台进程（不过滤 env，让 shell 脚本自己 unset）
  const childEnv = { ...process.env };
  // 确保不过滤代理（让 shell 自己 unset）
  const child = spawn('bash', [shFile], {
    detached: true,
    stdio: 'ignore',
    cwd: WORKSPACE_DIR,
    env: childEnv,
  });
  child.unref();

  log(`已启动 Claude Code 整合 ${repoName}，日志: ${logFile}，任务将自动标记完成`);
}

async function main() {
  if (!fs.existsSync(DB_PATH)) {
    log(`DB not found: ${DB_PATH}`);
    return;
  }

  let db;
  try {
    db = new Database(DB_PATH, { readonly: true });
  } catch (e) {
    log(`DB open error: ${e.message}`);
    return;
  }

  const task = db.prepare(`
    SELECT id, title, description, priority, tags
    FROM tasks
    WHERE status = 'in_progress'
      AND source = 'ai'
      AND tags LIKE '%integration%'
      AND tags LIKE '%claude-code%'
    ORDER BY created_at ASC
    LIMIT 1
  `).get();

  db.close();

  if (!task) {
    // 尝试找还没标记为 in_progress 的新任务
    try {
      db = new Database(DB_PATH);
      const newTask = db.prepare(`
        SELECT id, title, description, priority, tags
        FROM tasks
        WHERE status = 'todo'
          AND source = 'ai'
          AND tags LIKE '%integration%'
          AND (tags LIKE '%claude-code%' OR title LIKE '%🤖 整合%')
        ORDER BY created_at ASC
        LIMIT 1
      `).get();
      if (newTask) {
        log(`发现新任务，开始执行: ${newTask.title}`);
        db.prepare("UPDATE tasks SET status='in_progress' WHERE id=?").run(newTask.id);
        task = newTask;
        task.status = 'in_progress';
      }
      db.close();
    } catch (e) {
      log(`update status error: ${e.message}`);
    }
  }

  if (!task) {
    log('没有待执行的整合任务');
    return;
  }

  log(`发现任务 [${task.id}] ${task.title}`);
  runIntegration(task);
}

main().catch(e => log(`Error: ${e.message}`));