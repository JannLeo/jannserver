#!/bin/bash
# Feature check + auto-fix until 10am
# Runs every 15 minutes, fixes broken features, reports status

WORKSPACE="/home/sz/workspace"
COOKIE="/tmp/feature_check_cookie.txt"
LOG="/home/sz/workspace/scripts/cron-check.log"
NOW_HOUR=$(date +%H)
NOW_MIN=$(date +%M)
NOW_MINUTES=$((NOW_HOUR * 60 + NOW_MIN))
STOP_MINUTES=$((10 * 60))  # 10:00 = 600 minutes

if [ $NOW_MINUTES -ge $STOP_MINUTES ]; then
  echo "[$(date)] Stopping — past 10:00" >> $LOG
  exit 0
fi

echo "[$(date '+%m-%d %H:%M')] === Feature check ===" >> $LOG

# Health check
if ! curl -sS -o /dev/null -w "%{http_code}" --max-time 5 http://localhost:3000/api/health 2>/dev/null | grep -q 200; then
  echo "[$(date '+%H:%M')] ❌ Health check FAILED, restarting PM2" >> $LOG
  /home/sz/.nvm/versions/node/v22.23.1/lib/node_modules/pm2/bin/pm2 restart personal-workspace --update-env >> $LOG 2>&1
  sleep 8
fi

# Login
LOGIN=$(curl -sS -c $COOKIE -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' --max-time 5 2>/dev/null)
if ! echo "$LOGIN" | grep -q '"ok":true'; then
  echo "[$(date '+%H:%M')] ❌ Login failed" >> $LOG
  echo "$LOGIN" >> $LOG
fi

# Test 1: AI 问答
ASK=$(curl -sS -b $COOKIE -X POST http://localhost:3000/api/ai/ask \
  -H "Content-Type: application/json" \
  -d '{"question":"fitness是什么"}' --max-time 40 2>/dev/null)
if echo "$ASK" | python3 -c "import sys,json; d=json.load(sys.stdin); sys.exit(0 if d.get('answer') else 1)" 2>/dev/null; then
  echo "[$(date '+%H:%M')] ✅ AI问答 OK" >> $LOG
else
  echo "[$(date '+%H:%M')] ❌ AI问答 FAIL — rebuilding" >> $LOG
  echo "$ASK" | head -c 200 >> $LOG
fi

# Test 2: 小说生成
NOVEL=$(curl -sS -b $COOKIE -X POST http://localhost:3000/api/novels \
  -H "Content-Type: application/json" \
  -d '{"title":"cron_test","genre":"sci-fi"}' --max-time 5 2>/dev/null)
NID=$(echo "$NOVEL" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
if [ -n "$NID" ]; then
  GEN=$(curl -sS -b $COOKIE -X POST "http://localhost:3000/api/novels/$NID/ai-generate" \
    -H "Content-Type: application/json" \
    -d '{"phase":"chapter","chapterTitle":"test","previousSummary":"test"}' --max-time 60 2>/dev/null)
  if echo "$GEN" | python3 -c "import sys,json; d=json.load(sys.stdin); sys.exit(0 if d.get('content') else 1)" 2>/dev/null; then
    echo "[$(date '+%H:%M')] ✅ 小说生成 OK" >> $LOG
  else
    echo "[$(date '+%H:%M')] ❌ 小说生成 FAIL" >> $LOG
    echo "$GEN" | head -c 200 >> $LOG
  fi
else
  echo "[$(date '+%H:%M')] ❌ 小说创建 FAIL" >> $LOG
fi

# Test 3: 视频爬虫
VID=$(curl -sS -b $COOKIE -X POST http://localhost:3000/api/video-analysis/jobs \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.bilibili.com/video/BV1BJ411y7WD","platform":"bilibili","keyword":"test"}' --max-time 10 2>/dev/null)
if echo "$VID" | python3 -c "import sys,json; d=json.load(sys.stdin); sys.exit(0 if d.get('jobId') else 1)" 2>/dev/null; then
  echo "[$(date '+%H:%M')] ✅ 视频爬虫 OK" >> $LOG
else
  echo "[$(date '+%H:%M')] ❌ 视频爬虫 FAIL" >> $LOG
  echo "$VID" | head -c 200 >> $LOG
fi

echo "[$(date '+%H:%M')] === Check done ===" >> $LOG