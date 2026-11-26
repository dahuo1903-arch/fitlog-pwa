import { NextResponse } from "next/server";
import { z } from "zod";
import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  checkPinRateLimit,
  clearPinFailures,
  createSessionToken,
  isAccessPinEnabled,
  isSecureRequest,
  recordPinFailure,
  verifyAccessPin,
} from "@/lib/auth";
import { DEFAULT_USER_ID } from "@/lib/daily-log";

const unlockSchema = z.object({
  pin: z.string().min(1, "请输入访问密码").max(128),
});

export async function POST(request: Request) {
  if (!isAccessPinEnabled()) {
    return NextResponse.json({ ok: true, message: "当前未开启密码锁" });
  }

  const clientKey =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "default";

  const rate = checkPinRateLimit(clientKey);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: `密码错误次数过多，请 ${rate.retryAfterSeconds} 秒后再试` },
      { status: 429 }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = unlockSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "请输入访问密码" }, { status: 400 });
  }

  if (!verifyAccessPin(parsed.data.pin)) {
    recordPinFailure(clientKey);
    return NextResponse.json(
      { error: "访问密码不正确，请重试" },
      { status: 401 }
    );
  }

  clearPinFailures(clientKey);
  const token = createSessionToken(DEFAULT_USER_ID);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureRequest(request),
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  return response;
}
