// @ts-nocheck
/**
 * 视频分析工作台 - 后端逻辑
 *
 * 通过 HTTP API 调用 MediaCrawler 服务，任务状态持久化到本地 SQLite。
 * 不存储 cookie/token/账号密码。
 * MediaCrawler 平台代码映射：
 *   bilibili → bili
 *   douyin   → dy
 *   kuaishou → ks
 *   xhs      → xhs
 */

import { db, sqlite } from './db/index';
import { videoAnalysisJobs, videoAnalysisItems, videoAnalysisReports } from './db/schema';
import { eq, desc, asc } from 'drizzle-orm';

// ─── 平台映射 ─────────────────────────────────────────────────────────────────
const PLATFORM_MAP: Record<string, string> = {
  bilibili: 'bili',
  douyin: 'dy',
  kuaishou: 'ks',
  xhs: 'xhs',
};

const REVERSE_PLATFORM_MAP: Record<string, string> = {};
for (const [k, v] of Object.entries(PLATFORM_MAP)) REVERSE_PLATFORM_MAP[v] = k;

export function toMediaCrawlerPlatform(p: string): string {
  return PLATFORM_MAP[p] || p;
}

export function fromMediaCrawlerPlatform(p: string): string {
  return REVERSE_PLATFORM_MAP[p] || p;
}

// ─── 环境变量 ─────────────────────────────────────────────────────────────────
export function getBaseUrl(): string {
  return (process.env.MEDIA_CRAWLER_BASE_URL || '').trim();
}

export function isEnabled(): boolean {
  return (process.env.MEDIA_CRAWLER_ENABLED || '').trim() === 'true';
}

/**
 * 从环境变量读取 Bilibili cookie 字符串。
 * 格式: key1=value1; key2=value2; ...
 * 需要 SESSDATA, DedeUserID, DedeUserID__ckMd5 等核心字段才可正常搜索。
 */
export function getBiliCookies(): string {
  return (process.env.MEDIA_CRAWLER_BILI_COOKIES || '').trim();
}

// ─── 1. 服务状态 ──────────────────────────────────────────────────────────────
export interface StatusResult {
  configured: boolean;
  serviceReachable: boolean;
  baseUrl: string | null;
  error: string | null;
  /** 根路径 `/` 是否可达（HTTP 200 + 识别响应体）。这是 serviceReachable 的真正判据。 */
  rootOk: boolean;
  /** /api/env/check 是否通过。仅作 debugInfo，不影响 serviceReachable。 */
  envCheckOk: boolean | null;
  /** /api/env/check 失败原因（若失败）。 */
  envCheckError: string | null;
}

/**
 * 判断根路径响应体是否为 MediaCrawler WebUI API。
 * 命中 message="MediaCrawler WebUI API" 或存在 docs 字段即认为可达。
 */
function isMediaCrawlerRootBody(data: any): boolean {
  if (!data || typeof data !== 'object') return false;
  const msg = String(data.message || '');
  if (msg.includes('MediaCrawler WebUI API')) return true;
  if (typeof data.docs === 'string' && data.docs.length > 0) return true;
  return false;
}

export async function getStatus(): Promise<StatusResult> {
  const baseUrl = getBaseUrl();
  if (!baseUrl || !isEnabled()) {
    return {
      configured: false,
      serviceReachable: false,
      baseUrl: baseUrl || null,
      error: 'MediaCrawler 未配置，请先设置 MEDIA_CRAWLER_BASE_URL 和 MEDIA_CRAWLER_ENABLED=true',
      rootOk: false,
      envCheckOk: null,
      envCheckError: null,
    };
  }

  // 1. 请求根路径 `/` 作为服务可达性的唯一判据。
  //    不依赖 /api/env/check，因为后者内部触发 uv 依赖解析，受 PyPI 源 / Python 版本
  //    markers 影响，会误报 Environment check failed。
  let rootOk = false;
  let rootError: string | null = null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${baseUrl}/`, { signal: controller.signal });
    clearTimeout(timeout);
    if (res.ok) {
      const data = await res.json().catch(() => null);
      if (isMediaCrawlerRootBody(data)) {
        rootOk = true;
      } else {
        rootError = `根路径响应未识别为 MediaCrawler API (status=200)`;
      }
    } else {
      rootError = `MediaCrawler 根路径返回 ${res.status}`;
    }
  } catch (err: any) {
    if (err.name === 'AbortError') {
      rootError = '无法连接 MediaCrawler 服务（超时）';
    } else {
      rootError = '无法连接 MediaCrawler 服务';
    }
  }

  // 2. /api/env/check 仅作 debugInfo，不影响 serviceReachable。
  //    用 http.get 而非 fetch（undici 在有 HTTP_PROXY 时可能绕过 no_proxy）
  let envCheckOk: boolean | null = null;
  let envCheckError: string | null = null;
  try {
    const http = require('http');
    const body = await new Promise<string>((resolve, reject) => {
      const req = http.get(`${baseUrl}/api/env/check`, { timeout: 20000 }, (res) => {
        const chunks: string[] = [];
        res.on('data', (c: string) => chunks.push(c));
        res.on('end', () => resolve(chunks.join('')));
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('超时')); });
    });
    let data: any = null;
    try { data = JSON.parse(body); } catch { data = null; }
    const ok = !!(data?.success || data?.ok);
    envCheckOk = ok;
    if (!ok) {
      envCheckError = String(data?.message || data?.error || 'Environment check failed');
    }
  } catch {
    envCheckOk = false;
    envCheckError = 'env/check 请求失败';
  }

  return {
    configured: true,
    serviceReachable: rootOk,
    baseUrl,
    error: rootOk ? null : rootError,
    rootOk,
    envCheckOk,
    envCheckError,
  };
}

// ─── MEDIA_CRAWLER PLATFORM LIST ──────────────────────────────────────────────
export async function getMcPlatforms(): Promise<string[]> {
  try {
    const baseUrl = getBaseUrl();
    const res = await fetch(`${baseUrl}/api/config/platforms`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.platforms || []).map((p: any) => p.value);
  } catch {
    return [];
  }
}

// ─── 2. 创建任务 ──────────────────────────────────────────────────────────────
export interface CreateJobInput {
  platform: string;
  crawlType: string;
  keyword?: string;
  targetUrl?: string;
  limit?: number;
  withComments?: boolean;
}

export function createJob(input: CreateJobInput): number {
  const validPlatforms = ['bilibili', 'douyin', 'kuaishou', 'xhs'];
  if (!validPlatforms.includes(input.platform)) {
    throw new Error(`不支持的平台: ${input.platform}，支持: ${validPlatforms.join(', ')}`);
  }
  const validCrawlTypes = ['search', 'detail', 'creator'];
  if (!validCrawlTypes.includes(input.crawlType)) {
    throw new Error(`不支持的采集类型: ${input.crawlType}，支持: ${validCrawlTypes.join(', ')}`);
  }

  const limit = Math.min(Math.max(input.limit || 5, 1), 20);

  let keyword = (input.keyword || '').trim();
  let targetUrl = (input.targetUrl || '').trim();
  let targetId = '';

  if (input.crawlType === 'search' && !keyword) {
    throw new Error('search 模式需要 keyword');
  }
  if (input.crawlType === 'detail' && !targetUrl) {
    throw new Error('detail 模式需要 targetUrl');
  }

  // Try to extract ID from URL
  if (targetUrl) {
    const parts = targetUrl.split('/').filter(Boolean);
    targetId = parts[parts.length - 1] || '';
  }

  const now = new Date().toISOString();
  const row = db
    .insert(videoAnalysisJobs)
    .values({
      platform: input.platform,
      crawlType: input.crawlType,
      keyword,
      targetUrl,
      targetId,
      status: 'pending',
      progress: 0,
      message: JSON.stringify([{ t: now, level: 'info', msg: '任务已创建' }]),
      resultCount: 0,
      error: '',
      createdAt: now,
      updatedAt: now,
      finishedAt: null,
    })
    .returning({ id: videoAnalysisJobs.id })
    .get();

  return row.id;
}

// ─── 3. 任务列表 ──────────────────────────────────────────────────────────────
export function listJobs(limit = 20) {
  const rows = db
    .select()
    .from(videoAnalysisJobs)
    .orderBy(desc(videoAnalysisJobs.createdAt))
    .limit(limit)
    .all();

  return rows.map(r => ({
    ...r,
    message: parseMessages(r.message),
  }));
}

function parseMessages(msg: string): any[] {
  try {
    const parsed = JSON.parse(msg);
    return Array.isArray(parsed) ? parsed.slice(-50) : [];
  } catch {
    return [];
  }
}

// ─── 4. 任务详情 ──────────────────────────────────────────────────────────────
export function getJobDetail(id: number) {
  const job = db.select().from(videoAnalysisJobs).where(eq(videoAnalysisJobs.id, id)).get();
  if (!job) return null;

  const items = db
    .select()
    .from(videoAnalysisItems)
    .where(eq(videoAnalysisItems.jobId, id))
    .orderBy(desc(videoAnalysisItems.createdAt))
    .all();

  const report = db
    .select()
    .from(videoAnalysisReports)
    .where(eq(videoAnalysisReports.jobId, id))
    .get();

  return {
    job: { ...job, message: parseMessages(job.message) },
    items: items.map(i => ({
      ...i,
      rawJson: parseJsonSafe(i.rawJson),
    })),
    report: report
      ? { ...report, sourcesJson: parseJsonSafe(report.sourcesJson) }
      : null,
  };
}

function parseJsonSafe(s: string) {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}

// ─── 5. 运行任务 ──────────────────────────────────────────────────────────────
export async function runJob(id: number): Promise<{ ok: boolean; error?: string }> {
  const job = db.select().from(videoAnalysisJobs).where(eq(videoAnalysisJobs.id, id)).get();
  if (!job) return { ok: false, error: '任务不存在' };
  if (job.status === 'running') return { ok: false, error: '任务正在运行中' };

  const baseUrl = getBaseUrl();
  if (!baseUrl || !isEnabled()) {
    return { ok: false, error: 'MediaCrawler 未配置' };
  }

  // 更新状态为 running
  updateJobStatus(id, 'running');
  addJobMessage(id, 'info', '任务开始执行');

  try {
    // 构造 MediaCrawler API 请求
    const mcPlatform = toMediaCrawlerPlatform(job.platform);
    let keywords = job.keyword || '';
    let specifiedIds = '';
    let creatorIds = '';

    if (job.crawlType === 'detail' && job.targetId) {
      specifiedIds = job.targetId;
    }
    if (job.crawlType === 'creator') {
      // For creator mode, if we have a target URL or ID
      if (job.targetId) {
        creatorIds = job.targetId;
      }
    }

    const body: Record<string, any> = {
      platform: mcPlatform,
      login_type: 'cookie',
      crawler_type: job.crawlType === 'creator' ? 'creator' : job.crawlType,
      keywords,
      specified_ids: specifiedIds,
      creator_ids: creatorIds,
      start_page: 1,
      enable_comments: true,
      enable_sub_comments: false,
      save_option: 'jsonl',        // 与 MediaCrawler 默认格式一致（jsonl）
      headless: true,
      max_notes_count: Math.max(job.limit || 10, 1),
      max_comments_count: 10,
    };

    // 注入 Bilibili cookie（关键！无 cookie 则搜索结果为默认推荐，非关键词相关）
    const biliCookies = getBiliCookies();
    if (biliCookies) {
      body.cookies = biliCookies;
      addJobMessage(id, 'info', '已注入 Bilibili cookie');
    } else {
      // 无 cookie 直接失败，不走无意义爬取
      updateJobStatus(id, 'failed');
      addJobMessage(id, 'error', '未配置 MEDIA_CRAWLER_BILI_COOKIES — 请先配置 Bilibili cookie 才能搜索，否则结果为空或不准确');
      return { ok: false, error: '未配置 Bilibili cookie，请联系管理员配置 MEDIA_CRAWLER_BILI_COOKIES 环境变量' };
    }

    addJobMessage(id, 'info', `调用 MediaCrawler: platform=${mcPlatform} type=${job.crawlType}`);

    // 调用 MediaCrawler API 启动爬虫
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 180000); // 3 min timeout

    const res = await fetch(`${baseUrl}/api/crawler/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const errText = await res.text();
      updateJobStatus(id, 'failed');
      addJobMessage(id, 'error', `MediaCrawler 启动失败: ${errText}`);
      return { ok: false, error: `MediaCrawler 启动失败: ${res.status}` };
    }

    addJobMessage(id, 'success', '爬虫已启动，等待完成...');

    // 轮询任务状态
    let attempts = 0;
    const maxAttempts = 60; // 60 * 5s = 5 分钟
    let finalStatus = 'idle';

    while (attempts < maxAttempts) {
      await sleep(5000);
      attempts++;

      try {
        const statusRes = await fetch(`${baseUrl}/api/crawler/status`);
        if (statusRes.ok) {
          const statusData = await statusRes.json();
          finalStatus = statusData.status || 'idle';

          addJobMessage(id, 'info', `采集状态: ${finalStatus} (第 ${attempts} 次轮询)`);

          if (finalStatus === 'idle' || finalStatus === 'error') {
            // 爬虫完成或出错
            break;
          }
        }
      } catch (e) {
        addJobMessage(id, 'warning', `轮询状态失败: ${String(e)}`);
      }
    }

    // 获取爬取结果（从 MediaCrawler 的 data files API）
    addJobMessage(id, 'info', '采集完成，获取结果...');
    await fetchAndSaveResults(id, job, baseUrl);

    updateJobStatus(id, 'success');
    addJobMessage(id, 'success', '任务完成');

    return { ok: true };
  } catch (err: any) {
    if (err.name === 'AbortError') {
      updateJobStatus(id, 'failed');
      addJobMessage(id, 'error', '任务超时（3分钟）');
      return { ok: false, error: '任务超时' };
    }
    updateJobStatus(id, 'failed');
    addJobMessage(id, 'error', `任务失败: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

// ─── 获取并保存 MediaCrawler 结果 ────────────────────────────────────────────
async function fetchAndSaveResults(jobId: number, job: any, baseUrl: string): Promise<void> {
  try {
    const mcPlatform = toMediaCrawlerPlatform(job.platform);

    // 列出 MediaCrawler 数据文件
    const filesRes = await fetch(`${baseUrl}/api/data/files?platform=${mcPlatform}`);
    if (!filesRes.ok) {
      addJobMessage(jobId, 'warning', '获取数据文件列表失败');
      return;
    }

    const filesData = await filesRes.json();
    const files: any[] = filesData.files || [];

    if (files.length === 0) {
      addJobMessage(jobId, 'warning', '未找到采集结果文件');
      return;
    }

    // 取最新的 JSON 文件（支持 .json 或 .jsonl）
    const latestFile = files[0];
    const fileModTime = latestFile.modified_at;
    const jobCreateTime = new Date(job.createdAt).getTime() / 1000;
    const isStale = fileModTime && jobCreateTime && fileModTime < jobCreateTime;

    if (isStale) {
      addJobMessage(jobId, 'warning', `结果文件 "${latestFile.path}" 修改时间早于任务创建时间，可能不是本次搜索结果`);
    }

    addJobMessage(jobId, 'info', `结果文件: ${latestFile.path} (${latestFile.record_count || '?'} 条${isStale ? ', ⚠️ 来自旧爬取' : ''})`);

    // 读取文件内容
    const contentRes = await fetch(`${baseUrl}/api/data/files/${latestFile.path}?preview=true&limit=50`);
    if (!contentRes.ok) {
      addJobMessage(jobId, 'warning', '读取结果文件失败');
      return;
    }

    const contentData = await contentRes.json();
    const items = Array.isArray(contentData.data) ? contentData.data : (contentData.data ? [contentData.data] : []);

    addJobMessage(jobId, 'info', `获取到 ${items.length} 条数据`);

    let savedCount = 0;
    for (const item of items) {
      try {
        const title = item.title || item.note_title || item.video_title || item.content?.slice(0, 100) || '';
        let itemType = 'video';
        if (mcPlatform === 'xhs') {
          itemType = 'note';
        }

        const rawJsonStr = JSON.stringify(item);

        await db.insert(videoAnalysisItems).values({
          jobId,
          platform: job.platform,
          itemType,
          sourceId: String(item.note_id || item.video_id || item.id || ''),
          title: String(title).slice(0, 500),
          authorName: String(item.author || item.author_name || item.nickname || item.user?.nickname || ''),
          publishTime: String(item.create_time || item.publish_time || item.created_at || ''),
          url: String(item.note_url || item.video_url || item.share_url || item.url || ''),
          content: String(item.content || item.desc || item.description || item.text || ''),
          rawJson: rawJsonStr,
          createdAt: new Date().toISOString(),
        });
        savedCount++;
      } catch (e) {
        // 单条失败不中断
      }
    }

    // 更新结果计数
    const countSqlite: any = sqlite;
    const countRow = countSqlite
      .prepare('SELECT COUNT(*) as cnt FROM video_analysis_items WHERE job_id = ?')
      .get(jobId);
    const cnt = countRow?.cnt || savedCount;

    db.update(videoAnalysisJobs)
      .set({ resultCount: cnt, updatedAt: new Date().toISOString() })
      .where(eq(videoAnalysisJobs.id, jobId))
      .run();

    addJobMessage(jobId, 'success', `已保存 ${cnt} 条数据${isStale ? '（⚠️ 来自旧爬取，请检查 Bilibili cookie 配置）' : ''}`);
  } catch (e) {
    addJobMessage(jobId, 'warning', `保存结果时出错: ${String(e)}`);
  }
}

// ─── 6. AI 分析 ──────────────────────────────────────────────────────────────
export async function analyzeJob(id: number): Promise<{ ok: boolean; markdown?: string; error?: string }> {
  const detail = getJobDetail(id);
  if (!detail) return { ok: false, error: '任务不存在' };
  if (detail.items.length === 0) return { ok: false, error: '没有采集数据，无法分析' };

  const aiBaseUrl = (process.env.AI_BASE_URL || '').trim();
  const aiApiKey = (process.env.AI_API_KEY || '').trim();
  const aiModel = (process.env.AI_MODEL || '').trim();

  if (!aiBaseUrl || !aiApiKey || !aiModel) {
    return { ok: false, error: 'AI 未配置' };
  }

  // 构建分析 prompt
  const itemsSummary = detail.items.slice(0, 20).map((item, i) => {
    return `[${i + 1}] 标题: ${item.title}
作者: ${item.authorName}
时间: ${item.publishTime}
内容: ${(item.content || '').slice(0, 500)}
URL: ${item.url}`;
  }).join('\n\n');

  const systemPrompt = `你是一个内容分析助手。基于采集到的视频/笔记/评论数据生成专业的 Markdown 分析报告。

**报告格式（Markdown）：**
# 视频分析报告
## 数据概览
## 内容主题总结
## 爆点/高频观点
## 评论情绪与用户反馈
## 竞品/账号观察
## 可借鉴点
## 风险与注意事项
## 建议行动

**要求：**
1. 基于实际数据，不要编造信息
2. 如果数据量不足，明确说明'数据有限，以下为初步分析'
3. 用中文输出
4. Markdown 格式`;
  const userPrompt = `以下是关于「${detail.job.keyword || detail.job.platform}」的采集数据（${detail.items.length} 条）：\n\n${itemsSummary}\n\n请生成分析报告。`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);
    const res = await fetch(`${aiBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${aiApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: aiModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.5,
        max_tokens: 4096,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) throw new Error(`AI API error: ${res.status}`);
    const data = await res.json();
    const markdown = data.choices?.[0]?.message?.content || 'AI 返回为空';

    const now = new Date().toISOString();

    // 检查是否已有报告
    const existing = db.select().from(videoAnalysisReports).where(eq(videoAnalysisReports.jobId, id)).get();
    if (existing) {
      db.update(videoAnalysisReports)
        .set({
          markdown,
          updatedAt: now,
        })
        .where(eq(videoAnalysisReports.jobId, id))
        .run();
    } else {
      db.insert(videoAnalysisReports).values({
        jobId: id,
        title: `「${detail.job.keyword || detail.job.platform}」分析报告`,
        markdown,
        sourcesJson: JSON.stringify(detail.items.slice(0, 20).map(i => i.id)),
        createdAt: now,
        updatedAt: now,
      }).run();
    }

    return { ok: true, markdown };
  } catch (err: any) {
    if (err.name === 'AbortError') return { ok: false, error: 'AI 分析超时（120s）' };
    return { ok: false, error: `AI 分析失败: ${err.message}` };
  }
}

// ─── 辅助函数 ─────────────────────────────────────────────────────────────────
function updateJobStatus(id: number, status: string) {
  db.update(videoAnalysisJobs)
    .set({
      status,
      updatedAt: new Date().toISOString(),
      ...(status === 'success' || status === 'failed' ? { finishedAt: new Date().toISOString() } : {}),
    })
    .where(eq(videoAnalysisJobs.id, id))
    .run();
}

function addJobMessage(id: number, level: string, msg: string) {
  const now = new Date().toISOString();
  const job = db.select({ message: videoAnalysisJobs.message }).from(videoAnalysisJobs).where(eq(videoAnalysisJobs.id, id)).get();
  let msgs: any[] = [];
  try {
    msgs = JSON.parse(job?.message || '[]');
    if (!Array.isArray(msgs)) msgs = [];
  } catch { msgs = []; }
  msgs.push({ t: now, level, msg });
  // Keep last 500
  if (msgs.length > 500) msgs = msgs.slice(-500);

  db.update(videoAnalysisJobs)
    .set({ message: JSON.stringify(msgs), updatedAt: now })
    .where(eq(videoAnalysisJobs.id, id))
    .run();
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
