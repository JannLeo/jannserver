#!/usr/bin/env bash
# agent-validate.sh — 深度验证，在 smoke.sh 之后可选运行
# 检查项目完整性、依赖、配置正确性

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BASE_URL="${1:-http://localhost:3000}"
COOKIES="${COOKIES:-/tmp/ws_cookies.txt}"

PASS=0
FAIL=0

ok()  { echo "✅ PASS: $1"; ((PASS++)); }
err() { echo "❌ FAIL: $1"; ((FAIL++)); }

cd "$REPO_ROOT"

echo "=== 代码完整性检查 ==="

# 1. 关键文件存在
echo "--- [1] 关键文件检查 ---"
KEY_FILES=(
  "src/app/api/ai/ask/route.ts"
  "src/app/api/video-analysis/jobs/route.ts"
  "src/app/api/code/route.ts"
  "src/app/knowledge/page.tsx"
  "src/lib/db/index.ts"
  "src/lib/db/schema.ts"
  "src/lib/proxy-fetch.ts"
  "src/middleware.ts"
  "package.json"
  ".env.example"
)
ALL_PRESENT=true
for f in "${KEY_FILES[@]}"; do
  if [ -f "$REPO_ROOT/$f" ]; then
    echo "  ✓ $f"
  else
    echo "  ✗ $f (缺失)"
    ALL_PRESENT=false
  fi
done
$ALL_PRESENT && ok "关键文件完整" || err "关键文件缺失"

# 2. package.json scripts 完整
echo "--- [2] package.json scripts ---"
if grep -q '"dev"' package.json && grep -q '"build"' package.json && grep -q '"pm2"' package.json; then
  ok "package.json scripts 完整"
else
  err "package.json scripts" "缺少 dev/build/pm2 等脚本"
fi

# 3. 数据库表结构
echo "--- [3] 数据库表结构检查 ---"
python3 -c "
import sqlite3, sys
try:
    conn = sqlite3.connect('$REPO_ROOT/data/app.db')
    c = conn.cursor()
    required = ['repo_sources', 'project_code_files', 'video_analysis_jobs', 'novels', 'brain_alphas', 'books']
    for t in required:
        c.execute('SELECT COUNT(*) FROM ' + t)
        cnt = c.fetchone()[0]
        print(f'  ✓ {t}: {cnt} rows')
    conn.close()
" 2>/dev/null && ok "数据库表结构正常" || err "数据库表结构检查失败"

# 4. 知识库文档数量
echo "--- [4] 知识库文档数量 ---"
python3 -c "
import sqlite3
conn = sqlite3.connect('$REPO_ROOT/data/app.db')
c = conn.cursor()
c.execute('SELECT COUNT(*) FROM repo_documents')
cnt = c.fetchone()[0]
print(f'  repo_documents: {cnt}')
c.execute('SELECT COUNT(*) FROM project_code_files')
cnt2 = c.fetchone()[0]
print(f'  project_code_files: {cnt2}')
c.execute('SELECT COUNT(*) FROM embeddings')
cnt3 = c.fetchone()[0]
print(f'  embeddings: {cnt3}')
conn.close()
if cnt > 0: print('  ✓ 知识库有数据')
else: print('  ✗ 知识库无数据（未同步）')
" 2>/dev/null || echo "  (跳过，数据未初始化)"

# 5. Middleware 白名单
echo "--- [5] middleware.ts public paths ---"
if grep -q '/api/news' "$REPO_ROOT/src/middleware.ts"; then
  ok "middleware public paths 已配置"
else
  err "middleware public paths" "未找到 /api/news"
fi

# 6. PM2 进程状态
echo "--- [6] PM2 进程检查 ---"
if npx pm2 list 2>/dev/null | grep -q "personal-workspace"; then
  STATUS=$(npx pm2 list 2>/dev/null | grep "personal-workspace" | awk '{print $10}')
  echo "  personal-workspace: $STATUS"
  if [ "$STATUS" = "online" ]; then
    ok "personal-workspace online"
  else
    err "personal-workspace" "状态: $STATUS (期望 online)"
  fi
else
  err "personal-workspace" "PM2 中未找到进程"
fi

# 7. git worktree 清理检查
echo "--- [7] git worktree 清洁度 ---"
WORKTREES=$(git worktree list 2>/dev/null | grep -v "main" | grep -v "^$" || true)
if [ -z "$WORKTREES" ]; then
  ok "无残留 worktree"
else
  echo "  发现 worktrees:"
  echo "$WORKTREES"
  echo "  (新 agent 任务会创建新的，正常的)"
fi

# 8. git branch 状态
echo "--- [8] 当前分支状态 ---"
BRANCH=$(git branch --show-current 2>/dev/null)
echo "  current: $BRANCH"
if [ "$BRANCH" = "main" ]; then
  ok "在 main 分支（符合规范：main 用于 pull，不直接开发）"
else
  echo "  注意：当前不在 main 分支，确认这是预期的 agent worktree"
fi

# 汇总
echo
echo "=== 汇总: $PASS passed, $FAIL failed ==="
[ $FAIL -eq 0 ] && echo "✅ agent-validate 全部通过" && exit 0 || exit 1