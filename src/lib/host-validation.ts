const DEFAULT_ALLOWED_HOSTS = 'localhost,127.0.0.1,::1';

export function allowedHostPatterns(value = process.env.ALLOWED_HOSTS): string[] {
  return (value || DEFAULT_ALLOWED_HOSTS)
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
}

export function isAllowedHostname(hostname: string, value = process.env.ALLOWED_HOSTS): boolean {
  const candidate = hostname.trim().toLowerCase();
  if (!candidate) return false;

  return allowedHostPatterns(value).some((pattern) => {
    if (pattern.startsWith('*.')) {
      const suffix = pattern.slice(2);
      return Boolean(suffix) && candidate !== suffix && candidate.endsWith(`.${suffix}`);
    }
    return candidate === pattern;
  });
}
