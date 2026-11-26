import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/auth";

export async function POST() {
  const userId = await getCurrentUserId();
  await prisma.wearableConnection.deleteMany({
    where: { userId, provider: "whoop" },
  });
  return NextResponse.json({ ok: true });
}
