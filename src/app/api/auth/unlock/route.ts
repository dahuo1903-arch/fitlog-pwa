import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({ ok: true, message: "当前无需登录密码，已直接开放独立空间" });
}
