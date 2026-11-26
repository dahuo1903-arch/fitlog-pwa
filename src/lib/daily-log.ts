import type { DailyLog, MealItem } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type {
  DailyLogDTO,
  PlanExerciseItem,
  XunjiWorkoutSummary,
} from "@/types/fitness";

export const DEFAULT_USER_ID = "local";

export function safeJsonParse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function ensureDailyLog(date: string, userId = DEFAULT_USER_ID) {
  return prisma.dailyLog.upsert({
    where: { userId_date: { userId, date } },
    update: {},
    create: { userId, date },
    include: { meals: { orderBy: { createdAt: "asc" } } },
  });
}

export async function getDailyLogDTO(
  date: string,
  userId = DEFAULT_USER_ID
): Promise<DailyLogDTO> {
  const [log, latestWeight] = await Promise.all([
    prisma.dailyLog.findUnique({
      where: { userId_date: { userId, date } },
      include: { meals: { orderBy: { createdAt: "asc" } } },
    }),
    prisma.dailyLog.findFirst({
      where: {
        userId,
        weightKg: { not: null },
        date: { lte: date },
      },
      orderBy: { date: "desc" },
      select: { weightKg: true, date: true },
    }),
  ]);

  return serializeDailyLog(date, log, latestWeight);
}

export function serializeDailyLog(
  date: string,
  log: (DailyLog & { meals: MealItem[] }) | null,
  latestWeight: { weightKg: number | null; date: string } | null
): DailyLogDTO {
  const meals = (log?.meals ?? []).map((m) => ({
    id: m.id,
    date: m.date,
    mealType: m.mealType,
    rawInput: m.rawInput,
    name: m.name,
    calories: m.calories,
    protein: Number(m.protein.toFixed(1)),
    carbs: Number(m.carbs.toFixed(1)),
    fat: Number(m.fat.toFixed(1)),
    source: m.source,
    createdAt: m.createdAt.toISOString(),
  }));

  const totals = meals.reduce(
    (acc, item) => ({
      calories: acc.calories + item.calories,
      protein: Number((acc.protein + item.protein).toFixed(1)),
      carbs: Number((acc.carbs + item.carbs).toFixed(1)),
      fat: Number((acc.fat + item.fat).toFixed(1)),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );

  const planItems = safeJsonParse<PlanExerciseItem[]>(log?.planItemsJson, []);
  const workouts = safeJsonParse<XunjiWorkoutSummary[]>(log?.workoutSummary, []);

  return {
    date,
    weightKg: log?.weightKg ?? null,
    weightSource: log?.weightSource ?? null,
    latestWeightKg: latestWeight?.weightKg ?? null,
    latestWeightDate: latestWeight?.date ?? null,

    sleepMinutes: log?.sleepMinutes ?? null,
    sleepStart: log?.sleepStart ?? null,
    sleepEnd: log?.sleepEnd ?? null,
    sleepPerformance: log?.sleepPerformance ?? null,
    sleepSource: log?.sleepSource ?? null,

    totalBurnKcal: log?.totalBurnKcal ?? null,
    restingCalories: log?.restingCalories ?? null,
    activeCalories: log?.activeCalories ?? null,
    recoveryScore: log?.recoveryScore ?? null,
    strainScore: log?.strainScore ?? null,
    hrvMs: log?.hrvMs ?? null,
    restingHr: log?.restingHr ?? null,
    wearableSource: log?.wearableSource ?? null,
    wearableSyncedAt: log?.wearableSyncedAt?.toISOString() ?? null,

    planTitle: log?.planTitle ?? null,
    planItems,
    planSource: log?.planSource ?? null,
    workouts,
    totalVolume: log?.totalVolume ?? null,
    workoutSyncedAt: log?.workoutSyncedAt?.toISOString() ?? null,

    notes: log?.notes ?? null,
    meals,
    totals,
  };
}
