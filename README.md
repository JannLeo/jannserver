# 个人工作台

个人知识库、任务、备忘录、Daily、AI、仓库索引、Herdr/TailSSH 等功能的 Next.js 工作台。

## 运行要求

- Node.js 20+
- pnpm 8.15.9（仓库已在 `package.json` 固定）
- Docker + Docker Compose（推荐生产部署）
- TailSSH 为可选组件，需要 Python 3.10+、`ssh` 客户端

## 快速部署（Docker Compose）

### 1. 配置环境变量

```bash
cp .env.example .env
```

至少设置：

```env
SESSION_SECRET=<至少 32 个随机字符>
INIT_TOKEN=<随机初始化令牌>
ADMIN_USERNAME=admin
ADMIN_PASSWORD=<强密码>
ALLOWED_HOSTS=your-domain.example.com,127.0.0.1
```

推荐直接生成：

```bash
openssl rand -hex 32   # SESSION_SECRET
openssl rand -hex 16   # INIT_TOKEN
openssl rand -hex 32   # HERDR_API_KEY（如需要机器调用）
openssl rand -hex 32   # DELEGATION_API_KEY（如需要机器调用）
```

生产环境不要使用仓库示例值。`SESSION_SECRET` 少于 32 个字符时，生产鉴权会拒绝请求。

`ALLOWED_HOSTS` 默认是**精确匹配**。例如 `example.com` 不会自动信任 `foo.example.com`；只有确实需要所有子域时才写 `*.example.com`。通过服务器 IP、Tailscale 主机名或正式域名访问时，必须把实际 hostname/IP 加进去，否则生产 middleware 会返回 `421`。

默认生产 Cookie 带 `Secure`，因此正式部署应通过 HTTPS 访问。如果你明确只在可信的纯 HTTP/Tailscale 网络中使用，才设置：

```env
ALLOW_HTTP_COOKIES=true
```

直接暴露 Next/Docker 时请保持 `TRUST_PROXY_HEADERS=false`。只有在你确认上游反向代理会覆盖而不是透传客户端 `X-Forwarded-For` / `X-Real-IP` 时才应该开启；仓库自带 PM2 Gateway 已满足这个条件，并会仅在 loopback Next 后端上自动启用。

### 2. 启动

```bash
docker compose up -d --build
```

Compose 使用 `./data:/data` 保存 SQLite 与工作数据。镜像启动时会处理该挂载目录的容器写权限，然后降权为非 root 用户运行应用。

检查健康状态：

```bash
curl http://127.0.0.1:3000/api/health
```

正常应包含：

```json
{"status":"ok","database":"ok"}
```

### 3. 首次初始化管理员

HTTP 初始化：

```bash
curl -X POST http://127.0.0.1:3000/api/init \
  -H "Content-Type: application/json" \
  -H "X-Init-Token: $INIT_TOKEN" \
  -d '{"username":"admin","password":"YourPassword123!"}'
```

首次初始化的“检查是否已有用户 + 创建首用户”在 SQLite IMMEDIATE 事务内完成，并发请求也只能成功一个。

然后通过你配置好的 HTTPS 地址登录；仅在可信纯 HTTP/Tailscale 场景并设置 `ALLOW_HTTP_COOKIES=true` 时使用 `http://.../login`。

也可以在本机 Node 环境中初始化：

```bash
pnpm install --frozen-lockfile
pnpm init-admin admin "YourPassword123!"
```

## 数据目录

Docker 默认使用 `/data`，宿主机对应 `./data`：

```text
data/
├── app.db                 # 主 SQLite 数据库
├── sessions.db            # Agent session 数据库（按需创建）
├── notes/
├── memos/
├── daily/
├── uploads/
├── backups/
├── repos/                 # 被索引/同步的仓库
└── obsidian-vault/        # 可选 Obsidian 数据
```

不要提交 `data/`、SQLite 文件、虚拟环境或本地 TailSSH 配置；仓库的 ignore 规则已经覆盖这些内容。

## 安全相关环境变量

| 变量 | 用途 |
|---|---|
| `SESSION_SECRET` | iron-session Cookie 加密，生产必须 >= 32 字符 |
| `INIT_TOKEN` | `/api/init` 首次初始化保护 |
| `ALLOWED_HOSTS` | 生产 Host + 浏览器 Origin/Referer 白名单；子域需显式 `*.` |
| `ALLOW_HTTP_COOKIES` | 仅在可信纯 HTTP/Tailscale 环境明确设为 `true` |
| `TRUST_PROXY_HEADERS` | 是否信任转发客户端 IP 头；直连/Docker 默认 `false` |
| `HERDR_API_KEY` | Herdr 机器调用，使用 `x-herdr-key` |
| `DELEGATION_API_KEY` | 任务委派机器调用，使用 `x-delegation-key` |
| `RATE_LIMIT_WINDOW_MS` | 登录失败限流窗口 |
| `RATE_LIMIT_MAX_ATTEMPTS` | 限流窗口内最大失败次数 |

浏览器侧用户数据 API 默认要求正常登录 session。不要把 Herdr/Delegation API key 暴露到前端代码。

## TailSSH（可选）

仓库不再提交 Python 虚拟环境和真实机器配置。首次使用：

```bash
cd tailssh
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
cp config.example.json config.json
# 编辑本机 config.json
./run.sh
```

TailSSH 默认只监听 `127.0.0.1:9222`，应通过 jannserver 已鉴权的代理访问。真实 `config.json` 不要提交到 Git。

## PM2 / Gateway（可选）

`ecosystem.config.js` 默认使用仓库当前目录和当前 Node 可执行文件，不再依赖固定用户名或固定 NVM 路径。原始 Next 服务固定绑定 `127.0.0.1:NEXT_PORT`，Gateway 才是公开入口；Gateway 会覆盖转发 IP 头，并在转发 OpenCode/Vibe 时移除工作台 session Cookie 与机器密钥。

```bash
pnpm install --frozen-lockfile
pnpm build
pm2 start ecosystem.config.js
```

Gateway 默认：

- 外部入口：`GATEWAY_PORT=3000`
- 内部 Next：`127.0.0.1:NEXT_PORT=3002`
- WebSocket proxy：`127.0.0.1:PROXY_PORT=3001`
- OpenCode：`OPENCODE_PORT=34567`

按需在 `.env` 覆盖。

## 本地开发

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm dev
```

生产构建：

```bash
pnpm typecheck
pnpm build
```

`next.config.js` 不再忽略 TypeScript build errors；类型错误会直接阻止生产构建。

## CI

Pull Request 和 `main` push 会运行 GitHub Actions，验证：

- `pnpm install --frozen-lockfile`
- Gateway / WebSocket proxy JavaScript 语法
- 备份/恢复脚本语法
- TypeScript 严格检查
- TailSSH Python 语法
- 完整 SQLite + 文件备份、`--verify` 与恢复 round-trip
- Next.js production build
- Docker image build
- root-owned `/data` bind mount 下启动容器
- `/api/health` 的 SQLite 运行时健康检查

## 备份与恢复

```bash
pnpm backup
pnpm restore -- data/backups/<backup-file>.tar.gz
```

备份脚本会对 `app.db`、`sessions.db` 等 data 根目录 SQLite 文件使用 online backup API 生成一致快照，不直接打包 live WAL/SHM；恢复会先校验归档路径、拒绝符号链接，并对 SQLite 执行 `quick_check`。

也保留了 `scripts/backup.sh` / `scripts/restore.sh` 兼容包装脚本，它们现在统一调用同一套 `.mjs` 实现，不再维护另一套恢复逻辑。实际恢复前仍建议先额外保留当前 `data/` 副本并停止应用写入。

## 技术栈

| 层 | 技术 |
|---|---|
| 框架 | Next.js 14 / App Router |
| 数据库 | SQLite + better-sqlite3 + Drizzle ORM |
| 鉴权 | iron-session |
| 样式 | Tailwind CSS |
| Markdown | react-markdown + remark-gfm |
| 部署 | Next standalone + Docker / PM2 |
