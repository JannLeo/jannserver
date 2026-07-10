#!/usr/bin/env node
/**
 * scripts/integration-agent.js
 * 两阶段 AI 仓库整合
 *
 * Phase 1: 克隆 + 轻量分析 → 写报告
 * Phase 2: 本地 Qwen 生成完整 Next.js 页面代码 → 写入工作台 → 构建验证
 *
 * 改进 (2026-07-10):
 * - AI 不再需要精确 file: 前缀，直接从 ```tsx 提取代码
 * - 强制使用本地 llama-server (http://127.0.0.1:10000) 而非外网
 * - 禁用 thinking，避免 content 为空
 * - 删除代理环境变量避免 git/Node 走代理
 */
const Database = require('better-sqlite3');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');

// 清理所有代理环境变量
delete process.env.HTTPS_PROXY; delete process.env.HTTP_PROXY;
delete process.env.https_proxy; delete process.env.http_proxy;
delete process.env.no_proxy; delete process.env.NO_PROXY;

const AI_BASE = 'http://127.0.0.1:10000';
const AI_MODEL = 'qwen3.6-35b-a3b';
const DB_PATH = path.resolve(__dirname, '../data/app.db');
const WORKSPACE_DIR = path.resolve(__dirname, '..');

function log(msg) { console.log(`[${new Date().toISOString().slice(11,19)}] ${msg}`); }

async function aiChat(prompt, maxTokens = 4000) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: AI_MODEL,
      messages: [
        { role: 'system', content: '你是 Jann 的 Next.js 全栈助手。直接输出代码，不要思考过程，不要说明文字。' },
        { role: 'user', content: prompt }
      ],
      max_tokens: Math.min(maxTokens, 12000),
      temperature: 0.1,
      stream: false,
      chat_template_kwargs: { enable_thinking: false },
    });
    const url = new URL(`${AI_BASE}/v1/chat/completions`);
    const req = (url.protocol === 'https:' ? https : http).request({
      hostname: url.hostname, port: url.port, path: url.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer not-needed' },
    }, res => {
      let raw = '';
      res.on('data', c => { raw += c.toString(); });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(raw);
          let content = parsed.choices?.[0]?.message?.content || '';
          if (!content.trim()) content = parsed.choices?.[0]?.message?.reasoning_content || '';
          if (!content.trim()) { reject(new Error('empty response')); return; }
          resolve(content);
        } catch (e) { reject(new Error(`parse: ${e.message}`)); }
      });
    });
    req.on('error', e => reject(e));
    req.setTimeout(240000, () => { req.destroy(); reject(new Error('timeout 240s')); });
    req.write(body); req.end();
  });
}

function markStatus(taskId, status) {
  try {
    const db = new Database(DB_PATH);
    if (status === 'done') db.prepare("UPDATE tasks SET status='done',completed_at=datetime('now') WHERE id=?").run(taskId);
    else db.prepare("UPDATE tasks SET status=? WHERE id=?").run(status, taskId);
    db.close();
  } catch (e) { log(`markStatus: ${e.message}`); }
}

/**
 * 从 AI 输出中提取代码块
 * 支持:
 * 1. ```file:path\ncode\n```
 * 2. ```tsx 或 ```typescript\ncode\n``` (在路径上下文线索下)
 */
function extractCode(aiOutput, defaultPath) {
  const files = [];

  // 格式 1: 明确 file: 前缀
  const re1 = /```file:([^\s\n]+)\n([\s\S]*?)```/g;
  let m;
  while ((m = re1.exec(aiOutput)) !== null) {
    files.push({ path: m[1].trim(), content: m[2].trim() });
  }

  // 格式 2: 第一个 ```tsx 或 ```typescript 块 → 写入 defaultPath
  if (files.length === 0) {
    const codeMatch = aiOutput.match(/```(?:tsx|typescript|jsx|javascript)\n([\s\S]*?)```/);
    if (codeMatch) {
      files.push({ path: defaultPath, content: codeMatch[1].trim() });
    }
  }

  return files;
}

function writeCodeFiles(files) {
  let ok = 0;
  for (const { path: fp, content } of files) {
    if (!fp.startsWith('src/app/') || fp.includes('..')) {
      log(`  ⚠️ 跳过不安全路径: ${fp}`);
      continue;
    }
    try {
      const abs = path.join(WORKSPACE_DIR, fp);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, content, 'utf8');
      log(`  ✅ 写入 ${fp} (${content.length} 字符)`);
      ok++;
    } catch (e) { log(`  ❌ ${fp}: ${e.message}`); }
  }
  return ok;
}

function runBuild() {
  try {
    log('  npm run build...');
    execSync('npm run build', { cwd: WORKSPACE_DIR, stdio: 'pipe', timeout: 180000 });
    return true;
  } catch (e) {
    const msg = e.stdout ? e.stdout.toString().slice(-500) : e.message.slice(0, 200);
    log(`  ⚠️ build failed: ${msg}`);
    return false;
  }
}

function restartPM2() {
  try {
    execSync('npx pm2 restart personal-workspace', { stdio: 'pipe', timeout: 30000 });
    log('  PM2 重启完成');
    return true;
  } catch (e) { log(`  ⚠️ pm2 restart: ${e.message}`); return false; }
}

/**
 * 将新页面添加到侧边栏的 navItems 中
 * 找到 `// ── AI 整合仓库` 行，在其后插入新条目
 */
function addToSidebar(safeName, emoji, label, tooltip) {
  const sidebarPath = path.join(WORKSPACE_DIR, 'src/components/Sidebar.tsx');
  if (!fs.existsSync(sidebarPath)) return;
  const content = fs.readFileSync(sidebarPath, 'utf8');
  // 检查是否已存在
  if (content.includes(`'/${safeName}'`)) return;
  // 找到 integratedNavItems 数组定义，在其 ] ; 前插入
  const marker = '// ── AI 整合仓库（由 integration-agent.js 动态写入） ──';
  const arrStart = content.indexOf(marker);
  if (arrStart === -1) return;
  const closeIdx = content.indexOf('];', arrStart);
  if (closeIdx === -1) return;
  const newEntry = `  ['/${safeName}', '${emoji}', '${label}', '${tooltip}'],\n`;
  const updated = content.slice(0, closeIdx) + newEntry + content.slice(closeIdx);
  fs.writeFileSync(sidebarPath, updated, 'utf8');
  log(`  ✅ 侧边栏已添加：/${safeName}`);
}

async function integrate(task) {
  const { id: taskId, title, description } = task;
  const repoName = title.replace('🤖 整合: ', '').trim();
  const urlMatch = (description || '').match(/https:\/\/github\.com\/[^\s*]+/);
  const repoUrl = urlMatch ? urlMatch[0] : `https://github.com/${repoName}`;
  const safeName = repoName.replace(/[^a-zA-Z0-9]/g, '_');
  const pagePath = `src/app/${safeName}/page.tsx`;
  const REPOS_DIR = path.resolve(WORKSPACE_DIR, 'repos');
  const CLONE_DIR = path.join(REPOS_DIR, safeName);
  fs.mkdirSync(REPOS_DIR, { recursive: true });

  log(`开始整合: ${repoName}`);

  try {
    // ── Clone ──────────────────────────────────────────────────────────
    if (!fs.existsSync(CLONE_DIR)) {
      try {
        execSync(`git -c http.proxy= -c https.proxy= clone --depth 1 "${repoUrl}" "${CLONE_DIR}"`, { timeout: 60000, stdio: 'pipe' });
      } catch (e) {
        log(`  clone 失败: ${e.message.slice(0, 200)}`);
        throw e;
      }
    }
    log(`  ✓ 克隆完成`);

    // ── 读取仓库元数据 ─────────────────────────────────────────────────
    let repoFiles = '';
    try { repoFiles = execSync(`find "${CLONE_DIR}" -maxdepth 3 -type f | grep -v ".git" | head -30`, { encoding: 'utf8', timeout: 10000 }); } catch {}
    let readme = '';
    try { readme = execSync(`head -40 "${CLONE_DIR}/README.md" 2>/dev/null || head -40 "${CLONE_DIR}/readme.md" 2>/dev/null || echo ""`, { encoding: 'utf8', timeout: 10000 }); } catch {}

    // ── Phase 1: AI 分析 ─────────────────────────────────────────────
    const analysisPrompt = `仓库: ${repoName}
文件列表:
${(repoFiles || '').slice(0, 1000)}
README:
${(readme || '').slice(0, 2000)}

用 200 字以内简要说明这个仓库的核心功能，以及能否整合到 Next.js 工作台。
最后回答 "适合整合" 或 "不适合整合"。`;

    log('Phase 1: AI 分析...');
    let analysis = '';
    try {
      analysis = await aiChat(analysisPrompt, 1500);
      log(`  分析 ${analysis.length} 字符`);
    } catch (e) {
      log(`  分析失败: ${e.message}`);
      analysis = '(分析失败)';
    }

    // 写报告
    const reportFile = path.join(WORKSPACE_DIR, `INTEGRATION_REPORT_${safeName}.md`);
    fs.writeFileSync(reportFile, `# ${repoName}\n\n## 分析\n${analysis}\n\n时间: ${new Date().toISOString()}\n`, 'utf8');

    if (analysis.includes('不适合整合') && !analysis.includes('适合整合')) {
      log('  仓库不适合整合');
      markStatus(taskId, 'done');
      return;
    }

    // ── Phase 2: 生成完整页面代码 ─────────────────────────────────────
    // 可用的工作台组件（禁止导入其他组件）
const AVAILABLE_CMPS = `可导入的组件:
- NavBar from '@/components/NavBar' (导航栏)
- app-card / app-button-primary / app-input (CSS class)
- Tailwind CSS

禁止导入: @/components/ui/*, lucide-react, @radix-ui/*, framer-motion`;

    const codePrompt = `为 ${repoName} 生成一个 Next.js 14 页面。

仓库:
- 文件: ${(repoFiles || '').slice(0, 600)}
- README: ${(readme || '').slice(0, 1500)}

${AVAILABLE_CMPS}

要求：
- 仅用 Tailwind CSS + 基本 div/span/h1/h2
- 导入 NavBar from '@/components/NavBar'
- 完整代码（所有 import）
- 不用 lucide-react，用 emoji
- 在页面底部加一行：<a href="/integrated/${safeName}" className="text-teal-600 text-xs">📂 查看仓库源码 /integrated/${safeName}</a>
- 直接输出代码块：`;

    log('Phase 2: AI 生成代码...');
    let codeResult = '';
    try {
      codeResult = await aiChat(codePrompt, 6000);
      log(`  代码 ${codeResult.length} 字符`);
    } catch (e) {
      log(`  代码生成失败: ${e.message}`);
      markStatus(taskId, 'done');
      return;
    }

    // 提取代码
    const files = extractCode(codeResult, pagePath);
    if (files.length === 0) {
      log('  ⚠️ 未提取到代码，保存原始到 .md');
      const planFile = path.join(WORKSPACE_DIR, `INTEGRATION_DRAFT_${safeName}.md`);
      fs.writeFileSync(planFile, codeResult, 'utf8');
    } else {
      writeCodeFiles(files);
    }

    // 写完整报告
    fs.writeFileSync(reportFile, `# ${repoName}

## 分析
${analysis}

## 代码位置
${CLONE_DIR}

## 生成的页面
${codeResult}

时间: ${new Date().toISOString()}
`, 'utf8');

    // ── 构建验证 ─────────────────────────────────────────────────────
    if (fs.existsSync(path.join(WORKSPACE_DIR, pagePath))) {
      // 先加到侧边栏（会在本次构建中一起编译）
      addToSidebar(safeName, '📦', repoName.replace(/.*\//, ''), `${repoName} 整合`);
      log('构建验证...');
      const buildOk = runBuild();
      if (buildOk) {
        restartPM2();
        log(`✅ ${repoName} 完成（页面已部署）`);
        markStatus(taskId, 'done');
      } else {
        log('⚠️ 构建失败，任务保留等下次修复');
      }
    } else {
      log('⚠️ 页面文件未生成，任务完成但未实际部署');
      markStatus(taskId, 'done');
    }

  } catch (e) {
    log(`整合出错: ${e.message.slice(0, 200)}`);
    // 任务保持 in_progress 等下次 cron 重试
  }
}

async function main() {
  const args = process.argv.slice(2);
  let taskId = args[0] || null;
  let db;

  if (taskId) {
    db = new Database(DB_PATH, { readonly: true });
    const task = db.prepare('SELECT * FROM tasks WHERE id=?').get(taskId);
    db.close();
    if (task) { markStatus(taskId, 'in_progress'); await integrate(task); }
    else log(`任务不存在: ${taskId}`);
    return;
  }

  if (!fs.existsSync(DB_PATH)) { log('DB not found'); return; }
  db = new Database(DB_PATH, { readonly: true });
  const task = db.prepare(`SELECT id,title,description,priority,tags FROM tasks WHERE status IN ('todo','in_progress') AND source='ai' AND tags LIKE '%integration%' ORDER BY created_at ASC LIMIT 1`).get();
  db.close();

  if (!task) { log('没有待处理任务'); return; }
  log(`处理任务: ${task.title}`);
  markStatus(task.id, 'in_progress');
  await integrate(task);
}

main().catch(e => log(`Fatal: ${e.message}`));