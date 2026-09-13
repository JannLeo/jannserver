import { promises as fs } from 'fs';
import path from 'path';

// Override on deployments that keep the prompt mirror elsewhere.
export const CLONE_PATH = path.resolve(
  process.env.PROMPTS_ROOT || '/tmp/integration-workspace/asgeirtj_system_prompts_leaks',
);

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

function lexicallyInsideRoot(candidate: string): boolean {
  const relative = path.relative(CLONE_PATH, candidate);
  return relative !== '..'
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative);
}

async function resolvePromptPath(relativePath: string): Promise<string | null> {
  if (typeof relativePath !== 'string' || relativePath.length === 0 || relativePath.length > 1024) {
    return null;
  }
  if (relativePath.includes('\0') || path.isAbsolute(relativePath)) return null;

  const candidate = path.resolve(CLONE_PATH, relativePath);
  if (!lexicallyInsideRoot(candidate) || path.extname(candidate).toLowerCase() !== '.md') return null;

  // The visible prompt list only exposes the Anthropic mirror. Apply the same
  // restriction to direct reads instead of letting callers probe hidden files.
  const normalizedRelative = path.relative(CLONE_PATH, candidate).split(path.sep).join('/');
  if (!normalizedRelative.startsWith('Anthropic')) return null;

  try {
    const [realRoot, realCandidate] = await Promise.all([
      fs.realpath(CLONE_PATH),
      fs.realpath(candidate),
    ]);
    const realRelative = path.relative(realRoot, realCandidate);
    if (
      realRelative === '..'
      || realRelative.startsWith(`..${path.sep}`)
      || path.isAbsolute(realRelative)
    ) {
      return null;
    }
    return realCandidate;
  } catch {
    return null;
  }
}

export async function getPromptFiles(): Promise<PromptFile[]> {
  try {
    const entries = await fs.readdir(CLONE_PATH, { recursive: true, withFileTypes: true });
    const files = entries
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.md'))
      .map((entry) => {
        const fullPath = path.resolve(entry.parentPath || CLONE_PATH, entry.name);
        if (!lexicallyInsideRoot(fullPath)) return null;
        const relativePath = path.relative(CLONE_PATH, fullPath).split(path.sep).join('/');
        const { category, model } = categorizeFile(`/${relativePath}`);
        return {
          name: entry.name.replace(/\.md$/i, ''),
          path: relativePath,
          category,
          model,
        };
      })
      .filter((file): file is PromptFile => Boolean(file && file.path.startsWith('Anthropic')))
      .slice(0, 5000);
    return files;
  } catch {
    return [];
  }
}

export async function getPromptContent(relativePath: string): Promise<string | null> {
  try {
    const fullPath = await resolvePromptPath(relativePath);
    if (!fullPath) return null;
    const stat = await fs.stat(fullPath);
    if (!stat.isFile() || stat.size > 2 * 1024 * 1024) return null;
    return await fs.readFile(fullPath, 'utf-8');
  } catch {
    return null;
  }
}
