#!/usr/bin/env bash
# create-agent-worktree.sh
# 用法: ./scripts/create-agent-worktree.sh <agent-name> <issue-number> <short-desc>
# 示例: ./scripts/create-agent-worktree.sh hermes-a 123 fix-ask-wiki-exact

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# 默认路径
SANDBOX_ROOT="/models-ssd/agent-sandboxes"
DATA_ROOT="/models-ssd/agent-data"

# 参数校验
if [ $# -ne 3 ]; then
  echo "用法: $0 <agent-name> <issue-number> <short-desc>"
  echo "示例: $0 hermes-a 123 fix-ask-wiki-exact"
  exit 1
fi

AGENT_NAME="$1"
ISSUE_NUM="$2"
SHORT_DESC="$3"

BRANCH_NAME="agent/${AGENT_NAME}/issue-${ISSUE_NUM}-${SHORT_DESC}"
WORKTREE_PATH="${SANDBOX_ROOT}/${AGENT_NAME}/issue-${ISSUE_NUM}-${SHORT_DESC}"
DATA_DIR="${DATA_ROOT}/${AGENT_NAME}/issue-${ISSUE_NUM}-${SHORT_DESC}"

cd "$REPO_ROOT"

echo "=== Agent Worktree 创建 ==="
echo "Agent:      $AGENT_NAME"
echo "Issue:      #$ISSUE_NUM"
echo "Branch:     $BRANCH_NAME"
echo "Worktree:   $WORKTREE_PATH"
echo "Data Dir:   $DATA_DIR"
echo

# 检查是否已存在
if [ -d "$WORKTREE_PATH" ]; then
  echo "❌ Worktree 已存在: $WORKTREE_PATH"
  echo "   删除请运行: git worktree remove \"$WORKTREE_PATH\""
  exit 1
fi

# 确保父目录存在
mkdir -p "$(dirname "$WORKTREE_PATH")"
mkdir -p "$DATA_ROOT/$AGENT_NAME"

# 获取最新 main
echo "[1/5] 获取 origin/main ..."
git fetch origin main --quiet

# 创建 worktree + 新分支
echo "[2/5] 创建 worktree + 分支 ..."
git worktree add -b "$BRANCH_NAME" "$WORKTREE_PATH" "origin/main"

# 创建独立 DATA_DIR 并写入 .env.local
echo "[3/5] 初始化独立 DATA_DIR ..."
mkdir -p "$DATA_DIR"
cat > "$WORKTREE_PATH/.env.local" << EOF
# 独立 Agent 数据目录（不污染生产 data/）
DATA_DIR=$DATA_DIR

# 不继承生产环境变量
DB_PATH=$DATA_DIR/app.db
EOF

# 复制依赖（pnpm install）
echo "[4/5] 安装依赖 ..."
cd "$WORKTREE_PATH"
if [ -f pnpm-lock.yaml ]; then
  pnpm install --frozen-lockfile --ignore-scripts 2>/dev/null || pnpm install 2>/dev/null || true
fi

# 初始化 git user（如果未配置）
if [ -z "$(git config user.email 2>/dev/null)" ]; then
  git config user.email "agent@${AGENT_NAME}.local"
  git config user.name "Agent ${AGENT_NAME}"
fi

# 推送分支
echo "[5/5] 推送分支到 origin ..."
cd "$WORKTREE_PATH"
git push -u origin "$BRANCH_NAME" 2>&1 || echo "   (push failed — check credentials, branch still local)"

echo
echo "=== ✅ Worktree 创建完成 ==="
echo
echo "进入 worktree:"
echo "  cd $WORKTREE_PATH"
echo
echo "启动独立服务（测试用）:"
echo "  cd $WORKTREE_PATH"
echo "  DATA_DIR=$DATA_DIR pnpm dev"
echo
echo "运行 smoke 测试:"
echo "  cd $WORKTREE_PATH"
echo "  ../scripts/smoke.sh"
echo
echo "创建 PR:"
echo "  gh pr create --fill"
echo
echo "合并后清理 worktree:"
echo "  git worktree remove \"$WORKTREE_PATH\""
echo "  git push origin --delete \"$BRANCH_NAME\""
echo
echo "⚠️  禁止修改生产 DATA_DIR: /home/sz/workspace/data/"