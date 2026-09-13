import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import bcrypt from "bcryptjs";
import { sqlite } from "./db/index";

export interface SessionData {
  userId?: number;
  username?: string;
  isLoggedIn?: boolean;
}

const DEV_SESSION_SECRET = "development-only-session-secret-change-me-123456";
const MIN_SESSION_SECRET_LENGTH = 32;

export function getSessionSecret(): string {
  const configured = process.env.SESSION_SECRET?.trim();
  if (configured && configured.length >= MIN_SESSION_SECRET_LENGTH) {
    return configured;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      `SESSION_SECRET must be configured and at least ${MIN_SESSION_SECRET_LENGTH} characters long in production`,
    );
  }

  return DEV_SESSION_SECRET;
}

export const sessionOptions = {
  password: getSessionSecret(),
  cookieName: "workspace_session",
  cookieOptions: {
    // Tailscale/HTTP 环境下设 ALLOW_HTTP_COOKIES=true，否则浏览器不存储 session cookie
    secure: process.env.NODE_ENV === "production" && process.env.ALLOW_HTTP_COOKIES !== "true",
    httpOnly: true,
    sameSite: "lax" as const,
    maxAge: 7 * 24 * 60 * 60,
  },
};

export async function getSession() {
  const cookieStore = cookies();
  return getIronSession<SessionData>(cookieStore, sessionOptions);
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

function allowedHosts(): string[] {
  return (process.env.ALLOWED_HOSTS || "localhost,127.0.0.1")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
}

export function validateOrigin(headers: Headers): boolean {
  const source = headers.get("origin") || headers.get("referer");
  // Non-browser/CLI callers do not necessarily send Origin or Referer. They are
  // still protected by session/API authentication at the route layer.
  if (!source) return true;

  try {
    const hostname = new URL(source).hostname.toLowerCase();
    return allowedHosts().some(
      (host) => hostname === host || hostname.endsWith(`.${host}`),
    );
  } catch {
    return false;
  }
}

function positiveInt(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(value || "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function getRateLimitConfig() {
  return {
    windowMs: positiveInt(process.env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000, 1_000, 24 * 60 * 60 * 1000),
    maxAttempts: positiveInt(process.env.RATE_LIMIT_MAX_ATTEMPTS, 5, 1, 100),
  };
}

// Login rate limiting is backed by SQLite so it works across process restarts.
export async function checkRateLimit(key: string): Promise<{ allowed: boolean; remaining: number }> {
  const { windowMs, maxAttempts } = getRateLimitConfig();
  const windowSeconds = Math.max(1, Math.ceil(windowMs / 1000));
  const modifier = `-${windowSeconds} seconds`;

  sqlite.prepare(
    "DELETE FROM login_failures WHERE attempt_at < datetime('now', ?)",
  ).run(modifier);

  const result = sqlite.prepare(
    "SELECT COUNT(*) as cnt FROM login_failures WHERE username = ? AND attempt_at > datetime('now', ?)",
  ).get(key, modifier) as { cnt: number } | undefined;

  const count = result?.cnt ?? 0;
  return {
    allowed: count < maxAttempts,
    remaining: Math.max(0, maxAttempts - count),
  };
}

export async function recordFailure(key: string): Promise<void> {
  sqlite.prepare(
    "INSERT INTO login_failures (username, attempt_at) VALUES (?, datetime('now'))",
  ).run(key);
}

export async function clearFailures(...keys: string[]): Promise<void> {
  const uniqueKeys = [...new Set(keys.filter(Boolean))];
  if (uniqueKeys.length === 0) return;

  const stmt = sqlite.prepare("DELETE FROM login_failures WHERE username = ?");
  const clearMany = sqlite.transaction((values: string[]) => {
    for (const value of values) stmt.run(value);
  });
  clearMany(uniqueKeys);
}
