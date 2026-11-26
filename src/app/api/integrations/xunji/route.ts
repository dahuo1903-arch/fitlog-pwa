import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/auth";

const xunjiKeySchema = z.object({
  apiKey: z.string().max(256),
});

export async function POST(request: Request) {
  try {
    const userId = await getCurrentUserId();
    const body = await request.json().catch(() => null);
    const parsed = xunjiKeySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "训记 Key 格式不正确" }, { status: 400 });
    }

    const trimmed = parsed.data.apiKey.trim();
    if (!trimmed) {
      await prisma.wearableConnection.deleteMany({
        where: { userId, provider: "xunji" },
      });
      await prisma.xunjiPlanCache.deleteMany({
        where: { userId },
      });
      return NextResponse.json({ ok: true, message: "已清除当前空间的个人训记 Key" });
    }

    await prisma.wearableConnection.upsert({
      where: { userId_provider: { userId, provider: "xunji" } },
      update: { accessToken: trimmed },
      create: {
        userId,
        provider: "xunji",
        accessToken: trimmed,
      },
    });

    return NextResponse.json({
      ok: true,
      message: "已保存你的个人训记 Key（仅当前隔离空间可见）",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "保存训记 Key 失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
