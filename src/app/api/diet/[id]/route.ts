import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/auth";
import { getDailyLogDTO } from "@/lib/daily-log";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    const { id } = await context.params;
    const existing = await prisma.mealItem.findUnique({
      where: { id },
      select: {
        id: true,
        date: true,
        dailyLog: { select: { userId: true } },
      },
    });

    // 严格校验记录归属当前用户空间，杜绝跨用户越权删除
    if (!existing || existing.dailyLog.userId !== userId) {
      return NextResponse.json({ error: "未找到该饮食记录" }, { status: 404 });
    }

    await prisma.mealItem.delete({ where: { id } });
    const daily = await getDailyLogDTO(existing.date, userId);
    return NextResponse.json({ daily });
  } catch (error) {
    const message = error instanceof Error ? error.message : "删除饮食记录失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
