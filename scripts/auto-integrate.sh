#!/bin/bash
# /home/sz/workspace/scripts/auto-integrate.sh
# 后台脚本：用 Claude Code 自动整合 GitHub 仓库到工作台
# 用法: ./auto-integrate.sh <repo_url> <repo_name> "<integration_steps>" "<task_id>"

set -e

REPO_URL="$1"
REPO_NAME="$2"
INTEGRATION_STEPS="$3"
TASK_ID="$4"
WORKSPACE_DIR="/home/sz/workspace"
TMP_DIR="/tmp/integration-workspace"
INTEGRATION_LOG="/tmp/integration-${TASK_ID}.log"

log() {
  echo "[$(date '+%H:%M:%S')] $*" | tee -a "$INTEGRATION_LOG"
}

mkdir -p "$TMP_DIR"
log "🚀 开始整合仓库: $REPO_NAME"
log "📋 整合步骤: $INTEGRATION_STEPS"

# Clone repo
CLONE_DIR="$TMP_DIR/$REPO_NAME"
if [ -d "$CLONE_DIR" ]; then
  log "仓库已存在，拉取最新..."
  git -C "$CLONE_DIR" pull --ff
else
  log "克隆仓库..."
  git clone --depth 1 "$REPO_URL" "$CLONE_DIR" 2>&1 | tee -a "$INTEGRATION_LOG"
fi

# 分析仓库结构
log "📂 分析仓库结构..."
STRUCTURE=$(find "$CLONE_DIR" -maxdepth 3 -type f \( -name "*.json" -o -name "*.yaml" -o -name "*.yml" -o -name "README.md" -o -name "package.json" -o -name "pyproject.toml" \) | head -20 | xargs wc -l 2>/dev/null | sort -rn | head -10)

log "仓库结构:\n$STRUCTURE"

# 构建 Claude Code prompt
PROMPT="You are helping integrate the GitHub repository '${REPO_NAME}' into a personal workspace (Next.js 14 workspace at ${WORKSPACE_DIR}).

**Your task:**
1. Analyze this repository at ${CLONE_DIR}
2. Based on the integration steps needed: ${INTEGRATION_STEPS}
3. The workspace is a personal productivity tool with features:
   - Task management (tasks table)
   - Notes / memos / daily summaries
   - GitHub repo sync (爬取文档建立知识库)
   - AI-powered Q&A
   - News aggregation
   - Self-study courses & flashcards
   - Video analysis
   - Novel writing
   - WorldQuant BRAIN quantitative analysis
   - TailSSH terminal

**What to do:**
- Read the repo structure and understand what it does
- If it can be integrated as a new feature/page/module, implement it in the workspace
- If it's a standalone tool, create a wrapper page or integration
- If it requires significant work, just add it to the workspace TODO and create a detailed implementation plan

**IMPORTANT:**
- Work in ${WORKSPACE_DIR}
- After analysis, summarize what you found and what the integration would involve
- Be practical: only implement what can be done in a few hours
- Create or update relevant files

Start by exploring the repository."

# 写入任务描述
cat > /tmp/integration-prompt-${TASK_ID}.txt << 'PROMPTEND'
You are helping integrate a GitHub repository into a personal workspace.
PROMPTEND

log "🤖 启动 Claude Code 进行分析..."
export CLAUDE_CODE_SIMPLE=1
export ANTHROPIC_BASE_URL=http://127.0.0.1:8082
export ANTHROPIC_API_KEY=freecc
cd "$WORKSPACE_DIR"

# Run Claude Code in background, output to log file
timeout 600 claude << 'EOF' 2>&1 | tee -a "$INTEGRATION_LOG"
$(cat /tmp/integration-prompt-${TASK_ID}.txt)
EOF

log "✅ Claude Code 整合完成"
log "📄 日志: $INTEGRATION_LOG"
echo "Done at $(date)" >> "$INTEGRATION_LOG"