# 🎯 自学功能部署说明

## 概述

自学功能参考 [DeepTutor](https://github.com/HKUDS/DeepTutor) 架构设计，提供了学习仪表盘、结构化课程、AI 导师对话和间隔重复闪卡等功能。

## 数据库

5 张新表已添加到 `data/app.db`：

| 表名 | 用途 | 创建方式 |
|------|------|----------|
| `courses` | 课程定义（标题、描述、分类、难度） | 代码初始化 |
| `course_modules` | 课程模块/章节（内容、预计时长、前置条件） | 代码初始化 |
| `learning_progress` | 用户学习进度（状态、掌握度、花费时间） | 运行时自动创建 |
| `flashcards` | 闪卡（正反面、SM-2 算法参数） | 用户创建 + 运行时自动创建 |
| `flashcard_reviews` | 闪卡复习记录（质量评分、响应时间） | 运行时自动创建 |

### 初始化

```bash
# 进入项目目录
cd /home/test/code/jannserver

# 创建表（已验证）
sqlite3 data/app.db "
CREATE TABLE IF NOT EXISTS courses (...);
CREATE TABLE IF NOT EXISTS course_modules (...);
CREATE TABLE IF NOT EXISTS learning_progress (...);
CREATE TABLE IF NOT EXISTS flashcards (...);
CREATE TABLE IF NOT EXISTS flashcard_reviews (...);
"
```

## 内置课程种子数据

5 门初始化课程，共 15 个模块：

1. **Python 入门** (py-101) — 4 章：变量 → 条件循环 → 函数 → OOP
2. **Web 开发基础** (web-101) — 3 章：HTML → CSS → JavaScript
3. **算法与数据结构** (algo-101) — 4 章：复杂度 → 数组链表 → 哈希表 → 排序
4. **机器学习基础** (ml-101) — 2 章：概述 → 线性/逻辑回归
5. **Linux 系统管理** (linux-101) — 2 章：基础命令 → 进程管理

种子数据脚本：`/tmp/seed_courses.py`

## AI 导师说明

自学的 AI 导师复用 `/api/ai/ask` 知识库问答接口（同 Ask 页面）。
请求时附带课程上下文前缀，例如 `【Python相关】解释什么是列表推导式`。

## 侧边栏

「自学」子菜单位于侧边栏「🎯 自学」下，包含：
- 学习仪表盘 (`/self-study`)
- 课程 (`/self-study/courses`)
- AI 导师 (`/self-study/tutor`)
- 闪卡 (`/self-study/flashcards`)

## 目录结构

```
src/
├── app/
│   ├── self-study/
│   │   ├── page.tsx                    # 学习仪表盘
│   │   ├── courses/
│   │   │   ├── page.tsx                # 课程目录
│   │   │   └── [id]/page.tsx           # 课程详情（可展开模块）
│   │   ├── tutor/page.tsx              # AI 导师聊天
│   │   └── flashcards/page.tsx         # 闪卡复习（SM-2 算法）
│   └── api/self-study/
│       ├── courses/route.ts            # GET 课程列表 / POST 创建课程
│       ├── courses/[id]/route.ts       # GET 课程详情+模块
│       ├── progress/route.ts           # GET/POST 学习进度
│       ├── dashboard/route.ts          # GET 仪表盘统计
│       └── flashcards/
│           ├── route.ts                # GET/POST 闪卡
│           └── [id]/review/route.ts    # POST 闪卡复习（SM-2 算法）
└── lib/db/
    └── schema.ts                       # courses/course_modules/learning_progress/flashcards/flashcard_reviews 表定义
```

## 闪卡 SM-2 算法

每次复习评分 (0-5)：
- 0-2：失败（重置间隔）
- 3-5：成功（逐步增加间隔）

| 评分 | 含义 |
|------|------|
| 0 | 完全忘记 |
| 1 | 记错了 |
| 2 | 困难 |
| 3 | 一般 |
| 4 | 良好 |
| 5 | 简单 |

间隔增长：1天 → 6天 → ef × 上一个间隔

## 新增字段说明

### course_modules 新增字段

```sql
ALTER TABLE course_modules ADD COLUMN repo_context TEXT NOT NULL DEFAULT '';
ALTER TABLE course_modules ADD COLUMN repo_path TEXT NOT NULL DEFAULT '';
```

| 字段 | 含义 | 示例 |
|------|------|------|
| `repo_context` | 仓库名（对应 repo_sources.name）或本地绝对路径 | `/home/test/code/tc_ble_lite_sdk-1.2.2_allinone` |
| `repo_path` | 仓库内子目录（学习的代码范围） | `src/app/api`、`drivers/` |

> **注意**：`repo_context` 优先查 `repo_sources` 表的 `local_path`；找不到时直接当绝对路径用

### 给任意模块绑定仓库

```sql
-- 例如：把 Matter SDK 绑定到一个自学模块
UPDATE course_modules
SET repo_context = '/home/test/code/matter-sdk',
    repo_path = 'src/connectedhomeip/'
WHERE id = 'matter-101-01';
```

## 课程模块 × 仓库绑定示例

已内置以下绑定（以 jannserver 本身作为示例仓库）：

| 模块 ID | 仓库路径 | 学习内容 |
|--------|----------|---------|
| `py-101-04` | `jannserver/src/lib/db` | OOP + Schema 实战 |
| `py-101-jann` | `jannserver/src/lib` | jannserver 项目架构分析 |
| `algo-101-01` | `jannserver/src/lib/db` | 时间复杂度 → DB schema 设计 |
| `algo-101-04` | `jannserver/src/app/api` | 排序算法 → API 路由结构 |
| `algo-101-api` | `jannserver/src/app/api` | API 设计模式实战 |
| `linux-101-02` | `jannserver/src/app/api` | 进程管理 → API handlers |

---

## AI 导师代码上下文流程

```
选模块 (有 repo_context)
  → GET /api/self-study/courses/[id]/overview
      → 扫描 repo_path 下的代码文件树
      → 提取关键源码（<100KB，过滤 node_modules/.git/build 等）
      → 返回 fileTree + keyFiles[]
  → AI 生成架构概览（显示在聊天顶部）
  → 用户追问
      → 自动把 keyFiles 内容注入到 Ask 请求
      → AI 基于实际代码回答
```

## 扩展：绑定 Matter SDK

```bash
# 1. 把 Matter SDK clone 到本地
git clone https://github.com/project-chip/connectedhomeip.git ~/code/matter-sdk

# 2. 插入 Matter 课程
sqlite3 data/app.db "INSERT INTO courses (id, title, description, category, icon, color, 'order')
  VALUES ('matter-101', 'Matter 协议栈', '学习 CHIP/Matter 协议栈架构和源码', 'embedded', '🔌', '#6b21a8', 10);"

# 3. 绑定模块到仓库
sqlite3 data/app.db "INSERT INTO course_modules
  (id, course_id, title, description, content_type, estimated_minutes, 'order', repo_context, repo_path)
VALUES
  ('matter-101-arch', 'matter-101', '协议栈整体架构', ' CHIP 协议分层、Matter 系统设计', 'code', 30, 1,
   '$(echo $HOME)/code/matter-sdk', 'src/'),
  ('matter-101-bluetooth', 'matter-101', 'BLE/BDR 传输层', 'Matter BLE 传输实现', 'code', 25, 2,
   '$(echo $HOME)/code/matter-sdk', 'src/transport/');"
```

## 未来扩展

- [ ] 对接 repo_sources 表，自动识别仓库路径
- [ ] 代码增量更新（watch 文件变化，刷新 overview）
- [ ] 内置练习题生成（AI 根据代码结构出题）
- [ ] 多仓库联合学习（一个模块关联多个仓库）