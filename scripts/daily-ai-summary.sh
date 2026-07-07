#!/usr/bin/env bash
# ================================================================
# daily-ai-summary.sh — AI 日总结每日自动生成
# Crontab: 0 7 * * * /home/sz/workspace/scripts/daily-ai-summary.sh >> /home/sz/workspace/scripts/daily-summary.log 2>&1
# ================================================================
set -euo pipefail

COOKIE="/tmp/daily_summary_cookie.txt"
LOG="${LOG:-/home/sz/workspace/scripts/daily-summary.log}"
TODAY=$(date +%Y-%m-%d)

echo "[$(date '+%Y-%m-%d %H:%M:%S')] === Daily AI Summary ===" >> "$LOG"

# Step 1: Login to get session cookie
LOGIN_RESULT=$(curl -sS -c "$COOKIE" -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' \
  --max-time 10 2>> "$LOG")

if ! echo "$LOGIN_RESULT" | grep -q '"ok":true'; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ❌ Login failed: $LOGIN_RESULT" >> "$LOG"
  exit 1
fi

# Step 2: Call generate-and-save with session cookie
RESULT=$(curl -sS -b "$COOKIE" -m 180 \
  -X POST http://localhost:3000/api/ai/daily-summary/generate-and-save \
  -H "Content-Type: application/json" \
  -d "{\"date\":\"$TODAY\"}" 2>> "$LOG")

echo "[$(date '+%Y-%m-%d %H:%M:%S')] API: $RESULT" >> "$LOG"

if echo "$RESULT" | grep -q '"ok":true'; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ✅ Generated OK" >> "$LOG"
elif echo "$RESULT" | grep -q '"skipped":true'; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ⏭ Already exists, skipped" >> "$LOG"
else
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ❌ Failed: $RESULT" >> "$LOG"
fi

rm -f "$COOKIE"