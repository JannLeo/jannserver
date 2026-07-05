# Agent Workflow 规范

> 多人/多 Agent 并行开发时的协作规范，解决任务状态丢失、合并丢功能、上下文不一致问题。

## 核心原则

1. **1 issue = 1 branch = 1 PR**，原子化任务
2. **main 是神圣的**，禁止 force-push main
3. **worker 不能直推 main**，所有改动必须走 PR
4. **Feishu 只做通知**，不是任务真相源
5. **每个 Agent 使用独立 worktree + 独立 DATA_DIR**，隔离运行环境
6. **合并前必须跑 smoke.sh**，回归验证
7. **PR 必须填写验收命令**，reviewer 据此验证

## 标准流程

```
[1] 创建 issue (GitHub Issues)
       ↓
[2] 创建 worktree + branch
       ↓
[3] 开发 + 本地 smoke.sh 验证
       ↓
[4] push branch → GitHub → 创建 PR
       ↓
[5] CI + 人工 review
       ↓
[6] Squash merge → main
```

## 创建 Issue

每个任务在 GitHub Issues 创建，模板：`agent_task.yml`

```yaml
title: "fix: /ask 搜索 wiki 精确度"
type: fix/feat/chore
target: hermes | workspace | aitoearn
acceptance_command: |
  curl -s -b /tmp/cookie.txt -X POST http://localhost:3000/api/ai/ask \
    -H 'Content-Type: application/json' \
    -d '{"question":"fitness是什么","history":[]}' | grep usedKnowledgeBase
```

## 创建 Worktree

```bash
# 用法: ./scripts/create-agent-worktree.sh <agent-name> <issue-number> <short-desc>
./scripts/create-agent-worktree.sh hermes-a 123 fix-ask-wiki-exact
```

行为：
- 基于 `origin/main` 创建分支 `agent/<agent-name>/issue-<num>-<desc>`
- worktree 放到 `/models-ssd/agent-sandboxes/<agent-name>/issue-<num>-<desc>`
- 独立 DATA_DIR：`/models-ssd/agent-data/<agent-name>/issue-<num>-<desc>`
- 输出运行命令（启动服务用独立 DATA_DIR）

**禁止修改生产 DATA_DIR**（`/home/sz/workspace/data/`）

## 开发规范

### 每次开始工作前
```bash
git checkout main
git pull origin main          # 确保 main 最新
git checkout agent/xxx/issue-123
git pull --rebase origin main # 保持与 main 同步
```

### 提交规范
```bash
# feat|fix|docs|refactor|test|chore 分类型
git commit -m "fix(ask): search precision when query is exact match"
```

### 禁止事项
- ❌ `git push origin main` 直接推送
- ❌ `git push --force origin main`
- ❌ 在 main 分支直接开发
- ❌ 修改生产 DATA_DIR 路径
- ❌ Feishu 任务状态作为唯一真相（只做通知）

## 合并前验证

```bash
./scripts/smoke.sh
# 必须全部 PASS 才能合并
```

smoke.sh 检查项：
- `pnpm build` 通过
- `/api/health` 返回 200
- `/api/video-analysis/status` 配置状态正常
- `/api/project-brain/compile` 对非索引 repo 返回 `ok: false`
- `/api/ai/ask fitness是什么` 必须 `usedKnowledgeBase: true`

## 分支命名

```
agent/<agent-name>/issue-<num>-<short-desc>
```

示例：
```
agent/hermes-a/issue-123-fix-ask-wiki-exact
agent/jannleo/issue-456-novel-ai-generate
agent/guest/issue-789-add-video-montage
```

## 合并策略

- **Squash merge** 为主，保持 main 历史线性
- 每个 PR 只做一件事
- merge 前 rebase 到最新 main
- CI 失败禁止合并

## Feishu 通知

PR 创建/合并/失败时自动通知 Feishu，但不作为任务管理工具。
真实任务状态以 GitHub Issues + PR 为准。

## 紧急修复

hotfix 也必须走 PR：
```
main → hotfix branch → PR → 人工 review → merge
```

禁止绕过 review 直接 push main。