import { prisma } from "@/lib/prisma";
import { createSpaceToken, getCurrentUserId } from "@/lib/auth";
import {
  DEFAULT_USER_ID,
  getDailyLogDTO,
  safeJsonParse,
} from "@/lib/daily-log";
import { addDays, formatLocalDate } from "@/lib/date";
import { getGeminiModel, isGeminiConfigured } from "@/lib/gemini-diet";
import { isXunjiConfiguredForUser } from "@/lib/xunji";
import { isWhoopConfigured } from "@/lib/whoop";
import { getLanAccessInfo } from "@/lib/network";
import { FitLogApp } from "@/components/FitLogApp";
import type {
  CalendarDayMarker,
  IntegrationStatusDTO,
  PlanExerciseItem,
  XunjiWorkoutSummary,
} from "@/types/fitness";

export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ whoop?: string; reason?: string; space?: string }>;
}) {
  const userId = await getCurrentUserId();
  const query = await searchParams;
  const initialNotice =
    query.whoop === "connected"
      ? {
          text: "WHOOP 授权成功，可随时点击同步睡眠与消耗数据",
          isError: false,
        }
      : query.whoop === "error"
        ? {
            text: `WHOOP 授权失败：${query.reason || "授权未完成"}`,
            isError: true,
          }
        : query.space === "synced"
          ? {
              text: "已同步你的个人隔离空间，本设备永久免密保持绑定",
              isError: false,
            }
          : null;

  const today = formatLocalDate();
  const month = today.slice(0, 7);
  const [year, m] = month.split("-").map(Number);
  const lastDayNum = new Date(year, m, 0).getDate();
  const rangeStart = addDays(`${month}-01`, -7);
  const rangeEnd = addDays(
    `${month}-${String(lastDayNum).padStart(2, "0")}`,
    7
  );

  const [initialDaily, monthLogs, connections, xunjiState] = await Promise.all([
    getDailyLogDTO(today, userId),
    prisma.dailyLog.findMany({
      where: {
        userId,
        date: { gte: rangeStart, lte: rangeEnd },
      },
      include: { meals: { select: { calories: true } } },
      orderBy: { date: "asc" },
    }),
    prisma.wearableConnection.findMany({
      where: { userId },
    }),
    isXunjiConfiguredForUser(userId),
  ]);

  const initialMarkers: CalendarDayMarker[] = monthLogs.map((log) => {
    const planItems = safeJsonParse<PlanExerciseItem[]>(log.planItemsJson, []);
    const workouts = safeJsonParse<XunjiWorkoutSummary[]>(
      log.workoutSummary,
      []
    );
    return {
      date: log.date,
      hasMeals: log.meals.length > 0,
      hasWorkoutOrPlan:
        Boolean(log.planTitle) || planItems.length > 0 || workouts.length > 0,
      hasWeight: log.weightKg !== null,
      hasSleep: log.sleepMinutes !== null,
      calories: log.meals.reduce((s, item) => s + item.calories, 0),
    };
  });

  const whoopConn = connections.find((c) => c.provider === "whoop");
  const appleConn = connections.find((c) => c.provider === "apple_watch");
  const lan = getLanAccessInfo();
  const spaceToken = createSpaceToken(userId);
  const spaceLabel =
    userId === DEFAULT_USER_ID
      ? "主空间"
      : `独立空间 #${userId.replace(/^u_/, "").slice(0, 6)}`;

  const initialStatus: IntegrationStatusDTO = {
    geminiConfigured: isGeminiConfigured(),
    geminiModel: getGeminiModel(),
    xunjiConfigured: xunjiState.configured,
    xunjiCustomKeySet: xunjiState.isCustom,
    whoopConfigured: isWhoopConfigured(),
    whoopConnected: Boolean(whoopConn?.accessToken),
    whoopLastSyncedAt: whoopConn?.lastSyncedAt?.toISOString() ?? null,
    appleWatchWebhookProtected: Boolean(
      process.env.APPLE_WATCH_WEBHOOK_SECRET?.trim()
    ),
    appleWatchLastSyncedAt: appleConn?.lastSyncedAt?.toISOString() ?? null,
    lanUrls: lan.lanUrls,
    mdnsUrl: lan.mdnsUrl,
    spaceLabel,
    spaceSyncPath: `/api/space/claim?token=${encodeURIComponent(spaceToken)}`,
  };

  return (
    <FitLogApp
      initialDaily={initialDaily}
      initialMarkers={initialMarkers}
      initialStatus={initialStatus}
      initialNotice={initialNotice}
    />
  );
}
