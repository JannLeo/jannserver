const DEFAULT_ALLOWED_HOSTS = 'localhost,127.0.0.1,::1';

function normalizeHostname(hostname: string): string {
  const trimmed = hostname.trim().toLowerCase();
  return trimmed.startsWith('[') && trimmed.endsWith(']')
    ? trimmed.slice(1, -1)
    : trimmed;
}

export function allowedHostPatterns(value = process.env.ALLOWED_HOSTS): string[] {
  return (value || DEFAULT_ALLOWED_HOSTS)
    .split(',')
    .map((host) => normalizeHostname(host))
    .filter(Boolean);
}

export function isAllowedHostname(hostname: string, value = process.env.ALLOWED_HOSTS): boolean {
  const candidate = normalizeHostname(hostname);
  if (!candidate) return false;

  return allowedHostPatterns(value).some((pattern) => {
    if (pattern.startsWith('*.')) {
      const suffix = pattern.slice(2);
      return Boolean(suffix) && candidate !== suffix && candidate.endsWith(`.${suffix}`);
    }
    return candidate === pattern;
  });
}

/** Parse the client-visible HTTP Host header into a hostname without its port. */
export function hostnameFromHostHeader(value: string | null): string | null {
  const host = value?.trim() || '';
  if (!host || host.length > 255) return null;

  // Host must be an authority, not a URL/path/userinfo/query. Reject these
  // characters instead of relying on URL normalization to reinterpret them.
  if (/[\s/@\\?#]/.test(host)) return null;

  try {
    const parsed = new URL(`http://${host}`);
    if (parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
      return null;
    }
    const hostname = normalizeHostname(parsed.hostname);
    return hostname || null;
  } catch {
    return null;
  }
}
