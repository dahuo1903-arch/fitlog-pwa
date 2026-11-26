import crypto from "node:crypto";
import { DEFAULT_USER_ID } from "@/lib/daily-log";

export const SESSION_COOKIE_NAME = "fitlog_session";
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 天

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_WINDOW_MS = 60_000;

interface RateLimitEntry {
  count: number;
  lockedUntil: number;
}

const globalForRateLimit = globalThis as unknown as {
  fitlogPinAttempts?: Map<string, RateLimitEntry>;
};

const attemptStore =
  globalForRateLimit.fitlogPinAttempts ?? new Map<string, RateLimitEntry>();
globalForRateLimit.fitlogPinAttempts = attemptStore;

function getConfiguredPin(): string {
  return process.env.APP_ACCESS_PIN?.trim() || "";
}

export function isAccessPinEnabled(): boolean {
  return getConfiguredPin().length > 0;
}

function getSessionSecret(): string {
  const explicit = process.env.APP_SESSION_SECRET?.trim();
  if (explicit) return explicit;
  // 未显式设置 APP_SESSION_SECRET 时由密码派生：修改 APP_ACCESS_PIN 后旧设备会话会自动失效
  return crypto
    .createHash("sha256")
    .update(`fitlog-session-v1:${getConfiguredPin()}`)
    .digest("hex");
}

function sha256Buffer(value: string): Buffer {
  return crypto.createHash("sha256").update(value, "utf8").digest();
}

export function verifyAccessPin(input: string): boolean {
  const configured = getConfiguredPin();
  if (!configured) return true;
  const a = sha256Buffer(input.trim());
  const b = sha256Buffer(configured);
  return crypto.timingSafeEqual(a, b);
}

export function createSessionToken(userId = DEFAULT_USER_ID): string {
  const nowSec = Math.floor(Date.now() / 1000);
  const payload = {
    sub: userId,
    iat: nowSec,
    exp: nowSec + SESSION_MAX_AGE_SECONDS,
  };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = crypto
    .createHmac("sha256", getSessionSecret())
    .update(body)
    .digest("base64url");
  return `${body}.${sig}`;
}

export function verifySessionToken(
  token: string | undefined | null
): { sub: string; exp: number } | null {
  if (!token) return null;
  const dotIdx = token.indexOf(".");
  if (dotIdx <= 0 || dotIdx >= token.length - 1) return null;

  const body = token.slice(0, dotIdx);
  const sig = token.slice(dotIdx + 1);

  const expectedSig = crypto
    .createHmac("sha256", getSessionSecret())
    .update(body)
    .digest("base64url");

  const sigBuf = Buffer.from(sig, "utf8");
  const expectedBuf = Buffer.from(expectedSig, "utf8");
  if (
    sigBuf.length !== expectedBuf.length ||
    !crypto.timingSafeEqual(sigBuf, expectedBuf)
  ) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8")
    ) as { sub?: unknown; exp?: unknown };
    if (
      typeof parsed.sub !== "string" ||
      typeof parsed.exp !== "number" ||
      parsed.exp <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }
    return { sub: parsed.sub, exp: parsed.exp };
  } catch {
    return null;
  }
}

export function isSecureRequest(request: Request): boolean {
  const forwardedProto = request.headers
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim()
    .toLowerCase();
  if (forwardedProto) {
    return forwardedProto === "https";
  }
  try {
    return new URL(request.url).protocol === "https:";
  } catch {
    return process.env.NODE_ENV === "production";
  }
}

export function getPublicOrigin(request: Request): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured && !configured.includes("localhost")) {
    return configured.replace(/\/+$/, "");
  }
  const forwardedHost = request.headers
    .get("x-forwarded-host")
    ?.split(",")[0]
    ?.trim();
  const forwardedProto = request.headers
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim();
  if (forwardedHost) {
    return `${forwardedProto || "https"}://${forwardedHost}`;
  }
  return new URL(request.url).origin;
}

export function checkPinRateLimit(clientKey: string): {
  allowed: boolean;
  retryAfterSeconds: number;
} {
  const now = Date.now();
  const entry = attemptStore.get(clientKey);
  if (!entry) return { allowed: true, retryAfterSeconds: 0 };
  if (entry.lockedUntil > now) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((entry.lockedUntil - now) / 1000),
    };
  }
  if (entry.lockedUntil > 0 && entry.lockedUntil <= now) {
    attemptStore.delete(clientKey);
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

export function recordPinFailure(clientKey: string): void {
  const now = Date.now();
  const prev = attemptStore.get(clientKey);
  const nextCount = (prev?.count ?? 0) + 1;
  attemptStore.set(clientKey, {
    count: nextCount,
    lockedUntil: nextCount >= MAX_FAILED_ATTEMPTS ? now + LOCKOUT_WINDOW_MS : 0,
  });
}

export function clearPinFailures(clientKey: string): void {
  attemptStore.delete(clientKey);
}
