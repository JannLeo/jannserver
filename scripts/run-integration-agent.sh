#!/bin/bash
# scripts/run-integration-agent.sh
# 定时脚本：从任务队列取 Claude Code 整合任务并执行
# 由 cron 每 5 分钟调用一次

WORKSPACE_DIR="/home/sz/workspace"
LOG="/tmp/integration-cron.log"
LOCK="/tmp/integration-cron.lock"

log() { echo "[$(date '+%m-%d %H:%M:%S')] $*" >> "$LOG"; }

# 防止并发运行
if [ -f "$LOCK" ]; then
  LOCKAGE=$(($(date +%s) - $(stat -c %Y "$LOCK" 2>/dev/null || echo 0)))
  if [ "$LOCKAGE" -lt 300 ]; then
    log "已有实例运行中，退出"
    exit 0
  fi
  log "旧锁已过期，重新获取"
fi
touch "$LOCK"

trap 'rm -f "$LOCK"' EXIT

cd "$WORKSPACE_DIR"

# 从数据库找一条待执行的整合任务
TASK_JSON=$(node -e "
const Database = require('better-sqlite3');
const db = new Database('./data/workspace.db');
const task = db.prepare(\`
  SELECT id, title, description, priority, tags
  FROM tasks
  WHERE status = 'in_progress'
    AND source = 'ai'
    AND tags LIKE '%integration%'
  ORDER BY createdAt ASC
  LIMIT 1
`).get();
db.close();
console.log(JSON.stringify(task || null));
" 2>/dev/null)

if [ -z "$TASK_JSON" ] || [ "$TASK_JSON" = "null" ]; then
  log "没有待执行的整合任务"
  exit 0
fi

TASK_ID=$(echo "$TASK_JSON" | node -e "console.log(JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).id)")
TITLE=$(echo "$TASK_JSON" | node -e "console.log(JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).title || '')")
DESC=$(echo "$TASK_JSON" | node -e "console.log(JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).description || '')")
TAGS=$(echo "$TASK_JSON" | node -e "console.log(JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).tags || '')")
REPO_NAME=$(echo "$TITLE" | sed 's/🤖 整合: //')

log "📋 开始整合任务: $REPO_NAME (id=$TASK_ID)"

# 从 description 中提取 repo URL
REPO_URL=$(echo "$DESC" | grep -oP 'https://github\.com/[^\s*]+' | head -1)
if [ -z "$REPO_URL" ]; then
  REPO_URL="https://github.com/${REPO_NAME}"
fi

LOGFILE="/tmp/integration-${TASK_ID}.log"
mkdir -p /tmp/integration-workspace

# Clone 或更新仓库
CLONE_DIR="/tmp/integration-workspace/${REPO_NAME//\//_}"
if [ -d "$CLONE_DIR" ]; then
  log "仓库已存在，拉取最新..."
  git -C "$CLONE_DIR" pull --ff >> "$LOGFILE" 2>&1 || true
else
  log "克隆仓库 $REPO_URL ..."
  git clone --depth 1 "$REPO_URL" "$CLONE_DIR" >> "$LOGFILE" 2>&1
fi

if [ ! -d "$CLONE_DIR" ]; then
  log "❌ 克隆失败"
  node -e "
const Database = require('better-sqlite3');
const db = new Database('./data/workspace.db');
db.prepare('UPDATE tasks SET status=? WHERE id=?').run('done', '$TASK_ID');
db.close();
" 2>/dev/null
  exit 1
fi

# 构建 Claude Code prompt
cat > /tmp/claude-prompt-${TASK_ID}.txt << PROMPT_EOF
You are helping integrate GitHub repository '${REPO_NAME}' into Jann's personal workspace.

WORKSPACE: ${WORKSPACE_DIR}
REPO_PATH: ${CLONE_DIR}
TASK_ID: ${TASK_ID}

WORKSPACE ALREADY HAS:
- Task management, Notes, GitHub repo sync (爬取文档建立知识库), AI Q&A, News, Video analysis, Self-study courses, Novel writing, WorldQuant BRAIN quant analysis, TailSSH terminal, Code search

YOUR JOB:
1. Explore the repository at ${CLONE_DIR}
2. Understand what it does and how it could fit into the workspace
3. If it's a useful tool/feature → implement integration (new page, API route, component, or script)
4. If it needs a lot of work → create a detailed implementation plan as a markdown file
5. Commit your changes if you make any
6. Update the task status to 'done' when done

IMPORTANT RULES:
- Only implement what can be done in 30 minutes
- Be practical and focused
- If integration requires extensive work (>2h), just create a plan file and mark done
- Work in ${WORKSPACE_DIR}

Start by exploring the repository structure and README.
PROMPT_EOF

log "🤖 启动 Claude Code 整合 ${REPO_NAME}..."
export CLAUDE_CODE_SIMPLE=1
export ANTHROPIC_BASE_URL=http://127.0.0.1:8082
export ANTHROPIC_API_KEY=freecc
export HOME=/home/sz

cd "$WORKSPACE_DIR"
timeout 1800 claude --dangerously-skip-auth << 'CLAUDE_EOF' >> "$LOGFILE" 2>&1
$(cat /tmp/claude-prompt-${TASK_ID}.txt)
CLAUDE_EOF
CLAUDE_EXIT=$?

if [ $? -eq 0 ]; then
  log "✅ Claude Code 完成"
else
  log "⚠️ Claude Code 退出 (exit=$?)"
fi

# 标记任务完成
node -e "
const Database = require('better-sqlite3');
const db = new Database('./data/workspace.db');
db.prepare(\"UPDATE tasks SET status='done', completedAt=? WHERE id=?\").run(new Date().toISOString(), '$TASK_ID');
db.close();
" 2>/dev/null

log "✅ 任务 $TASK_ID 已标记完成，日志: $LOGFILE"
echo "Done at $(date)" >> "$LOGFILE"
rm -f /tmp/claude-prompt-${TASK_ID}.txt