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
PROMPT_FILE="/tmp/integration-prompt-${TASK_ID}.txt"

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
  git -C "$CLONE_DIR" pull --ff || true
else
  log "克隆仓库..."
  unset http_proxy https_proxy HTTP_PROXY HTTPS_PROXY no_proxy NO_PROXY
  git clone --depth 1 "$REPO_URL" "$CLONE_DIR" 2>&1 | tee -a "$INTEGRATION_LOG" || {
    log "⚠️ git clone 失败，仓库可能已被清理"
  }
fi

# 分析仓库结构
if [ -d "$CLONE_DIR" ]; then
  log "📂 分析仓库结构..."
  STRUCTURE=$(find "$CLONE_DIR" -maxdepth 3 -type f \( -name "*.json" -o -name "*.yaml" -o -name "*.yml" -o -name "README.md" -o -name "package.json" -o -name "pyproject.toml" \) 2>/dev/null | head -20 | xargs wc -l 2>/dev/null | sort -rn | head -10)
  log "仓库结构:\n$STRUCTURE"
fi

# 构建完整 prompt 并写入文件（包含 integrationSteps）
# 用 Python 处理多行/特殊字符的模板替换，避免 shell 转义问题
python3 << 'PYEOF'
import os

REPO_NAME = os.environ.get('REPO_NAME', '')
INTEGRATION_STEPS = os.environ.get('INTEGRATION_STEPS', '')
WORKSPACE_DIR = os.environ.get('WORKSPACE_DIR', '/home/sz/workspace')
CLONE_DIR = os.environ.get('CLONE_DIR', '')
PROMPT_FILE = os.environ.get('PROMPT_FILE', '/tmp/integration-prompt.txt')

prompt = f"""You are helping integrate the GitHub repository '{REPO_NAME}' into a personal workspace (Next.js 14 workspace at {WORKSPACE_DIR}).

**AI 推荐的整合步骤（来自趋势分析）：**
{INTEGRATION_STEPS}

**Your task:**
1. Analyze this repository at {CLONE_DIR}
2. Based on the integration steps above, implement the integration

**Workspace 技术栈：** Next.js 14 (App Router) + TypeScript + Tailwind CSS + SQLite (better-sqlite3)
**已有功能：** 任务管理、笔记、GitHub 仓库同步、Wiki、AI 问答、新闻聚合、视频分析、自学课程、小说创作、量化分析（WorldQuant BRAIN）、TailSSH 终端、代码搜索

**IMPORTANT:**
- Work in {WORKSPACE_DIR}
- Analyze the repo at {CLONE_DIR}, then implement what the integration steps describe
- Be practical: implement the core integration that matches the described steps
- Create or update relevant files
- Write results and changes to {os.environ.get('INTEGRATION_LOG', '/tmp/integration.log')}

Start by exploring the repository and then follow the integration steps.
"""

with open(PROMPT_FILE, 'w') as f:
    f.write(prompt)
print(f"Prompt written to {PROMPT_FILE}")
PYEOF

log "Prompt 文件: $PROMPT_FILE"

# 启动 Claude Code
log "🤖 启动 Claude Code 进行分析..."
export CLAUDE_CODE_SIMPLE=1
export ANTHROPIC_BASE_URL=http://127.0.0.1:8082
export ANTHROPIC_API_KEY=freecc
unset HTTP_PROXY HTTPS_PROXY http_proxy https_proxy NO_PROXY no_proxy
cd "$WORKSPACE_DIR"

timeout 600 claude < "$PROMPT_FILE" >> "$INTEGRATION_LOG" 2>&1 || {
  log "⚠️ Claude Code 执行完成（可能超时或退出）"
}

log "✅ Claude Code 整合完成"
log "📄 日志: $INTEGRATION_LOG"
echo "Done at $(date)" >> "$INTEGRATION_LOG"