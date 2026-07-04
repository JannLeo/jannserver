# Workspace API 端点测试报告

**测试时间**: 2026-07-04
**基础 URL**: http://127.0.0.1:3000
**项目路径**: /home/sz/workspace

---

## 测试摘要

### 状态码统计

| 状态码 | 数量 | 说明 |
|--------|------|------|
| 200 | 4 | 成功返回 |
| 307 | 68 | 重定向到 /login (需要认证) |
| 401 | 1 | 未授权 |
| 403 | 1 | 禁止访问 (无效 init token) |
| 405 | 1 | 方法不允许 |
| **总计** | **75** | **已测试端点** |

---

## 公共端点 (无需认证)

### ✅ 可访问的页面

| 端点 | 状态码 | 响应 |
|------|--------|------|
| `/` | 307 | 重定向到 `/login` |
| `/login` | 200 | 登录页面 HTML |

### ✅ 可访问的 API

| 端点 | 方法 | 状态码 | 响应示例 |
|------|------|--------|----------|
| `/api/health` | GET | 200 | `{"status":"ok","time":...}` |
| `/api/auth/login` | POST | 401 | `{"error":"用户名或密码错误","remaining":4}` |
| `/api/auth/me` | GET | 200 | `{"userId":null,"username":null}` |
| `/api/auth/logout` | POST | 200 | `{"ok":true}` |
| `/api/init` | GET | 405 | Method Not Allowed |
| `/api/init` | POST | 403 | `{"error":"Invalid init token"}` |

---

## 受保护的端点 (需要认证)

以下端点在未登录时会返回 **307 重定向到 /login**：

### 页面路由 (19个)

| 端点 | 状态码 |
|------|--------|
| `/dashboard` | 307 → /login |
| `/ask` | 307 → /login |
| `/brain` | 307 → /login |
| `/code` | 307 → /login |
| `/daily` | 307 → /login |
| `/daily/2024-07-04` | 307 → /login |
| `/memos` | 307 → /login |
| `/notes` | 307 → /login |
| `/notes/new` | 307 → /login |
| `/notes/[slug]` | 307 → /login |
| `/novel` | 307 → /login |
| `/novel/[id]` | 307 → /login |
| `/projects` | 307 → /login |
| `/repos` | 307 → /login |
| `/tasks` | 307 → /login |
| `/usage` | 307 → /login |
| `/video-analysis` | 307 → /login |
| `/wiki` | 307 → /login |

### API 端点 (50+)

#### AI 相关 (3个)
- `/api/ai/ask` - 307
- `/api/ai/daily-plan` - 307
- `/api/ai/daily-summary` - 307

#### 脑图 Brain (5个)
- `/api/brain/status` - 307
- `/api/brain/sync` - 307
- `/api/brain/user-info` - 307
- `/api/brain/alphas` - 307
- `/api/brain/alphas/[id]` - 307

#### 代码文件 (1个)
- `/api/code-files` - 307

#### 每日 Daily (2个)
- `/api/daily/[date]` GET - 307
- `/api/daily/[date]` POST - 307

#### 嵌入 Embeddings (1个)
- `/api/embeddings/rebuild` - 307

#### 备忘录 Memos (2个)
- `/api/memos` GET - 307
- `/api/memos` POST - 307

#### 新 API 使用统计 (1个)
- `/api/new-api/usage` - 307

#### 笔记 Notes (4个)
- `/api/notes` GET - 307
- `/api/notes` POST - 307
- `/api/notes/[slug]` GET - 307
- `/api/notes/[slug]` PUT - 307

#### 小说 Novels (6个)
- `/api/novels` GET - 307
- `/api/novels` POST - 307
- `/api/novels/[id]` - 307
- `/api/novels/[id]/chapters` - 307
- `/api/novels/[id]/volumes` - 307
- `/api/novels/[id]/ai-generate` - 307

#### Obsidian 同步 (1个)
- `/api/obsidian/sync` - 307

#### 项目脑图 Project Brain (6个)
- `/api/project-brain/status` - 307
- `/api/project-brain/scan` - 307
- `/api/project-brain/compile` - 307
- `/api/project-brain/ontology` - 307
- `/api/project-brain/ontology` POST - 307
- `/api/project-brain/ontology/list` - 307

#### 项目 Projects (1个)
- `/api/projects` - 307

#### 仓库 Repos (7个)
- `/api/repos` GET - 307
- `/api/repos` POST - 307
- `/api/repos/activity` - 307
- `/api/repos/[id]` - 307
- `/api/repos/[id]/sync` - 307
- `/api/repos/[id]/documents` - 307
- `/api/repos/[id]/documents/[docId]` - 307

#### 搜索 (1个)
- `/api/search?q=test` - 307

#### 标签 Tags (1个)
- `/api/tags` - 307

#### 任务 Tasks (5个)
- `/api/tasks` GET - 307
- `/api/tasks` POST - 307
- `/api/tasks/[id]` GET - 307
- `/api/tasks/[id]` PATCH - 307
- `/api/tasks/delegations` - 307

#### 视频分析 (6个)
- `/api/video-analysis/status` - 307
- `/api/video-analysis/jobs` GET - 307
- `/api/video-analysis/jobs` POST - 307
- `/api/video-analysis/jobs/[id]` - 307
- `/api/video-analysis/jobs/[id]/analyze` - 307
- `/api/video-analysis/jobs/[id]/publish` - 307

#### Wiki (6个)
- `/api/wiki/spaces` - 307
- `/api/wiki/pages` GET - 307
- `/api/wiki/pages` POST - 307
- `/api/wiki/pages/[id]` GET - 307
- `/api/wiki/pages/[id]` PUT - 307
- `/api/wiki/compile` - 307

---

## 认证机制

项目使用中间件 (`src/middleware.ts`) 实现认证保护：

### 公共路径 (无需认证)
```typescript
const publicPaths = [
  '/login', '/api/health', '/api/init',
  '/api/auth/login', '/api/auth/logout', '/api/auth/me',
  '/_next/', '/favicon.ico',
  '/manifest.json', '/sw.js',
  '/icons/',
];
```

### 认证方式
- 使用 `iron-session` 管理会话
- Cookie 名称: `workspace_session`
- 会话有效期: 7 天
- 未登录用户会被重定向到 `/login`

### CSRF 保护
- 对 POST/PUT/PATCH/DELETE 请求进行 Origin 检查
- 允许的主机通过 `ALLOWED_HOSTS` 环境变量配置

---

## 结论

1. **认证系统正常工作**: 未登录用户访问受保护资源时正确返回 307 重定向
2. **健康检查可用**: `/api/health` 返回正常状态
3. **登录 API 正常**: 错误凭据返回 401，响应包含剩余尝试次数
4. **会话查询可用**: `/api/auth/me` 正确返回当前登录状态
5. **所有受保护的端点**: 在未认证时都正确返回 307 到 /login

---

*测试脚本位置: `/home/sz/workspace/test-endpoints.sh`*