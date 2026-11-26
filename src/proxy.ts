import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { DEFAULT_USER_ID } from "@/lib/daily-log";
import {
  SPACE_COOKIE_NAME,
  SPACE_HEADER_NAME,
  SPACE_MAX_AGE_SECONDS,
  createSpaceToken,
  generateIsolatedUserId,
  isMultiSpaceMode,
  isSecureRequest,
  verifySpaceToken,
} from "@/lib/auth";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Apple Watch Webhook 和跨设备认领路由自行处理空间归属
  if (
    pathname.startsWith("/api/wearables/apple-watch") ||
    pathname.startsWith("/api/space/claim")
  ) {
    return NextResponse.next();
  }

  // 旧版 /unlock 链接兼容：已去除登录密码，直接跳回首页
  if (pathname === "/unlock") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  const existingToken = request.cookies.get(SPACE_COOKIE_NAME)?.value;
  const existingUid = verifySpaceToken(existingToken);

  if (existingUid && existingToken) {
    // 将已验签的当前空间令牌透传给服务端组件与 API
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set(SPACE_HEADER_NAME, existingToken);
    return NextResponse.next({
      request: { headers: requestHeaders },
    });
  }

  // 无有效空间 Cookie 时：
  // - 云端多用户模式：自动为新设备生成全球唯一的空白隔离空间，彻底与其他人数据隔绝
  // - 本地单人模式：默认绑定 "local" 空间，零门槛直接读取本地数据
  const nextUid = isMultiSpaceMode()
    ? generateIsolatedUserId()
    : DEFAULT_USER_ID;
  const nextToken = createSpaceToken(nextUid);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(SPACE_HEADER_NAME, nextToken);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  response.cookies.set(SPACE_COOKIE_NAME, nextToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureRequest(request),
    path: "/",
    maxAge: SPACE_MAX_AGE_SECONDS,
  });

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|manifest\\.json|sw\\.js|offline\\.html|icon\\.svg|icons/).*)",
  ],
};
