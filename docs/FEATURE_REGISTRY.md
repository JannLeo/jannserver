# Feature Registry

> 所有业务功能的注册表，定义每个功能涉及的文件、API、DB 表、配置。

## 1. AI 问答 (`/ask`)
| 项目 | 值 |
|------|-----|
| 页面 | `src/app/ask/` |
| API | `POST /api/ai/ask` |
| DB | `search_fts`, `repo_documents`, `repo_sources`, `embeddings` |
| 模型 | 由 `AI_BASE_URL` + `AI_API_KEY` + `AI_MODEL` 配置 |
| 配置 | `src/lib/db/schema.ts` (问的搜索参数) |
| 测试 | `curl -X POST /api/ai/ask -d '{"question":"fitness是什么"}'` 应含 `usedKnowledgeBase: true` |
| 依赖 | `project_code_files` 已索引 |

## 2. 小说创作 (`/novel`)
| 项目 | 值 |
|------|-----|
| 页面 | `src/app/novel/` |
| API | `GET/POST /api/novels`, `GET/POST /api/novels/[id]/ai-generate` |
| DB | `novels`, `novel_chapters`, `novel_volumes` |
| 阶段 | `setup` → `outline` → `chapter` |
| 配置邮箱 | `EMAIL_FROM` (小说生成时可用) |
| 注意 | AI API 429 限速，建议重试 |

## 3. 视频分析 (`/video-analysis`)
| 项目 | 值 |
|------|-----|
| 页面 | `src/app/video-analysis/` |
| API | `GET/POST /api/video-analysis/jobs`, `POST /api/video-analysis/jobs/[id]` |
| DB | `video_analysis_jobs`, `video_analysis_items`, `video_analysis_reports` |
| 依赖 | MediaCrawler 服务（端口 8080, PM2 managed） |
| 模式 | `search` / `detail` / `creator` |
| 配置 | `MEDIA_CRAWLER_BASE_URL`, `MEDIA_CRAWLER_ENABLED` |

## 4. 代码搜索 (`/code`)
| 项目 | 值 |
|------|-----|
| 页面 | `src/app/code/` |
| API | `GET /api/code`, `GET /api/code-files` |
| DB | `project_code_files` (5586 rows), `repo_sources` |
| 数据 | 20 repos 已同步，代码按 `rel_path` + `summary` 匹配 |
| 注意 | `/api/code` 需要 auth token |

## 5. 知识库 (`/knowledge`)
| 项目 | 值 |
|------|-----|
| 页面 | `src/app/knowledge/page.tsx` (客户端组件) |
| 4 个 tab | 📚 文档 / 💻 代码 / 📁 项目 / 📖 Wiki |
| 文档 | `GET /api/repos` 列出 |
| 代码 | `GET /api/code?q=...` |
| 项目 | `GET /api/repos` 作为项目展示 |
| Wiki | `GET /api/wiki/search` |

## 6. AI 使用量 (`/usage`)
| 项目 | 值 |
|------|-----|
| 页面 | `src/app/usage/` |
| API | `POST /api/register/usage`, `GET /api/usage` |
| 配置 | `NEW_API_BASE_URL`, `NEW_API_ADMIN_TOKEN` |

## 7. 新闻 (`/news`)
| 项目 | 值 |
|------|-----|
| 页面 | `src/app/news/` |
| API | `GET /api/news` (代理 RSS) |
| 代理 | 通过 `proxyFetchText` 走 mihomo |
| 白名单 | `/api/news` 在 middleware public paths |

## 8. 趋势 (`/trending`)
| 项目 | 值 |
|------|-----|
| 页面 | `src/app/trending/` |
| API | `GET /api/trending` |
| 数据 | GitHub Trending + 自动中文翻译 |

## 9. 读书计划 (`/reading`)
| 项目 | 值 |
|------|-----|
| 页面 | `src/app/reading/` |
| API | `GET /api/books?q=...`, `POST /api/books`, `DELETE /api/books/[id]` |
| DB | `books` 表 (`weread_id` 列已添加) |
| 数据源 | Open Library API (通过 proxyFetch) |

## 10. WorldQuant BRAIN (`/brain`)
| 项目 | 值 |
|------|-----|
| 页面 | `src/app/brain/` |
| DB | `brain_alphas`, `brain_user_info` |
| API | 通过 Basic Auth → JWT |
| 统计 | 8,757 alphas, submitted=59 |
| cron | WQ Daily Backtest (每 6h) |
| 注意 | WORKDAY 账户，POST /alphas 405，只能 Web UI 创建 |

## 11. 新闻聚合 (主页/仪表盘)
| 项目 | 值 |
|------|-----|
| 页面 | `src/app/dashboard/` |
| 功能 | 余额、AI 用量、热门新闻、每日总结 |