// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/index';
import { novels, novelChapters, novelVolumes } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const AI_BASE_URL = (process.env.AI_BASE_URL || '').trim();
const AI_API_KEY = (process.env.AI_API_KEY || '').trim();
const AI_MODEL = (process.env.AI_MODEL || '').trim();

function buildPrompt(phase: string, novel: any, body: any): string {
  switch (phase) {
    case 'setup': {
      const { genre, existingWorld, existingCharacter } = body;
      return `你是一位经验丰富的网络小说世界观架构师和角色设计师。请为一部 **${genre || '都市玄幻'}** 小说设计完整的世界观和角色体系。

## 已知信息
- 题材：${genre || '待定'}
- 已有世界观：${existingWorld || '无'}
- 已有角色：${existingCharacter || '无'}

## 输出要求
请按以下结构输出（JSON 格式，markdown code fence 内）：

\`\`\`json
{
  "world_setting": "## 世界观设定\\n\\n[详细的世界观设定，包括力量体系、社会结构、地理环境等]",
  "genre_setting": "## 题材风格\\n\\n[题材特点、目标读者群、风格定位、文风建议]",
  "character_settings": [
    {
      "name": "角色名",
      "role": "主角/配角/反派",
      "age": "年龄",
      "appearance": "外貌特征",
      "personality": "性格特点",
      "background": "背景故事",
      "motivation": "核心动机"
    }
  ]
}
\`\`\`
只输出 JSON，不要额外文字。`;
    }

    case 'outline': {
      const { volumeTitle, volumeSynopsis, chapterCount } = body;
      return `你是一位资深网络小说策划师。请为以下卷目设计详细章纲。

## 卷目信息
- 卷名：${volumeTitle || '第1卷'}
- 卷简介：${volumeSynopsis || '待定'}
- 要求章节数：${chapterCount || 10} 章

## 输出要求
请输出 10-15 章的章纲，每章包含章节序号、标题、摘要（2-3句话）。

格式（JSON）：
\`\`\`json
{
  "outline": [
    {"chapterNumber": 1, "title": "第1章 标题", "summary": "本章讲述..."},
    ...
  ]
}
\`\`\`
只输出 JSON，不要额外文字。`;
    }

    case 'chapter_draft': {
      const { chapterTitle, chapterOutline, previousSummary, genre, wordCount } = body;
      return `你是一位顶尖网络小说作家。请根据以下章纲撰写小说正文。

## 章节信息
- 章节标题：${chapterTitle || '无标题'}
- 章纲：${chapterOutline || '无'}
- 上章结尾：${previousSummary || '无'}
- 题材：${genre || '都市'}
- 目标字数：${wordCount || 3000} 字

## 写作要求
1. 严格遵循章纲，但不拘泥于章纲，在章纲基础上适度扩展细节
2. 描写生动，对话自然，情节推进流畅
3. 开头要有张力，能抓住读者
4. 禁止在正文中加入作者注释或说明
5. 中文写作，文学性强

## 输出
直接输出小说正文（纯文本，不是 JSON，不需要 code fence）。`;
    }

    case 'chapter_anti_ai': {
      const { content, genre } = body;
      return `你是一位专业的网文编辑，精通去AI味（anti-AI）润色。请对以下小说章节进行深度修改，去除AI写作痕迹，使其更接近真人写作风格。

## 原文
${content}

## 题材：${genre || '都市'}

## 去AI味修改要求：
1. 打乱重复句式，避免相同的句式结构反复出现
2. 增加口语化表达和方言词汇
3. 缩短过长的复合句，多用短句
4. 添加真实的生活细节和情感波动
5. 保留原文的情节和人物，只修改表达方式
6. 不要添加新的情节内容

## 输出
直接输出修改后的完整正文。`;
    }

    case 'review': {
      const { content, genre, worldSetting } = body;
      return `你是小说评审专家。请对以下小说章节进行深度评审。

## 章节正文
${content}

## 题材：${genre || '都市'}
## 世界观背景：${worldSetting || '无'}

## 评审维度（JSON格式）：
- plot_consistency: 情节一致性（0-100）及问题说明
- character_continuity: 人物连贯性（0-100）及问题说明
- pacing: 节奏把控（0-100）及建议
- dialogue_quality: 对话质量（0-100）及建议
- prose_style: 文笔文风（0-100）及建议
- overall_score: 综合评分（0-100）
- strengths: 主要优点（字符串数组）
- issues: 主要问题（字符串数组）
- suggestions: 修改建议（字符串数组）

格式（JSON，markdown code fence 内）：
\`\`\`json
{
  "plot_consistency": {"score": 80, "comment": "..."},
  "overall_score": 72,
  "strengths": ["...", "..."],
  "issues": ["...", "..."],
  "suggestions": ["...", "..."]
}
\`\`\``;
    }

    default:
      return '请生成内容。';
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!AI_BASE_URL || !AI_API_KEY || !AI_MODEL) {
    return NextResponse.json({ configured: false, error: 'AI 未配置（请配置 AI_BASE_URL / AI_API_KEY / AI_MODEL）' }, { status: 200 });
  }

  try {
    const body = await req.json();
    const { phase, options } = body;
    const novel = db.select().from(novels).where(eq(novels.id, params.id)).get();
    if (!novel) return NextResponse.json({ error: '小说不存在' }, { status: 404 });

    const prompt = buildPrompt(phase, novel, options || {});

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 150_000);

    let rawContent = '';
    try {
      const res = await fetch(`${AI_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${AI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: AI_MODEL,
          messages: [
            { role: 'system', content: '你是一位专业的内容生成助手。' },
            { role: 'user', content: prompt },
          ],
          temperature: 0.7,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) return NextResponse.json({ configured: true, error: `AI API 返回 ${res.status}` }, { status: 502 });
      const data = await res.json();
      rawContent = data.choices?.[0]?.message?.content || '';
    } catch (err: any) {
      clearTimeout(timeout);
      if (err.name === 'AbortError') return NextResponse.json({ configured: true, error: 'AI 请求超时（150s）' }, { status: 504 });
      return NextResponse.json({ configured: true, error: `请求失败: ${err.message}` }, { status: 502 });
    }

    if (!rawContent.trim()) return NextResponse.json({ configured: true, error: 'AI 返回为空' }, { status: 502 });

    // Auto-save based on phase
    if (phase === 'setup' && options?.saveWorld) {
      db.update(novels).set({
        worldSetting: options.worldSetting || '',
        genreSetting: options.genreSetting || '',
        characterSettings: options.characterSettings || '',
        updatedAt: new Date().toISOString(),
      }).where(eq(novels.id, params.id)).run();
    }

    return NextResponse.json({ configured: true, content: rawContent, phase });
  } catch (err: any) {
    return NextResponse.json({ error: `生成失败: ${err.message}` }, { status: 500 });
  }
}