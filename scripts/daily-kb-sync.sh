#!/usr/bin/env bash
# ===============================================================
# daily-kb-sync.sh — 每日知识库同步
# 每天 06:00 自动执行（由 Hermes cron 管理）
# 1. Git pull workspace
# 2. Python 脚本全量重建 repo_doc embedding（纯 Python，绕过 Node.js spawn bug）
# 3. API 增量重建 wiki_page embedding
# ===============================================================
set -euo pipefail

WORKSPACE_DIR="${WORKSPACE_DIR:-/home/sz/workspace}"
DB_PATH="${WORKSPACE_DIR}/data/app.db"
PYTHON_BIN="${WORKSPACE_DIR}/.venv/bin/python3"
REBUILD_SCRIPT="${WORKSPACE_DIR}/scripts/rebuild_repo_doc.py"
REBUILD_URL="${REBUILD_URL:-http://127.0.0.1:3000/api/admin/embeddings-rebuild}"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] === Daily KB Sync Started ==="

# ---------- Step 1: Git pull ----------
cd "$WORKSPACE_DIR"
echo "[1/3] Git pull workspace..."
BEFORE=$(git rev-parse HEAD 2>/dev/null || echo "")
if git fetch origin main 2>&1; then
    LOCAL=$(git rev-parse @)
    REMOTE=$(git rev-parse origin/main)
    if [ "$LOCAL" = "$REMOTE" ]; then
        echo "  Already up to date (HEAD unchanged)"
    else
        # Try fast-forward first, fallback to rebase
        if git merge --ff-only origin/main 2>/dev/null; then
            echo "  Fast-forward merge: $(git rev-parse --short HEAD) → $(git rev-parse --short origin/main)"
        else
            echo "  Diverged, attempting stash + rebase..."
            if git stash push -m "daily-kb-sync $(date +%s)" 2>/dev/null; then
                git rebase origin/main && git stash drop 2>/dev/null || true
                echo "  Rebase done"
            fi
        fi
    fi
else
    echo "  git fetch failed, continuing..."
fi
AFTER=$(git rev-parse HEAD 2>/dev/null || echo "")
if [ "$BEFORE" != "$AFTER" ] && [ -n "$AFTER" ]; then
    echo "  Workspace updated: ${BEFORE:0:7} → ${AFTER:0:7}"
else
    echo "  No workspace update needed"
fi

# ---------- Step 2: repo_doc embedding 全量重建（纯 Python）----------
echo ""
echo "[2/3] repo_doc embedding rebuild (Python, ~9min)..."
if [ -f "$PYTHON_BIN" ] && [ -f "$REBUILD_SCRIPT" ]; then
    "$PYTHON_BIN" -u "$REBUILD_SCRIPT" "$DB_PATH" 2>&1 | sed 's/^/  /'
    echo "  repo_doc rebuild done"
else
    echo "  Skipped: Python rebuild script not found"
fi

# ---------- Step 3: wiki_page 增量重建（API，3ms）----------
echo ""
echo "[3/3] wiki_page incremental rebuild (API, ~3ms)..."
WIKI_RESULT=$(curl -s -m 30 -X POST "$REBUILD_URL" \
  -H "Authorization: Bearer admin123" \
  -H "Content-Type: application/json" \
  -d '{"docType":"wiki_page"}' 2>/dev/null || echo '{"error":"curl failed"}')

WIKI_PROCESSED=$(echo "$WIKI_RESULT" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get('processed', 0))
except: print(0)
" 2>/dev/null || echo "?")
WIKI_SKIPPED=$(echo "$WIKI_RESULT" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get('skipped', 0))
except: print(0)
" 2>/dev/null || echo "?")

echo "  wiki_page: processed=${WIKI_PROCESSED}, skipped=${WIKI_SKIPPED}"

# ---------- Summary ----------
echo ""
echo "=== Sync Done: $(date '+%Y-%m-%d %H:%M:%S') ==="