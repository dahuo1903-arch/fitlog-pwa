import { NextResponse } from "next/server";
import { z } from "zod";
import {
  SPACE_COOKIE_NAME,
  SPACE_MAX_AGE_SECONDS,
  getPublicOrigin,
  isSecureRequest,
  verifySpaceToken,
} from "@/lib/auth";

function extractToken(rawInput: string): string | null {
  const trimmed = rawInput.trim();
  if (!trimmed) return null;
  // 支持直接粘贴完整同步链接或裸令牌
  if (trimmed.includes("token=")) {
    try {
      const parsed = new URL(
        trimmed.startsWith("http") ? trimmed : `https://local.invalid${trimmed.startsWith("/") ? "" : "/"}${trimmed}`
      );
      return parsed.searchParams.get("token")?.trim() || null;
    } catch {
      return null;
    }
  }
  return trimmed;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token")?.trim();
  const uid = verifySpaceToken(token);

  if (!token || !uid) {
    return NextResponse.json(
      { error: "跨设备同步链接无效或已失效" },
      { status: 400 }
    );
  }

  const appUrl = getPublicOrigin(request);
  const response = NextResponse.redirect(`${appUrl}/?space=synced`);
  response.cookies.set(SPACE_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureRequest(request),
    path: "/",
    maxAge: SPACE_MAX_AGE_SECONDS,
  });
  return response;
}

const claimBodySchema = z.object({
  tokenOrUrl: z.string().min(1).max(1024),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = claimBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "请输入有效的同步链接或空间码" }, { status: 400 });
  }

  const token = extractToken(parsed.data.tokenOrUrl);
  const uid = verifySpaceToken(token);
  if (!token || !uid) {
    return NextResponse.json(
      { error: "同步链接或空间码格式无效，请检查后重试" },
      { status: 400 }
    );
  }

  const response = NextResponse.json({
    ok: true,
    message: "已切换到对应的个人数据空间",
  });
  response.cookies.set(SPACE_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureRequest(request),
    path: "/",
    maxAge: SPACE_MAX_AGE_SECONDS,
  });
  return response;
}
