import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/auth";
import { ensureDailyLog, getDailyLogDTO } from "@/lib/daily-log";
import { isValidDateStr } from "@/lib/date";
import {
  fetchXunjiDayWorkouts,
  lookupXunjiPlanForDate,
  syncXunjiPlansToCache,
  XUNJI_COOLDOWN_MS,
} from "@/lib/xunji";

const syncRequestSchema = z.object({
  date: z.string(),
  syncPlans: z.boolean().optional().default(true),
  overwriteManualPlan: z.boolean().optional().default(false),
  force: z.boolean().optional().default(false),
});

export async function POST(request: Request) {
  try {
    const userId = await getCurrentUserId();
    const body = await request.json();
    const parsed = syncRequestSchema.safeParse(body);
    if (!parsed.success || !isValidDateStr(parsed.data.date)) {
      return NextResponse.json(
        { error: "请提供有效的日期参数 (YYYY-MM-DD)" },
        { status: 400 }
      );
    }

    const { date, syncPlans, overwriteManualPlan, force } = parsed.data;
    const existing = await ensureDailyLog(date, userId);

    // 防限频检查：训记全量读取有 30 秒冷却限制
    if (!force && existing.workoutSyncedAt) {
      const elapsed = Date.now() - existing.workoutSyncedAt.getTime();
      if (elapsed < XUNJI_COOLDOWN_MS) {
        const waitSec = Math.ceil((XUNJI_COOLDOWN_MS - elapsed) / 1000);
        const daily = await getDailyLogDTO(date, userId);
        return NextResponse.json({
          daily,
          cached: true,
          message: `距上次同步不足 30 秒，已使用本地缓存（约 ${waitSec} 秒后可再次刷新）`,
        });
      }
    }

    // 1. 拉取当日实际训练记录（严格使用当前用户空间的训记 Key）
    const { workouts, totalVolume } = await fetchXunjiDayWorkouts(date, userId);

    // 2. 按需拉取训练计划（如果缓存为空或距离上次计划同步超过 6 小时）
    let plansSynced = 0;
    if (syncPlans) {
      const latestPlan = await prisma.xunjiPlanCache.findFirst({
        where: { userId },
        orderBy: { syncedAt: "desc" },
        select: { syncedAt: true },
      });
      const planStale =
        !latestPlan || Date.now() - latestPlan.syncedAt.getTime() > 6 * 3600_000;
      if (planStale || force) {
        try {
          plansSynced = await syncXunjiPlansToCache(userId);
        } catch {
          // 计划接口失败不阻断当日训练记录入库
        }
      }
    }

    const matchedPlan = await lookupXunjiPlanForDate(date, userId);
    const shouldWritePlan =
      matchedPlan !== null &&
      (overwriteManualPlan ||
        !existing.planSource ||
        existing.planSource === "xunji");

    await prisma.dailyLog.update({
      where: { userId_date: { userId, date } },
      data: {
        workoutSummary: JSON.stringify(workouts),
        totalVolume,
        workoutSyncedAt: new Date(),
        ...(shouldWritePlan && matchedPlan
          ? {
              planTitle: matchedPlan.planTitle,
              planItemsJson: JSON.stringify(matchedPlan.planItems),
              planSource: "xunji",
            }
          : {}),
      },
    });

    const daily = await getDailyLogDTO(date, userId);
    return NextResponse.json({
      daily,
      cached: false,
      plansSynced,
      message:
        workouts.length > 0
          ? `已同步 ${workouts.length} 条训记记录（总容量 ${totalVolume} kg）`
          : matchedPlan
            ? `当日暂无已完成训练，已匹配训记计划：${matchedPlan.planTitle}`
            : "同步完成，当日暂无训记记录",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "同步训记失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
