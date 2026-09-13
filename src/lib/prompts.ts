import { promises as fs } from 'fs';
import path from 'path';

// 路径配置
export const CLONE_PATH = '/tmp/integration-workspace/asgeirtj_system_prompts_leaks';

export interface PromptFile {
  name: string;
  path: string;
  category: string;
  model?: string;
}

export function categorizeFile(filePath: string): { category: string; model?: string } {
  if (filePath.includes('/Official/')) return { category: 'official', model: extractModel(filePath) };
  if (filePath.includes('/Claude Code/')) return { category: 'claude-code', model: extractModel(filePath) };
  if (filePath.includes('/claude-')) return { category: 'claude', model: extractModel(filePath) };
  return { category: 'other' };
}

export function extractModel(filePath: string): string {
  const match = filePath.match(/claude[_-]([\w.-]+)\.md/);
  if (match) return match[1];
  const nameMatch = filePath.match(/\/([^/]+)\.md$/);
  return nameMatch ? nameMatch[1] : 'unknown';
}

export function formatDate(filePath: string): string {
  const dateMatch = filePath.match(/(\d{4}-\d{2}-\d{2})/);
  if (dateMatch) {
    const date = new Date(dateMatch[1]);
    return date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' });
  }
  return '未知日期';
}

export function getModelIcon(model: string): string {
  if (model.includes('opus')) return '🔵';
  if (model.includes('sonnet')) return '🟢';
  if (model.includes('haiku')) return '🟡';
  if (model.includes('fable')) return '🟣';
  if (model.includes('claude-code')) return '💻';
  return '📄';
}

export const CATEGORY_NAMES: Record<string, string> = {
  official: '📢 官方发布',
  'claude-code': '💻 Claude Code',
  claude: '🤖 Claude 模型',
  other: '📁 其他',
};

export async function getPromptFiles(): Promise<PromptFile[]> {
  try {
    const entries = await fs.readdir(CLONE_PATH, { recursive: true, withFileTypes: true });
    const files = entries
      .filter(entry => entry.isFile() && entry.name.endsWith('.md'))
      .map(entry => {
        const fullPath = path.join(entry.parentPath || CLONE_PATH, entry.name);
        const relativePath = path.relative(CLONE_PATH, fullPath);
        const { category, model } = categorizeFile(relativePath);
        return {
          name: entry.name.replace('.md', ''),
          path: relativePath,
          category,
          model,
        };
      })
      .filter(f => f.path.startsWith('Anthropic'));
    return files;
  } catch {
    return [];
  }
}

export async function getPromptContent(relativePath: string): Promise<string | null> {
  try {
    const fullPath = path.join(CLONE_PATH, relativePath);
    const content = await fs.readFile(fullPath, 'utf-8');
    return content;
  } catch {
    return null;
  }
}