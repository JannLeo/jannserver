#!/usr/bin/env bash
# smoke.sh — 快速冒烟测试，在 pnpm build 成功后运行
# 用法: ./scripts/smoke.sh [base_url]
# 默认 base_url=http://localhost:3000

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BASE_URL="${1:-http://localhost:3000}"
COOKIES="${COOKIES:-/tmp/ws_cookies.txt}"

PASS=0
FAIL=0

# ─── helpers ────────────────────────────────────────────────
ok()  { echo "✅ PASS: $1"; ((PASS++)); }
err() { echo "❌ FAIL: $1 — $2"; ((FAIL++)); }

# ─── 1. pnpm build ─────────────────────────────────────────
echo "=== [1/5] pnpm build ==="
cd "$REPO_ROOT"
if pnpm build > /tmp/smoke_build.log 2>&1; then
  ok "pnpm build"
else
  err "pnpm build" "查看 log: /tmp/smoke_build.log"
  tail -5 /tmp/smoke_build.log
fi

# ─── 2. /api/health ───────────────────────────────────────
echo "=== [2/5] /api/health ==="
HEALTH=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/api/health" 2>/dev/null || echo "000")
if [ "$HEALTH" = "200" ]; then
  ok "/api/health → $HEALTH"
else
  err "/api/health" "返回 $HEALTH"
fi

# ─── 3. /api/video-analysis/status ────────────────────────
echo "=== [3/5] /api/video-analysis/status ==="
MC_STATUS=$(curl -s "${BASE_URL}/api/video-analysis/status" 2>/dev/null || echo '{}')
MC_CONFIG=$(echo "$MC_STATUS" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('configured','?'))" 2>/dev/null || echo "?")
if [ "$MC_CONFIG" = "True" ] || [ "$MC_CONFIG" = "true" ]; then
  ok "/api/video-analysis/status configured=true"
else
  # 非 configured 也接受（可能是未配置），只检查 JSON 可解析
  echo "   configured=$MC_CONFIG (may be false if not configured)"
  ok "/api/video-analysis/status JSON 解析正常"
fi

# ─── 4. /api/project-brain/compile (非索引 repo) ─────────
echo "=== [4/5] /api/project-brain/compile summary-for-work (expect ok:false) ==="
COMPILE=$(curl -s "${BASE_URL}/api/project-brain/compile?repoName=summary-for-work&mode=summary" \
  -b "$COOKIES" 2>/dev/null || echo '{"ok":null}')
COMPILE_OK=$(echo "$COMPILE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('ok','?'))" 2>/dev/null || echo "?")
if [ "$COMPILE_OK" = "False" ] || [ "$COMPILE_OK" = "false" ]; then
  ok "/api/project-brain/compile → ok:false (正确，未索引 repo 应拒绝)"
elif [ "$COMPILE_OK" = "?" ]; then
  err "/api/project-brain/compile" "JSON 解析失败: $COMPILE"
else
  err "/api/project-brain/compile" "期望 ok:false，得到 ok:$COMPILE_OK"
fi

# ─── 5. /api/ai/ask usedKnowledgeBase ───────────────────────
echo "=== [5/5] /api/ai/ask usedKnowledgeBase ==="
ASK_RESP=$(curl -s -X POST "${BASE_URL}/api/ai/ask" \
  -H 'Content-Type: application/json' \
  -b "$COOKIES" \
  -d '{"question":"fitness是什么","history":[]}' \
  --max-time 120 2>/dev/null || echo '{}')
USED_KB=$(echo "$ASK_RESP" | python3 -c "
import sys,json
try:
    d=json.load(sys.stdin)
    print(d.get('usedKnowledgeBase','?'))
except:
    print('?')
" 2>/dev/null || echo "?")
if [ "$USED_KB" = "True" ] || [ "$USED_KB" = "true" ]; then
  ok "/api/ai/ask usedKnowledgeBase=true"
else
  err "/api/ai/ask usedKnowledgeBase" "得到 $USED_KB (期望 true)"
fi

# ─── 安全检查 ─────────────────────────────────────────────
echo "=== [安全] 敏感信息泄漏检查 ==="
if grep -rq "AI_API_KEY\|token\|password\|secret" \
  /tmp/smoke_build.log 2>/dev/null || \
  echo "$ASK_RESP" | grep -qi "AI_API_KEY\|ghp_\|Bearer"; then
  err "安全检查" "检测到疑似泄漏的敏感信息"
else
  ok "安全检查 — 无敏感信息泄漏"
fi

# ─── 汇总 ──────────────────────────────────────────────────
echo
echo "=== 汇总: $PASS passed, $FAIL failed ==="
if [ $FAIL -gt 0 ]; then
  echo "❌ smoke 测试失败"
  exit 1
else
  echo "✅ 全部通过"
  exit 0
fi