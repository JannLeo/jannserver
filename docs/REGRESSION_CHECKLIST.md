# Regression Checklist

> 合并前必须运行的回归验证清单。

## 合并前验证

```bash
# 1. 构建检查
pnpm build
# 结果: ALL / Compiled successfully

# 2. 烟雾测试
./scripts/smoke.sh
# 结果: 全部 PASS
```

## 手动验证项

### AI 问答
```bash
curl -s -b /tmp/ws_cookies.txt -X POST http://localhost:3000/api/ai/ask \
  -H 'Content-Type: application/json' \
  -d '{"question":"fitness是什么","history":[]}' \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('KB:', d.get('usedKnowledgeBase'), '| len:', len(d.get('answer','')))"
```
**期望**: `KB: True`

### 代码搜索
```bash
curl -s -b /tmp/ws_cookies.txt http://localhost:3000/api/code?q=react | \
  python3 -c "import sys,json; d=json.load(sys.stdin); print('total:', d.get('total'), 'results:', len(d.get('results',[])))"
```
**期望**: `total >= 1`

### 视频分析
```bash
curl -s -b /tmp/ws_cookies.txt http://localhost:3000/api/video-analysis/status | \
  python3 -c "import sys,json; d=json.load(sys.stdin); print('configured:', d.get('configured'), 'reachable:', d.get('serviceReachable'))"
```

### 新闻
```bash
curl -s http://localhost:3000/api/news | python3 -c "import sys,json; d=json.load(sys.stdin); print('articles:', len(d.get('articles',[])))"
```
**期望**: `articles >= 1`

### 书籍搜索
```bash
curl -s -b /tmp/ws_cookies.txt "http://localhost:3000/api/books?q=time&type=title" | \
  python3 -c "import sys,json; d=json.load(sys.stdin); print('books:', len(d))"
```
**期望**: `books >= 1`

### 小说
```bash
curl -s -b /tmp/ws_cookies.txt http://localhost:3000/api/novels | python3 -c "import sys,json; d=json.load(sys.stdin); print('novels:', len(d))"
```

## 安全验证
- 响应中不允许出现 AI_API_KEY / token / cookie 值
- 不允许硬编码密码
- 不允许暴露 internal IP 或内网地址

## 常见回归失败

| 失败项目 | 常见原因 | 修复方法 |
|----------|---------|---------|
| pnpm build 失败 | 类型错误、导入错误 | 检查新增/修改文件的 TS 类型 |
| usedKnowledgeBase=false | 搜索 FTS 失效、repo 未同步 | 检查 `embeddings` 表 |
| 代码搜索 404 | `/api/code` 路由缺失 | 确保 `src/app/api/code/route.ts` 存在 |
| 视频分析 pending | MediaCrawler 未运行 | `pm2 restart media-crawler` |
| 书籍搜索空 | `weread_id` 列缺失 | `ALTER TABLE books ADD COLUMN weread_id TEXT` |
| 新闻空 | proxy 未配置 | 检查 proxy-fetch.ts 中 mihomo 连接 |