# ADR-0001: Agent Workflow 规范

**Status**: Accepted
**Date**: 2026-07-05
**Author**: Hermes Agent (auto-generated)
**Reviewers**: JannLeo

## Context

多个 Hermes / OpenClaw Agent 并行开发同一个仓库时出现以下问题：
1. 任务状态丢失 — Agent 被中断后不知道做到哪了
2. 合并冲突丢功能 — 两个 Agent 同时修改同一文件
3. 上下文不一致 — 一个 Agent 不知道另一个 Agent 改了啥
4. 生产数据被污染 — Agent 测试时直接写在 `data/` 目录

## Decision

采用 Git Worktree + 独立 DATA_DIR 的工作流：

1. **每个 Agent 任务 = 独立 worktree**
   - `git worktree add` 创建隔离的工作目录
   - 不干扰当前 Agent 的终端状态

2. **独立 DATA_DIR**
   - 每个 worktree 用独立 SQLite 数据库路径
   - 生产 `data/` 目录不加 `NODE_OPTIONS` 或 `.env`
   - 避免测试数据污染生产

3. **1 issue = 1 branch = 1 PR**
   - 禁止直推 main
   - 合并前必须跑 smoke.sh

## Consequences

Positive:
- Agent 可以安全并行开发
- 任务状态显式记录在 GitHub Issues + git commit 中
- Feishu 只做通知，事实源回归 git

Negative:
- 新增 git worktree 管理开销
- 需要额外磁盘空间（worktree 每个约 500MB）

## Technical Details

```bash
# create-agent-worktree.sh 实现的关键步骤
git fetch origin
git worktree add -b agent/<name>/issue-<num>-<desc> \
  <worktree-path> origin/main
cp .env.example <worktree-path>/.env
# 设置 DATA_DIR 为 /models-ssd/agent-data/<name>/issue-<num>-<desc>
cd <worktree-path>
pnpm install
```

## Alternatives Considered

- **单个 git branch**：缺少终端隔离，一个 Agent 被中断后工作目录状态丢失
- **Docker 容器**：太重，构建时间长
- **FEATURE_REGISTRY.md**：只记录功能，不解决并发问题