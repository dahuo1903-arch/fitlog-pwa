import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { DEFAULT_USER_ID, safeJsonParse } from "@/lib/daily-log";
import { addDays, formatLocalDate, MONTH_REGEX } from "@/lib/date";
import type {
  CalendarDayMarker,
  PlanExerciseItem,
  XunjiWorkoutSummary,
} from "@/types/fitness";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawMonth = searchParams.get("month");
  const month =
    rawMonth && MONTH_REGEX.test(rawMonth)
      ? rawMonth
      : formatLocalDate().slice(0, 7);

  const [year, m] = month.split("-").map(Number);
  const firstOfMonth = `${month}-01`;
  const lastDayNum = new Date(year, m, 0).getDate();
  const lastOfMonth = `${month}-${String(lastDayNum).padStart(2, "0")}`;

  // 前后各扩展 7 天，满足周视图跨月切换时依然能看到小圆点
  const rangeStart = addDays(firstOfMonth, -7);
  const rangeEnd = addDays(lastOfMonth, 7);

  const logs = await prisma.dailyLog.findMany({
    where: {
      userId: DEFAULT_USER_ID,
      date: { gte: rangeStart, lte: rangeEnd },
    },
    include: {
      meals: {
        select: { calories: true },
      },
    },
    orderBy: { date: "asc" },
  });

  const markers: CalendarDayMarker[] = logs.map((log) => {
    const planItems = safeJsonParse<PlanExerciseItem[]>(log.planItemsJson, []);
    const workouts = safeJsonParse<XunjiWorkoutSummary[]>(
      log.workoutSummary,
      []
    );
    const calories = log.meals.reduce((sum, item) => sum + item.calories, 0);

    return {
      date: log.date,
      hasMeals: log.meals.length > 0,
      hasWorkoutOrPlan:
        Boolean(log.planTitle) || planItems.length > 0 || workouts.length > 0,
      hasWeight: log.weightKg !== null,
      hasSleep: log.sleepMinutes !== null,
      calories,
    };
  });

  return NextResponse.json({ month, markers });
}
