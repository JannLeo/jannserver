#!/bin/bash

BASE_URL="http://127.0.0.1:3000"

# 测试函数
test_endpoint() {
    local url=$1
    local method=${2:-GET}
    local data=${3:-}
    local name=$4
    
    if [ -n "$data" ]; then
        response=$(curl -s -w "\n%{http_code}" -X "$method" -H "Content-Type: application/json" -d "$data" "$url" 2>/dev/null)
    else
        response=$(curl -s -w "\n%{http_code}" -X "$method" "$url" 2>/dev/null)
    fi
    
    status_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    # 截断过长的响应
    body_short=$(echo "$body" | head -c 500)
    if [ ${#body} -gt 500 ]; then
        body_short="${body_short}..."
    fi
    
    echo "[$status_code] $name"
    echo "    URL: $url"
    if [ -n "$body_short" ]; then
        echo "    Body: $body_short"
    fi
    echo ""
}

echo "=============================================="
echo "Workspace 测试报告"
echo "时间: $(date)"
echo "基础URL: $BASE_URL"
echo "=============================================="
echo ""

echo "=== 页面路由测试 ==="
echo ""

test_endpoint "$BASE_URL/" "GET" "" "/ (根路径)"
test_endpoint "$BASE_URL/login" "GET" "" "/login"
test_endpoint "$BASE_URL/dashboard" "GET" "" "/dashboard"
test_endpoint "$BASE_URL/ask" "GET" "" "/ask"
test_endpoint "$BASE_URL/brain" "GET" "" "/brain"
test_endpoint "$BASE_URL/code" "GET" "" "/code"
test_endpoint "$BASE_URL/daily" "GET" "" "/daily"
test_endpoint "$BASE_URL/daily/2024-07-04" "GET" "" "/daily/[date]"
test_endpoint "$BASE_URL/memos" "GET" "" "/memos"
test_endpoint "$BASE_URL/notes" "GET" "" "/notes"
test_endpoint "$BASE_URL/notes/new" "GET" "" "/notes/new"
test_endpoint "$BASE_URL/notes/test-note" "GET" "" "/notes/[slug]"
test_endpoint "$BASE_URL/novel" "GET" "" "/novel"
test_endpoint "$BASE_URL/novel/test-id" "GET" "" "/novel/[id]"
test_endpoint "$BASE_URL/projects" "GET" "" "/projects"
test_endpoint "$BASE_URL/repos" "GET" "" "/repos"
test_endpoint "$BASE_URL/tasks" "GET" "" "/tasks"
test_endpoint "$BASE_URL/usage" "GET" "" "/usage"
test_endpoint "$BASE_URL/video-analysis" "GET" "" "/video-analysis"
test_endpoint "$BASE_URL/wiki" "GET" "" "/wiki"

echo ""
echo "=== API 端点测试 ==="
echo ""

echo "--- 健康检查与认证 ---"
test_endpoint "$BASE_URL/api/health" "GET" "" "/api/health"
test_endpoint "$BASE_URL/api/auth" "GET" "" "/api/auth"
test_endpoint "$BASE_URL/api/auth/login" "POST" '{"username":"test","password":"test"}' "/api/auth/login"
test_endpoint "$BASE_URL/api/auth/me" "GET" "" "/api/auth/me"
test_endpoint "$BASE_URL/api/auth/logout" "POST" "" "/api/auth/logout"

echo "--- AI 相关 ---"
test_endpoint "$BASE_URL/api/ai/ask" "POST" '{"question":"test"}' "/api/ai/ask"
test_endpoint "$BASE_URL/api/ai/daily-plan" "POST" '{"date":"2024-07-04"}' "/api/ai/daily-plan"
test_endpoint "$BASE_URL/api/ai/daily-summary" "POST" '{"date":"2024-07-04"}' "/api/ai/daily-summary"

echo "--- 脑图 (Brain) ---"
test_endpoint "$BASE_URL/api/brain/status" "GET" "" "/api/brain/status"
test_endpoint "$BASE_URL/api/brain/sync" "POST" "" "/api/brain/sync"
test_endpoint "$BASE_URL/api/brain/user-info" "GET" "" "/api/brain/user-info"
test_endpoint "$BASE_URL/api/brain/alphas" "GET" "" "/api/brain/alphas"
test_endpoint "$BASE_URL/api/brain/alphas/1" "GET" "" "/api/brain/alphas/[id]"

echo "--- 代码文件 ---"
test_endpoint "$BASE_URL/api/code-files" "GET" "" "/api/code-files"

echo "--- 每日 (Daily) ---"
test_endpoint "$BASE_URL/api/daily/2024-07-04" "GET" "" "/api/daily/[date]"
test_endpoint "$BASE_URL/api/daily/2024-07-04" "POST" '{"content":"test"}' "/api/daily/[date] (POST)"

echo "--- 嵌入 (Embeddings) ---"
test_endpoint "$BASE_URL/api/embeddings/rebuild" "POST" "" "/api/embeddings/rebuild"

echo "--- 初始化 ---"
test_endpoint "$BASE_URL/api/init" "GET" "" "/api/init"

echo "--- 备忘录 (Memos) ---"
test_endpoint "$BASE_URL/api/memos" "GET" "" "/api/memos"
test_endpoint "$BASE_URL/api/memos" "POST" '{"content":"test"}' "/api/memos (POST)"

echo "--- 新 API 使用统计 ---"
test_endpoint "$BASE_URL/api/new-api/usage" "GET" "" "/api/new-api/usage"

echo "--- 笔记 (Notes) ---"
test_endpoint "$BASE_URL/api/notes" "GET" "" "/api/notes"
test_endpoint "$BASE_URL/api/notes" "POST" '{"title":"test","content":"test"}' "/api/notes (POST)"
test_endpoint "$BASE_URL/api/notes/test-note" "GET" "" "/api/notes/[slug]"
test_endpoint "$BASE_URL/api/notes/test-note" "PUT" '{"title":"updated"}' "/api/notes/[slug] (PUT)"

echo "--- 小说 (Novels) ---"
test_endpoint "$BASE_URL/api/novels" "GET" "" "/api/novels"
test_endpoint "$BASE_URL/api/novels" "POST" '{"title":"test"}' "/api/novels (POST)"
test_endpoint "$BASE_URL/api/novels/test-id" "GET" "" "/api/novels/[id]"
test_endpoint "$BASE_URL/api/novels/test-id/chapters" "GET" "" "/api/novels/[id]/chapters"
test_endpoint "$BASE_URL/api/novels/test-id/volumes" "GET" "" "/api/novels/[id]/volumes"
test_endpoint "$BASE_URL/api/novels/test-id/ai-generate" "POST" '{"prompt":"test"}' "/api/novels/[id]/ai-generate"

echo "--- Obsidian 同步 ---"
test_endpoint "$BASE_URL/api/obsidian/sync" "POST" "" "/api/obsidian/sync"

echo "--- 项目脑图 (Project Brain) ---"
test_endpoint "$BASE_URL/api/project-brain/status" "GET" "" "/api/project-brain/status"
test_endpoint "$BASE_URL/api/project-brain/scan" "POST" "" "/api/project-brain/scan"
test_endpoint "$BASE_URL/api/project-brain/compile" "POST" "" "/api/project-brain/compile"
test_endpoint "$BASE_URL/api/project-brain/ontology" "GET" "" "/api/project-brain/ontology"
test_endpoint "$BASE_URL/api/project-brain/ontology" "POST" '{"name":"test"}' "/api/project-brain/ontology (POST)"
test_endpoint "$BASE_URL/api/project-brain/ontology/list" "GET" "" "/api/project-brain/ontology/list"

echo "--- 项目 (Projects) ---"
test_endpoint "$BASE_URL/api/projects" "GET" "" "/api/projects"

echo "--- 仓库 (Repos) ---"
test_endpoint "$BASE_URL/api/repos" "GET" "" "/api/repos"
test_endpoint "$BASE_URL/api/repos" "POST" '{"name":"test"}' "/api/repos (POST)"
test_endpoint "$BASE_URL/api/repos/activity" "GET" "" "/api/repos/activity"
test_endpoint "$BASE_URL/api/repos/test-id" "GET" "" "/api/repos/[id]"
test_endpoint "$BASE_URL/api/repos/test-id/sync" "POST" "" "/api/repos/[id]/sync"
test_endpoint "$BASE_URL/api/repos/test-id/documents" "GET" "" "/api/repos/[id]/documents"
test_endpoint "$BASE_URL/api/repos/test-id/documents/doc-1" "GET" "" "/api/repos/[id]/documents/[docId]"

echo "--- 搜索 ---"
test_endpoint "$BASE_URL/api/search?q=test" "GET" "" "/api/search"

echo "--- 标签 (Tags) ---"
test_endpoint "$BASE_URL/api/tags" "GET" "" "/api/tags"

echo "--- 任务 (Tasks) ---"
test_endpoint "$BASE_URL/api/tasks" "GET" "" "/api/tasks"
test_endpoint "$BASE_URL/api/tasks" "POST" '{"title":"test"}' "/api/tasks (POST)"
test_endpoint "$BASE_URL/api/tasks/test-id" "GET" "" "/api/tasks/[id]"
test_endpoint "$BASE_URL/api/tasks/test-id" "PATCH" '{"status":"done"}' "/api/tasks/[id] (PATCH)"
test_endpoint "$BASE_URL/api/tasks/delegations" "GET" "" "/api/tasks/delegations"

echo "--- 视频分析 ---"
test_endpoint "$BASE_URL/api/video-analysis/status" "GET" "" "/api/video-analysis/status"
test_endpoint "$BASE_URL/api/video-analysis/jobs" "GET" "" "/api/video-analysis/jobs"
test_endpoint "$BASE_URL/api/video-analysis/jobs" "POST" '{"url":"test"}' "/api/video-analysis/jobs (POST)"
test_endpoint "$BASE_URL/api/video-analysis/jobs/test-id" "GET" "" "/api/video-analysis/jobs/[id]"
test_endpoint "$BASE_URL/api/video-analysis/jobs/test-id/analyze" "POST" "" "/api/video-analysis/jobs/[id]/analyze"
test_endpoint "$BASE_URL/api/video-analysis/jobs/test-id/publish" "POST" "" "/api/video-analysis/jobs/[id]/publish"

echo "--- Wiki ---"
test_endpoint "$BASE_URL/api/wiki/spaces" "GET" "" "/api/wiki/spaces"
test_endpoint "$BASE_URL/api/wiki/pages" "GET" "" "/api/wiki/pages"
test_endpoint "$BASE_URL/api/wiki/pages" "POST" '{"title":"test"}' "/api/wiki/pages (POST)"
test_endpoint "$BASE_URL/api/wiki/pages/test-id" "GET" "" "/api/wiki/pages/[id]"
test_endpoint "$BASE_URL/api/wiki/pages/test-id" "PUT" '{"title":"updated"}' "/api/wiki/pages/[id] (PUT)"
test_endpoint "$BASE_URL/api/wiki/compile" "POST" "" "/api/wiki/compile"

echo "=============================================="
echo "测试完成"
echo "=============================================="