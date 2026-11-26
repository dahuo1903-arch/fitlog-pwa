import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { DEFAULT_USER_ID } from "@/lib/daily-log";

export async function POST() {
  await prisma.wearableConnection.deleteMany({
    where: { userId: DEFAULT_USER_ID, provider: "whoop" },
  });
  return NextResponse.json({ ok: true });
}
