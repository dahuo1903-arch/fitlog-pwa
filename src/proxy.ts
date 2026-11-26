import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  SESSION_COOKIE_NAME,
  isAccessPinEnabled,
  verifySessionToken,
} from "@/lib/auth";

const PUBLIC_API_PREFIXES = [
  "/api/auth/",
  "/api/wearables/apple-watch", // 自带 Bearer 密钥鉴权，供 iOS 快捷指令调用
  "/api/whoop/callback", // WHOOP OAuth 回调，自带 state Cookie 校验
];

export function proxy(request: NextRequest) {
  if (!isAccessPinEnabled()) {
    return NextResponse.next();
  }

  const { pathname, search } = request.nextUrl;
  const sessionToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = verifySessionToken(sessionToken);

  // 已解锁时访问 /unlock 直接跳回首页
  if (pathname === "/unlock") {
    if (session) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  // 公开鉴权/回调接口放行
  if (PUBLIC_API_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  if (session) {
    return NextResponse.next();
  }

  // 未解锁的 API 请求返回 401
  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: "请先输入访问密码解锁 FitLog" },
      { status: 401 }
    );
  }

  // 未解锁的页面请求跳转至 /unlock
  const unlockUrl = new URL("/unlock", request.url);
  if (pathname !== "/" || search) {
    unlockUrl.searchParams.set("next", `${pathname}${search}`);
  }
  return NextResponse.redirect(unlockUrl);
}

export const config = {
  matcher: [
    /*
     * 放行 Next.js 静态构建资源与 PWA 清单/图标/Service Worker（iOS 安装时不携带登录 Cookie）
     */
    "/((?!_next/static|_next/image|favicon\\.ico|manifest\\.json|sw\\.js|offline\\.html|icon\\.svg|icons/).*)",
  ],
};
