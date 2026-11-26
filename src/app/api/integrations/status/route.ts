import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { DEFAULT_USER_ID } from "@/lib/daily-log";
import { getGeminiModel, isGeminiConfigured } from "@/lib/gemini-diet";
import { isXunjiConfigured } from "@/lib/xunji";
import { isWhoopConfigured } from "@/lib/whoop";
import { getLanAccessInfo } from "@/lib/network";
import { isAccessPinEnabled } from "@/lib/auth";
import type { IntegrationStatusDTO } from "@/types/fitness";

export async function GET() {
  const connections = await prisma.wearableConnection.findMany({
    where: { userId: DEFAULT_USER_ID },
  });

  const whoopConn = connections.find((c) => c.provider === "whoop");
  const appleConn = connections.find((c) => c.provider === "apple_watch");
  const lan = getLanAccessInfo();

  const status: IntegrationStatusDTO = {
    geminiConfigured: isGeminiConfigured(),
    geminiModel: getGeminiModel(),
    xunjiConfigured: isXunjiConfigured(),
    whoopConfigured: isWhoopConfigured(),
    whoopConnected: Boolean(whoopConn?.accessToken),
    whoopLastSyncedAt: whoopConn?.lastSyncedAt?.toISOString() ?? null,
    appleWatchWebhookProtected: Boolean(
      process.env.APPLE_WATCH_WEBHOOK_SECRET?.trim()
    ),
    appleWatchLastSyncedAt: appleConn?.lastSyncedAt?.toISOString() ?? null,
    lanUrls: lan.lanUrls,
    mdnsUrl: lan.mdnsUrl,
    accessPinEnabled: isAccessPinEnabled(),
  };

  return NextResponse.json({ status });
}
