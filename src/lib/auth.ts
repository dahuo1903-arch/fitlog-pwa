import crypto from "node:crypto";
import { cookies, headers } from "next/headers";
import { DEFAULT_USER_ID } from "@/lib/daily-log";

export const SPACE_COOKIE_NAME = "fitlog_space";
export const SPACE_HEADER_NAME = "x-fitlog-space-token";
export const SPACE_MAX_AGE_SECONDS = 10 * 365 * 24 * 60 * 60; // 10 年长期记住本设备空间

function getSigningSecret(): string {
  const explicit = process.env.APP_SESSION_SECRET?.trim();
  if (explicit) return explicit;
  // 未显式配置时基于已有服务端凭证派生稳定签名密钥（本地与自托管零配置即可工作）
  const seed =
    process.env.TURSO_AUTH_TOKEN?.trim() ||
    process.env.WHOOP_CLIENT_SECRET?.trim() ||
    process.env.GEMINI_API_KEY?.trim() ||
    "fitlog-local-space-secret";
  return crypto
    .createHash("sha256")
    .update(`fitlog-space-v2:${seed}`)
    .digest("hex");
}

export function isMultiSpaceMode(): boolean {
  if (process.env.FITLOG_MULTI_SPACE === "false") return false;
  if (process.env.FITLOG_MULTI_SPACE === "true") return true;
  // 云端部署环境默认自动启用多用户空间隔离，防止不同访客看到同一份数据
  return Boolean(
    process.env.VERCEL ||
      process.env.RAILWAY_ENVIRONMENT ||
      process.env.FLY_APP_NAME ||
      process.env.RENDER ||
      process.env.TURSO_DATABASE_URL?.trim()
  );
}

export function generateIsolatedUserId(): string {
  return `u_${crypto.randomBytes(12).toString("hex")}`;
}

export function createSpaceToken(userId: string): string {
  const payload = { uid: userId };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = crypto
    .createHmac("sha256", getSigningSecret())
    .update(body)
    .digest("base64url");
  return `${body}.${sig}`;
}

export function verifySpaceToken(token: string | undefined | null): string | null {
  if (!token) return null;
  const dotIdx = token.indexOf(".");
  if (dotIdx <= 0 || dotIdx >= token.length - 1) return null;

  const body = token.slice(0, dotIdx);
  const sig = token.slice(dotIdx + 1);

  const expectedSig = crypto
    .createHmac("sha256", getSigningSecret())
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
    ) as { uid?: unknown };
    if (
      typeof parsed.uid !== "string" ||
      parsed.uid.length < 1 ||
      parsed.uid.length > 64 ||
      !/^[a-zA-Z0-9_-]+$/.test(parsed.uid)
    ) {
      return null;
    }
    return parsed.uid;
  } catch {
    return null;
  }
}

/**
 * 读取当前请求对应的隔离用户空间 ID。
 * 优先校验签名 Cookie，其次校验由 proxy.ts 在首次访问当次注入的签名请求头，绝不信任未签名值。
 */
export async function getCurrentUserId(): Promise<string> {
  const cookieStore = await cookies();
  const fromCookie = verifySpaceToken(cookieStore.get(SPACE_COOKIE_NAME)?.value);
  if (fromCookie) return fromCookie;

  const headerStore = await headers();
  const fromHeader = verifySpaceToken(headerStore.get(SPACE_HEADER_NAME));
  if (fromHeader) return fromHeader;

  // 本地单人运行模式默认使用 "local"
  return DEFAULT_USER_ID;
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
