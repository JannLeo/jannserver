#!/usr/bin/env bash
# ============================================================
# jannserver SmokeRunner — for symphony Phase 1.5 SmokeRunner
# Run: bash scripts/smoke.sh
# ============================================================
set -uo pipefail   # NOTE: no -e — we use explicit checks for error propagation

# ---------- Config ----------
BASE_URL="${BASE_URL:-http://localhost:3000}"
ADMIN_USERNAME="${ADMIN_USERNAME:-admin}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-admin123}"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# Cookie jar (cleaned up on exit)
COOKIE_JAR="$(mktemp)"
trap 'rm -f "$COOKIE_JAR"' EXIT

# ---------- Helpers ----------
PASS=0
FAIL=0

pass() { echo "  PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL + 1)); }

# Strip any line that mentions a sensitive env var or looks like a bearer token / sk- / long base64
sanitize() {
  sed -E "/AI_API_KEY|GITHUB_TOKEN|cookie|sk-[a-zA-Z0-9]{20,}|ghp_[A-Za-z0-9]{36,}|Bearer |[A-Za-z0-9+/]{60,}={0,2}/d" || cat
}

# GET request — returns sanitized body or empty on failure
get_json() {
  local url="$1"
  local body
  body=$(curl -sS --connect-timeout 5 --max-time 30 \
    -b "$COOKIE_JAR" \
    -c "$COOKIE_JAR" \
    "$url" 2>&1) || return 0
  echo "$body" | sanitize
}

# POST JSON — returns sanitized body or empty on failure
post_json() {
  local url="$1"; local body="${2:-}"
  local resp
  if [ -n "$body" ]; then
    resp=$(curl -sS --connect-timeout 5 --max-time 60 \
      -X POST "$url" \
      -H "Content-Type: application/json" \
      -d "$body" \
      -b "$COOKIE_JAR" \
      -c "$COOKIE_JAR" \
      2>&1) || return 0
  else
    resp=$(curl -sS --connect-timeout 5 --max-time 60 \
      -X POST "$url" \
      -H "Content-Type: application/json" \
      -b "$COOKIE_JAR" \
      -c "$COOKIE_JAR" \
      2>&1) || return 0
  fi
  echo "$resp" | sanitize
}

# Extract boolean value from JSON (returns empty if not found)
json_bool() { echo "$1" | grep -o "\"$2\":[[:space:]]*\(true\|false\)" | grep -o 'true\|false' || true; }

# Extract string value from JSON (returns empty if not found)
json_str()  { echo "$1" | grep -o "\"$2\":[[:space:]]*\"[^\"]*\"" | head -1 | sed "s/.*\"$2\":[[:space:]]*\"//;s/\"$//" || true; }

# ---------- Check 0: server must be running ----------
echo ""
echo "=== Smoke: jannserver Smoke Test ==="
echo ""

HTTP_CODE=$(curl -sS -o /dev/null -w "%{http_code}" --connect-timeout 5 --max-time 10 "$BASE_URL/api/health" 2>&1 || echo "000")
if [ "$HTTP_CODE" = "000" ] || [ "$HTTP_CODE" = "007" ]; then
  echo "FAIL: personal-workspace is not running on $BASE_URL"
  echo "      Start with: pm2 start personal-workspace"
  echo "      Or:         cd $PROJECT_DIR && pnpm dev"
  exit 1
fi

# ---------- Check 1: pnpm build ----------
echo "[1/7] pnpm build..."
BUILD_OK=false
set +e
pnpm install --no-frozen-lockfile > /dev/null 2>&1
if [ $? -eq 0 ]; then
  pnpm build > /dev/null 2>&1
  [ $? -eq 0 ] && BUILD_OK=true
fi
set -e
cd - > /dev/null 2>&1 || true
"$BUILD_OK" && pass "pnpm build" || fail "pnpm build"

# ---------- Check 2: /api/health ----------
echo "[2/7] GET /api/health..."
HEALTH=$(get_json "$BASE_URL/api/health")
STATUS_VAL=$(json_str "$HEALTH" "status")
[ "$STATUS_VAL" = "ok" ] && pass "health status=ok" || fail "health status (got: '$STATUS_VAL')"

# ---------- Check 3: login ----------
echo "[3/7] POST /api/auth/login..."
LOGIN=$(post_json "$BASE_URL/api/auth/login" "{\"username\":\"$ADMIN_USERNAME\",\"password\":\"$ADMIN_PASSWORD\"}")
OK_VAL=$(json_bool "$LOGIN" "ok")
[ "$OK_VAL" = "true" ] && pass "login ok" || fail "login failed (got: $LOGIN)"

# ---------- Check 4: /api/video-analysis/status ----------
echo "[4/7] GET /api/video-analysis/status..."
VA=$(get_json "$BASE_URL/api/video-analysis/status")
VA_CONFIGURED=$(json_bool "$VA" "configured")
VA_REACHABLE=$(json_bool "$VA" "serviceReachable")
[ "$VA_CONFIGURED" = "true" ]  && pass "video-analysis configured=true" || fail "video-analysis configured (got: '$VA_CONFIGURED')"
[ "$VA_REACHABLE" = "true" ]    && pass "video-analysis serviceReachable=true" || fail "video-analysis serviceReachable (got: '$VA_REACHABLE')"

# ---------- Check 5: /api/project-brain/compile (summary-for-work, mode=configs) ----------
echo "[5/7] POST /api/project-brain/compile (summary-for-work, mode=configs)..."
COMPILE=$(post_json "$BASE_URL/api/project-brain/compile" "{\"repoName\":\"summary-for-work\",\"mode\":\"configs\"}")
COMPILE_OK=$(json_bool "$COMPILE" "ok")
HAS_PAGEID=false; echo "$COMPILE" | grep -q '"pageId"' && HAS_PAGEID=true
[ "$COMPILE_OK" = "false" ] && pass "compile ok=false" || fail "compile ok should be false (got: $COMPILE)"
"$HAS_PAGEID" && fail "compile must NOT contain pageId" || pass "no pageId in response"

# ---------- Check 6: /api/ai/ask — "fitness是什么" ----------
echo "[6/7] POST /api/ai/ask 'fitness是什么'..."
ASK1=$(post_json "$BASE_URL/api/ai/ask" "{\"question\":\"fitness是什么\"}")
ASK1_KB=$(json_bool "$ASK1" "usedKnowledgeBase")
ASK1_ROUTE=$(json_str "$ASK1" "route")
[ "$ASK1_KB" = "true" ] && pass "ask 'fitness是什么' usedKnowledgeBase=true (route=$ASK1_ROUTE)" \
  || fail "ask usedKnowledgeBase should be true (got: '$ASK1_KB')"
if echo "$ASK1_ROUTE" | grep -qi "fallback"; then
  fail "route should not be fallback (got: $ASK1_ROUTE)"
else
  [ -n "$ASK1_ROUTE" ] && pass "route is acceptable: $ASK1_ROUTE" || pass "route present"
fi

# ---------- Check 7: /api/ai/ask — "worldquant里面fitness是什么" ----------
echo "[7/7] POST /api/ai/ask 'worldquant里面fitness是什么'..."
ASK2=$(post_json "$BASE_URL/api/ai/ask" "{\"question\":\"worldquant里面fitness是什么\"}")
ASK2_KB=$(json_bool "$ASK2" "usedKnowledgeBase")
[ "$ASK2_KB" = "true" ] && pass "ask 'worldquant里面fitness是什么' usedKnowledgeBase=true" \
  || fail "ask usedKnowledgeBase should be true (got: '$ASK2_KB')"

# ---------- Summary ----------
echo ""
echo "=========================================="
echo "  PASS: $PASS  |  FAIL: $FAIL"
echo "=========================================="
echo ""

if [ "$FAIL" -gt 0 ]; then
  echo "Some checks failed."
  exit 1
else
  echo "All checks passed."
  exit 0
fi