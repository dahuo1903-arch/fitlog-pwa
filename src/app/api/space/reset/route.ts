import { NextResponse } from "next/server";
import {
  SPACE_COOKIE_NAME,
  SPACE_MAX_AGE_SECONDS,
  createSpaceToken,
  generateIsolatedUserId,
  isSecureRequest,
} from "@/lib/auth";

export async function POST(request: Request) {
  const nextUid = generateIsolatedUserId();
  const token = createSpaceToken(nextUid);

  const response = NextResponse.json({
    ok: true,
    message: "已新建全新的空白独立个人空间",
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
