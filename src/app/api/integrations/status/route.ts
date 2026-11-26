import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSpaceToken, getCurrentUserId } from "@/lib/auth";
import { DEFAULT_USER_ID } from "@/lib/daily-log";
import { getGeminiModel, isGeminiConfigured } from "@/lib/gemini-diet";
import { isXunjiConfiguredForUser } from "@/lib/xunji";
import { isWhoopConfigured } from "@/lib/whoop";
import { getLanAccessInfo } from "@/lib/network";
import type { IntegrationStatusDTO } from "@/types/fitness";

export async function GET() {
  const userId = await getCurrentUserId();
  const [connections, xunjiState] = await Promise.all([
    prisma.wearableConnection.findMany({
      where: { userId },
    }),
    isXunjiConfiguredForUser(userId),
  ]);

  const whoopConn = connections.find((c) => c.provider === "whoop");
  const appleConn = connections.find((c) => c.provider === "apple_watch");
  const lan = getLanAccessInfo();
  const spaceToken = createSpaceToken(userId);
  const spaceLabel =
    userId === DEFAULT_USER_ID
      ? "主空间"
      : `独立空间 #${userId.replace(/^u_/, "").slice(0, 6)}`;

  const status: IntegrationStatusDTO = {
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

  return NextResponse.json({ status });
}
