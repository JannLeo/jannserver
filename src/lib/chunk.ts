// @ts-nocheck
/**
 * Markdown 分块器：按 ## 标题优先分割，段落次之。
 * 目标块大小 ~800 字，相邻块重叠 100 字以保留上下文。
 */

export interface Chunk {
  text: string;
  idx: number;
}

const DEFAULT_TARGET = 800;
const DEFAULT_OVERLAP = 100;

/**
 * 把 markdown 切成多个 chunk。
 * 策略：
 * 1. 先按 ## 标题切一级块（保留标题行）
 * 2. 一级块 > targetSize*1.5 → 按 \n\n 段落再切
 * 3. 一级块 < targetSize*0.3 且不是最后一块 → 与下一块合并
 * 4. 最终块按 idx 编号
 */
export function chunkMarkdown(
  content: string,
  targetSize: number = DEFAULT_TARGET,
  overlap: number = DEFAULT_OVERLAP
): Chunk[] {
  if (!content || !content.trim()) return [];

  // 1. 按 ## 标题切（保留标题）
  const sections = splitByHeading(content);

  // 2. 段落再切 + 合并小段
  const merged: string[] = [];
  for (const section of sections) {
    if (section.length > targetSize * 1.5) {
      const paras = splitByParagraph(section, targetSize);
      for (const p of paras) {
        if (p.length < targetSize * 0.3 && merged.length > 0) {
          merged[merged.length - 1] += '\n\n' + p;
        } else {
          merged.push(p);
        }
      }
    } else if (section.length < targetSize * 0.3 && merged.length > 0) {
      merged[merged.length - 1] += '\n\n' + section;
    } else {
      merged.push(section);
    }
  }

  // 3. 加 overlap（从上一块末尾取 overlap/2 字符接在下一块前面）
  const chunks: Chunk[] = [];
  const halfOverlap = Math.floor(overlap / 2);
  for (let i = 0; i < merged.length; i++) {
    let text = merged[i];
    if (i > 0 && halfOverlap > 0) {
      const prev = merged[i - 1];
      const prefix = prev.length > halfOverlap ? prev.slice(-halfOverlap) : prev;
      text = prefix + '\n\n' + text;
    }
    chunks.push({ text: text.trim(), idx: i });
  }

  return chunks.filter(c => c.text.length > 0);
}

/**
 * 按 ## 标题切，标题行保留在对应块的开头。
 * 第一个块（标题之前的内容，通常是 frontmatter 或概述）单独成块。
 */
function splitByHeading(content: string): string[] {
  const lines = content.split('\n');
  const sections: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    if (/^##\s+/.test(line)) {
      // 新标题：把累积的 current 推入
      if (current.length > 0) {
        sections.push(current.join('\n'));
      }
      current = [line];
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) sections.push(current.join('\n'));

  return sections.map(s => s.trim()).filter(s => s.length > 0);
}

/**
 * 把长文本按段落（\n\n）切成不超过 maxLen 的块。
 * 如果单个段落 > maxLen，硬切。
 */
function splitByParagraph(text: string, maxLen: number): string[] {
  const paras = text.split(/\n\n+/);
  const result: string[] = [];
  let buf = '';

  for (const para of paras) {
    if (para.length > maxLen) {
      // 先把 buf 推入
      if (buf) { result.push(buf); buf = ''; }
      // 硬切大段落
      for (let i = 0; i < para.length; i += maxLen) {
        result.push(para.slice(i, i + maxLen));
      }
    } else if ((buf + '\n\n' + para).length > maxLen) {
      if (buf) result.push(buf);
      buf = para;
    } else {
      buf = buf ? buf + '\n\n' + para : para;
    }
  }
  if (buf) result.push(buf);

  return result;
}
