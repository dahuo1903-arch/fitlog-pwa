import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/auth";
import { ensureDailyLog, getDailyLogDTO } from "@/lib/daily-log";
import { formatLocalDate, isValidDateStr } from "@/lib/date";

const planItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(120),
  target: z.string().max(120).default(""),
  done: z.boolean().default(false),
});

const patchDailySchema = z.object({
  date: z.string(),
  weightKg: z.number().min(20).max(300).nullable().optional(),
  sleepMinutes: z.number().int().min(0).max(1440).nullable().optional(),
  sleepStart: z.string().max(40).nullable().optional(),
  sleepEnd: z.string().max(40).nullable().optional(),
  planTitle: z.string().max(120).nullable().optional(),
  planItems: z.array(planItemSchema).optional(),
  totalBurnKcal: z.number().int().min(0).max(15000).nullable().optional(),
  restingCalories: z.number().int().min(0).max(10000).nullable().optional(),
  activeCalories: z.number().int().min(0).max(10000).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

export async function GET(request: Request) {
  const userId = await getCurrentUserId();
  const { searchParams } = new URL(request.url);
  const rawDate = searchParams.get("date");
  const date = isValidDateStr(rawDate) ? rawDate : formatLocalDate();

  const daily = await getDailyLogDTO(date, userId);
  return NextResponse.json({ daily });
}

export async function PATCH(request: Request) {
  try {
    const userId = await getCurrentUserId();
    const body = await request.json();
    const parsed = patchDailySchema.safeParse(body);
    if (!parsed.success || !isValidDateStr(parsed.data.date)) {
      return NextResponse.json(
        { error: "参数格式不正确，请检查输入的数值范围" },
        { status: 400 }
      );
    }

    const input = parsed.data;
    await ensureDailyLog(input.date, userId);

    const updateData: Record<string, unknown> = {};

    if (input.weightKg !== undefined) {
      updateData.weightKg =
        input.weightKg === null ? null : Number(input.weightKg.toFixed(1));
      updateData.weightSource = input.weightKg === null ? null : "manual";
    }

    if (input.sleepMinutes !== undefined) {
      updateData.sleepMinutes = input.sleepMinutes;
      updateData.sleepSource = input.sleepMinutes === null ? null : "manual";
    }
    if (input.sleepStart !== undefined) {
      updateData.sleepStart = input.sleepStart;
    }
    if (input.sleepEnd !== undefined) {
      updateData.sleepEnd = input.sleepEnd;
    }

    if (input.planTitle !== undefined) {
      updateData.planTitle = input.planTitle;
      if (input.planTitle !== null) {
        updateData.planSource = "manual";
      }
    }
    if (input.planItems !== undefined) {
      updateData.planItemsJson = JSON.stringify(input.planItems);
      updateData.planSource = "manual";
    }

    if (input.totalBurnKcal !== undefined) {
      updateData.totalBurnKcal = input.totalBurnKcal;
      updateData.wearableSource = input.totalBurnKcal === null ? null : "manual";
    }
    if (input.restingCalories !== undefined) {
      updateData.restingCalories = input.restingCalories;
      updateData.wearableSource = "manual";
    }
    if (input.activeCalories !== undefined) {
      updateData.activeCalories = input.activeCalories;
      updateData.wearableSource = "manual";
    }
    if (
      input.totalBurnKcal === undefined &&
      (input.restingCalories !== undefined || input.activeCalories !== undefined)
    ) {
      const rest = input.restingCalories ?? 0;
      const active = input.activeCalories ?? 0;
      if (rest + active > 0) {
        updateData.totalBurnKcal = rest + active;
      }
    }

    if (input.notes !== undefined) {
      updateData.notes = input.notes;
    }

    await prisma.dailyLog.update({
      where: { userId_date: { userId, date: input.date } },
      data: updateData,
    });

    const daily = await getDailyLogDTO(input.date, userId);
    return NextResponse.json({ daily });
  } catch (error) {
    const message = error instanceof Error ? error.message : "保存当日记录失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
