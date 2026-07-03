# 个人工作台

个人知识库 + 任务管理 + 备忘录 + Daily 页面。

## 快速部署

### 1. 填写环境变量

```bash
cp .env.example .env
```

编辑 `.env`：
```env
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your_secure_password_here
SESSION_SECRET=at_least_32_bytes_random_string
INIT_TOKEN=your_random_init_token
```

生成随机密钥：
```bash
openssl rand -hex 32   # → SESSION_SECRET
openssl rand -hex 16   # → INIT_TOKEN
```

### 2. 首次初始化

**方式一：CLI（推荐）**
```bash
pnpm install
pnpm init-admin admin "YourPassword123!"
pnpm build
docker-compose up -d
```

**方式二：HTTP（容器内）**
```bash
docker-compose up -d
curl -X POST http://localhost:3000/api/init \
  -H "Content-Type: application/json" \
  -H "X-Init-Token: your_init_token" \
  -d '{"username":"admin","password":"YourPassword123!"}'
```

### 3. 登录

访问 `http://your-server:3000/login`，使用初始化的账号登录。

---

## 目录结构

```
/data/               # Docker 持久化目录
  app.db             # SQLite 数据库
  notes/             # 笔记 Markdown 文件
  memos/             # 备忘录 Markdown 文件
  daily/             # Daily 页面 Markdown 文件
  uploads/           # 附件文件
  backups/           # 备份压缩包
```

---

## 备份与恢复

```bash
# 备份（生成 workspace_YYYY-MM-DD_HHMMSS.tar.gz）
./scripts/backup.sh

# 恢复
./scripts/restore.sh data/backups/workspace_2026-07-02_120000.tar.gz
```

---

## AI 功能预留（Phase 4）

填写 `.env` 中的 `AI_BASE_URL` + `AI_API_KEY`，系统自动启用：
- `/api/ai/summarize-today` — 今日总结
- `/api/ai/extract-tasks` — 从笔记提取任务
- `/api/ai/generate-report` — 项目周报生成

---

## 技术栈

| 层 | 技术 |
|---|------|
| 框架 | Next.js 14 (App Router) |
| 数据库 | SQLite + better-sqlite3 + Drizzle ORM |
| 鉴权 | iron-session (加密 Cookie) |
| 样式 | Tailwind CSS |
| Markdown | react-markdown + remark-gfm |
| 存储 | Markdown 文件 + SQLite 元数据 |

## 开发

```bash
pnpm install
pnpm dev          # 开发模式
pnpm build        # 构建生产版本
pnpm db:push      # 推送 schema 到数据库
pnpm init-admin   # 初始化管理员账号
```