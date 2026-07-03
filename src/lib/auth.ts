import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import bcrypt from "bcryptjs";
import { sqlite } from "./db/index";

export interface SessionData {
  userId?: number;
  username?: string;
  isLoggedIn?: boolean;
}

export const sessionOptions = {
  password: process.env.SESSION_SECRET || "complex_password_at_least_32_characters_long!",
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

export function validateOrigin(headers: Headers): boolean {
  const allowed = (process.env.ALLOWED_HOSTS || "localhost,127.0.0.1")
    .split(",")
    .map(h => h.trim());
  const origin = headers.get("origin") || "";
  const referer = headers.get("referer") || "";
  for (const host of allowed) {
    if (origin.includes(host) || referer.includes(host)) return true;
  }
  return false;
}

// Rate limiting: 5 failures per 15 minutes per username/IP
export async function checkRateLimit(key: string): Promise<{ allowed: boolean; remaining: number }> {
  const window = 15 * 60;
  const max = 5;
  const cutoff = Math.floor(Date.now() / 1000) - window;
  sqlite.exec(`DELETE FROM login_failures WHERE attempt_at < datetime('now', '-${window} seconds')`);
  const result = sqlite.prepare(
    "SELECT COUNT(*) as cnt FROM login_failures WHERE username = ? AND attempt_at > datetime('now', '-${window} seconds')"
  ).get(key) as { cnt: number } | undefined;
  const count = result?.cnt ?? 0;
  return { allowed: count < max, remaining: Math.max(0, max - count) };
}

export async function recordFailure(key: string): Promise<void> {
  sqlite.prepare("INSERT INTO login_failures (username, attempt_at) VALUES (?, datetime('now'))").run(key);
}