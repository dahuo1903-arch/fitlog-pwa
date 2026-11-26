import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { getPublicOrigin, isSecureRequest } from "@/lib/auth";
import { buildWhoopAuthUrl, isWhoopConfigured } from "@/lib/whoop";

export async function GET(request: Request) {
  if (!isWhoopConfigured()) {
    return NextResponse.json(
      {
        error:
          "尚未配置 WHOOP_CLIENT_ID 与 WHOOP_CLIENT_SECRET，请先在环境变量中填写 WHOOP 开发者凭证。",
      },
      { status: 400 }
    );
  }

  const state = crypto.randomBytes(16).toString("hex");
  const authUrl = buildWhoopAuthUrl(state, getPublicOrigin(request));

  const response = NextResponse.redirect(authUrl);
  response.cookies.set("whoop_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureRequest(request),
    path: "/",
    maxAge: 600,
  });
  return response;
}
