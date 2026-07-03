/**
 * Project Brain profile 配置（服务端与客户端共用）
 *
 * profiles:
 *   docs   — 纯文档 repo（只有 markdown/doc），只允许 overview + commits
 *   code   — 纯代码 repo，允许全部 4 个编译模式
 *   mixed  — 混合 repo（代码 + 文档），允许 overview + modules + commits
 */

export type RepoProfile = 'docs' | 'code' | 'mixed';

export const REPO_PROFILES: Record<string, RepoProfile> = {
  'summary-for-work': 'docs',
  worldquant: 'mixed',
  teach: 'code',
};

export const DEFAULT_PROFILE: RepoProfile = 'code';

/** 每个 profile 允许的编译模式 */
export const PROFILE_ALLOWED_MODES: Record<RepoProfile, string[]> = {
  docs: ['overview', 'commits'],
  mixed: ['overview', 'modules', 'commits'],
  code: ['overview', 'modules', 'configs', 'commits'],
};

export function getRepoProfile(repoName: string): RepoProfile {
  return REPO_PROFILES[repoName] ?? DEFAULT_PROFILE;
}

export function getAllowedModes(repoName: string): string[] {
  const profile = getRepoProfile(repoName);
  return PROFILE_ALLOWED_MODES[profile];
}