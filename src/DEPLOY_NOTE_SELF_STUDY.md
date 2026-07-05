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

## 未来扩展

- 更多内置课程内容
- 用户自建课程
- 课程内测验/练习题
- 学习数据分析图表
- 群组学习 / 学习排行
- 微信读书同步（已有 `source: 'weread'` 字段预留）