import { NextResponse } from "next/server";
import { z } from "zod";
import { DEFAULT_USER_ID, getDailyLogDTO } from "@/lib/daily-log";
import { formatLocalDate, isValidDateStr } from "@/lib/date";
import { syncWhoopRange } from "@/lib/whoop";

const syncWhoopSchema = z.object({
  date: z.string().optional(),
  daysBack: z.number().int().min(1).max(30).optional().default(7),
  timezoneOffsetMinutes: z.number().int().min(-840).max(840).optional().default(0),
  syncBodyWeight: z.boolean().optional().default(false),
});

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const parsed = syncWhoopSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "同步参数格式不正确" }, { status: 400 });
    }

    const anchorDate = isValidDateStr(parsed.data.date)
      ? parsed.data.date
      : formatLocalDate();

    const summary = await syncWhoopRange({
      anchorDate,
      daysBack: parsed.data.daysBack,
      timezoneOffsetMinutes: parsed.data.timezoneOffsetMinutes,
      syncBodyWeight: parsed.data.syncBodyWeight,
      userId: DEFAULT_USER_ID,
    });

    const daily = await getDailyLogDTO(anchorDate, DEFAULT_USER_ID);
    const hasAny = summary.sleepCount > 0 || summary.cycleCount > 0;
    return NextResponse.json({
      daily,
      summary,
      message: hasAny
        ? `WHOOP 同步完成：更新 ${summary.syncedDays} 天数据（${summary.sleepCount} 条睡眠，${summary.cycleCount} 条消耗周期）`
        : "WHOOP 连接正常，但该账号最近 7 天暂无手环记录（佩戴同步后再点刷新，或核对是否绑错 WHOOP 账号）",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "同步 WHOOP 数据失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
