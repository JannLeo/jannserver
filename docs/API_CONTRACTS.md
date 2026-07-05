# API Contracts

> 所有核心 API 的请求/响应格式、错误码、依赖条件。

## 1. AI 问答

### `POST /api/ai/ask`

```
Request:
{
  "question": string,        // 必填，至少2字符
  "history": ChatMessage[]   // 可选，对话历史
}

Response:
{
  "answer": string,           // AI 回答
  "usedKnowledgeBase": boolean, // 是否命中知识库
  "sources": Source[] | null  // 命中来源
}

Error:
{ "error": string }

Status: 400 / 500
```

## 2. 小说

### `GET /api/novels`
```
Response: Novel[]
```
### `POST /api/novels`
```
Request:  { title, genre?, synopsis? }
Response: { id, title, ...Novel }
```
### `POST /api/novels/[id]/ai-generate`
```
Request (phase=setup):
  { "phase": "setup", "genre": string, "existingWorld"?, "existingCharacter"? }

Request (phase=outline):
  { "phase": "outline", "volumeTitle"?, "volumeSynopsis"?, "chapterCount"? }

Request (phase=chapter):
  { "phase": "chapter", "chapterTitle": string, "outline": string }

Response:
  { "configured": true, "content": string, "error"?: string }

Error (429):
  { "configured": true, "error": "AI API 返回 429" }
```

## 3. 视频分析

### `POST /api/video-analysis/jobs`
```
Request:
{
  "platform": "bilibili" | "douyin" | "kuaishou" | "xhs",
  "crawlType": "search" | "detail" | "creator",
  "keyword"?: string,     // search 模式必填
  "targetUrl"?: string,   // detail 模式必填
  "limit"?: number,       // 1-20, 默认5
  "withComments"?: boolean  // 默认 true
}

Response: { "ok": true, "jobId": number }
Error: { "ok": false, "error": string }
```
### `POST /api/video-analysis/jobs/[id]`
```
启动任务执行。返回 { "ok": true } 后轮询 GET jobs 看状态。
```

### `GET /api/video-analysis/jobs`
```
Response: {
  jobs: Array<{
    id, platform, crawlType, status, progress,
    resultCount, message[], createdAt, finishedAt
  }>
}
```

### `GET /api/video-analysis/status`
```
Response: {
  "configured": boolean,
  "serviceReachable": boolean,
  "baseUrl": string | null
}
```
## 4. 代码搜索

### `GET /api/code?q=...&limit=...&offset=...`
```
Response:
{
  "query": string,
  "total": number,
  "limit": number,
  "offset": number,
  "results": Array<{
    id, repoId, repoName, repoUrl, filename,
    relPath, language, sizeBytes, summary, matchSnippet
  }>
}
Error: { "error": string } (400 if query < 2 chars)
Auth: 需要登录 cookie
```

### `GET /api/code-files?repoId=...&q=...&fileId=...`
```
Response (list mode):
  Array<{ id, relPath, language, sizeBytes, summary }>

Response (file detail mode, with fileId):
  { ok: true, repoId, repoName, fileId, relPath, language, content, symbols }
```

## 5. 书籍

### `GET /api/books?q=...&type=...`
```
Response:
  Array<{ id, title, author, coverUrl, rating, ... }>
Error (404):
  expected if `q` doesn't match known books

Notes:
  - Uses Open Library API (via proxyFetch)
  - weread_id column required in books table
  - Title/author search supported
```

## 6. 集成状态

### `GET /api/video-analysis/status`
- `configured: false` → 未设置 `MEDIA_CRAWLER_BASE_URL`
- `configured: true, serviceReachable: false` → MediaCrawler 服务未启动
- `configured: true, serviceReachable: true` → 正常

### `GET /api/project-brain/compile?repoName=...&mode=...`
- `ok: true` → 编译完成
- `ok: false, error: "Repository summary-for-work not found"` → 仓库未索引（正常）