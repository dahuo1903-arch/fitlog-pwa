import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  DEFAULT_USER_ID,
  ensureDailyLog,
  getDailyLogDTO,
} from "@/lib/daily-log";
import { isValidDateStr } from "@/lib/date";

/**
 * 预留给 Apple Watch（iOS 快捷指令自动化 或 未来原生 HealthKit Bridge App）的统一写入入口。
 * 同时预留 userId 字段，方便后续面向其他用户扩展多账号。
 */
const appleWatchPayloadSchema = z.object({
  userId: z.string().min(1).max(64).optional().default(DEFAULT_USER_ID),
  date: z.string(),
  sleepMinutes: z.number().int().min(0).max(1440).optional(),
  sleepStart: z.string().max(40).optional(),
  sleepEnd: z.string().max(40).optional(),
  weightKg: z.number().min(20).max(300).optional(),
  restingCalories: z.number().int().min(0).max(10000).optional(),
  activeCalories: z.number().int().min(0).max(10000).optional(),
  totalBurnKcal: z.number().int().min(0).max(15000).optional(),
  restingHr: z.number().int().min(25).max(220).optional(),
  hrvMs: z.number().min(0).max(400).optional(),
});

export async function POST(request: Request) {
  try {
    const secret = process.env.APPLE_WATCH_WEBHOOK_SECRET?.trim();
    if (secret) {
      const authHeader = request.headers.get("authorization") || "";
      if (authHeader !== `Bearer ${secret}`) {
        return NextResponse.json({ error: "未授权的 Webhook 请求" }, { status: 401 });
      }
    }

    const body = await request.json();
    const parsed = appleWatchPayloadSchema.safeParse(body);
    if (!parsed.success || !isValidDateStr(parsed.data.date)) {
      return NextResponse.json(
        { error: "请提供有效的日期与 Apple Watch 指标数据" },
        { status: 400 }
      );
    }

    const input = parsed.data;
    await ensureDailyLog(input.date, input.userId);

    const computedTotalBurn =
      input.totalBurnKcal ??
      (input.restingCalories !== undefined || input.activeCalories !== undefined
        ? (input.restingCalories ?? 0) + (input.activeCalories ?? 0)
        : undefined);

    await prisma.dailyLog.update({
      where: { userId_date: { userId: input.userId, date: input.date } },
      data: {
        ...(input.sleepMinutes !== undefined
          ? { sleepMinutes: input.sleepMinutes, sleepSource: "apple_watch" }
          : {}),
        ...(input.sleepStart !== undefined ? { sleepStart: input.sleepStart } : {}),
        ...(input.sleepEnd !== undefined ? { sleepEnd: input.sleepEnd } : {}),
        ...(input.weightKg !== undefined
          ? {
              weightKg: Number(input.weightKg.toFixed(1)),
              weightSource: "apple_watch",
            }
          : {}),
        ...(input.restingCalories !== undefined
          ? { restingCalories: input.restingCalories }
          : {}),
        ...(input.activeCalories !== undefined
          ? { activeCalories: input.activeCalories }
          : {}),
        ...(computedTotalBurn !== undefined
          ? { totalBurnKcal: computedTotalBurn }
          : {}),
        ...(input.restingHr !== undefined ? { restingHr: input.restingHr } : {}),
        ...(input.hrvMs !== undefined ? { hrvMs: input.hrvMs } : {}),
        wearableSource: "apple_watch",
        wearableSyncedAt: new Date(),
      },
    });

    await prisma.wearableConnection.upsert({
      where: { userId_provider: { userId: input.userId, provider: "apple_watch" } },
      update: { lastSyncedAt: new Date() },
      create: {
        userId: input.userId,
        provider: "apple_watch",
        lastSyncedAt: new Date(),
      },
    });

    const daily = await getDailyLogDTO(input.date, input.userId);
    return NextResponse.json({ ok: true, daily });
  } catch (error) {
    const message = error instanceof Error ? error.message : "写入 Apple Watch 数据失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
