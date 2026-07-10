# 整合报告: MadsLorentzen/ai-job-search

基于分析，直接整合该仓库的完整工作流复杂性较高（依赖本地LaTeX、Claude Code CLI、Python环境等），不适合在30分钟内实现。因此输出PLAN_ONLY，并附上详细的实现计划。

```file:INTEGRATION_PLAN_MadsLorentzen_ai_job_search.md
# 整合计划：ai-job-search 仓库到 Jann 工作台

## 1. 仓库核心功能分析

- `salary_lookup.py` / `convert_salary_excel.py`：薪资查询工具，读取本地 Excel 中的薪资数据，支持按职位/地区查询。
- `tools/lint_skills.py`：技能关键词清洗。
- `tools/security_guards.py`：安全守卫逻辑（防止生成不当内容）。
- `cover_letters/` 和 `cv/`：LaTeX 模板，用于生成求职信和简历。
- `.claude/` 下的命令和 agent 配置：Claude Code 工作流，依赖 CLI 环境。
- 其余文档和测试。

## 2. 整合目标（分阶段）

### 阶段一：薪资查询 API + 前端（30分钟内可完成）

将 `salary_lookup.py` 的核心逻辑抽象为无状态 API，并提供简单管理页面。

#### 技术方案

- 后端：Next.js API Route，使用 `better-sqlite3` 存储薪资数据（或直接读取 Excel 文件）。
- 前端：使用工作台已有的 Ant Design / Tailwind 组件，提供搜索/展示界面。
- 数据准备：将示例 Excel 转换为 SQLite 种子数据，或允许用户上传 Excel。

#### 文件结构新增/修改

```
src/app/api/salary/lookup/route.ts          # 薪资查询 API
src/app/api/salary/upload/route.ts          # 上传薪资 Excel
src/app/salary/page.tsx                     # 薪资查询页面
src/app/salary/upload/page.tsx              # 上传数据页面
src/lib/salary.ts                           # 薪资查询核心逻辑（从原Python移植）
src/db/salary.sql                           # 建表 SQL
prisma/schema.prisma                        # (可选) 如用 Prisma 管理 SQLite
```

#### 详细步骤

1. **移植 Python 薪资查询逻辑到 TypeScript**
   - 原 `salary_lookup.py` 使用 `pandas` 读取 Excel。我们改用 `xlsx` 或 `xlsx-parse` 解析。
   - 核心方法：`lookup_salary(job_title, region)`，返回统计值（median, p25, p75）。
   - 编写 `src/lib/salary.ts`，包含解析和查询函数。

2. **创建 SQLite 薪资表**
   - 使用 `better-sqlite3` 建表 `salaries`（字段：id, job_title, region, median, p25, p75, source, updated_at）。
   - 使用种子脚本将示例数据（如 `tools/convert_salary_excel.py` 的输出）导入。

3. **API 路由**
   - `GET /api/salary/lookup?q=job_title&region=region` 返回匹配结果。
   - `POST /api/salary/upload` 接收 Excel 文件，解析并更新数据库。

4. **前端页面**
   - `/salary/page.tsx`：搜索框 + 地区下拉，展示结果表格（带统计图表可选）。
   - `/salary/upload/page.tsx`：文件上传 + 预览 + 确认导入。

5. **集成到工作台侧边栏**
   - 在 `src/app/layout.tsx` 中添加导航链接 “薪资查询”。

#### 预估工作量：20～25分钟

### 阶段二：求职流程管理（需扩展，超出30分钟）

将 `.claude/commands` 中的工作流抽象为网页版“求职任务管理器”，包含：
- 职位爬取（整合工作台已有的 GitHub Trending / RSS 能力）
- 职位匹配打分（基于用户技能档案）
- 生成简历/Cover Letter（调用 LaTeX 或 PDF 生成服务）
- 面试准备记录

此阶段涉及大量前后端开发，建议在阶段一完成后作为独立项目推进。

## 3. 风险与注意事项

- 依赖 Python 的工具（如 `convert_salary_excel.py`）需转换为 TypeScript 或通过 subprocess 调用（不推荐）。
- 原仓库的薪资数据格式（Excel）需要明确，可能需要用户上传自己的数据。
- 工作台已有 AI 知识库问答，可复用部分 RAG 能力用于面试准备。

## 4. 后续演进方向

- 添加薪资趋势图（基于历史数据）。
- 支持多用户上传各自薪资数据。
- 与求职门户 API（如 Jobindex）对接，自动拉取职位。
- 集成 LaTeX 在线编译服务（如 Overleaf API 或本地 docker）实现简历生成。

## 5. 结论

直接完整整合仓库不现实，但抽取 **薪资查询** 模块可以在30分钟内实现，并作为工作台的一个实用功能。建议优先执行阶段一，后续再逐步扩展。
```

---
任务 ID: a0b4d975-31ac-4a9f-b622-7852f50a4bc4
时间: 2026-07-10T00:55:20.182Z
