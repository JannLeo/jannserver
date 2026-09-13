#!/usr/bin/env bash
# ================================================================
# repos-sync.sh — 定时同步 JannLeo GitHub 仓库
# 每天 08:00 执行，每周全面同步一次
# ================================================================
set -euo pipefail

LOG="${LOG:-/home/sz/workspace/scripts/repos-sync.log}"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] === Repos Sync ===" >> "$LOG"

cd /home/sz/workspace

# Run sync-all-repos.mjs (handles clone/pull + markdown indexing)
/usr/bin/node scripts/sync-all-repos.mjs >> "$LOG" 2>&1

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Sync done" >> "$LOG"