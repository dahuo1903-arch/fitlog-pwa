export interface PlanExerciseItem {
  id: string;
  name: string;
  target: string; // e.g. "4组 × 10次 · 60kg" 或 "4×12"
  done: boolean;
}

export interface XunjiMovementSummary {
  name: string;
  sets: number;
  doneSets: number;
  maxWeight: number;
  volume: number;
  unit: string;
}

export interface XunjiWorkoutSummary {
  localId: string;
  title: string;
  durationMinutes: number | null;
  totalVolume: number;
  movements: XunjiMovementSummary[];
}

export interface MealItemDTO {
  id: string;
  date: string;
  mealType: string;
  rawInput: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  source: string;
  createdAt: string;
}

export interface DailyLogDTO {
  date: string;
  weightKg: number | null;
  weightSource: string | null;
  latestWeightKg: number | null;
  latestWeightDate: string | null;

  sleepMinutes: number | null;
  sleepStart: string | null;
  sleepEnd: string | null;
  sleepPerformance: number | null;
  sleepSource: string | null;

  totalBurnKcal: number | null;
  restingCalories: number | null;
  activeCalories: number | null;
  recoveryScore: number | null;
  strainScore: number | null;
  hrvMs: number | null;
  restingHr: number | null;
  wearableSource: string | null;
  wearableSyncedAt: string | null;

  planTitle: string | null;
  planItems: PlanExerciseItem[];
  planSource: string | null;
  workouts: XunjiWorkoutSummary[];
  totalVolume: number | null;
  workoutSyncedAt: string | null;

  notes: string | null;
  meals: MealItemDTO[];
  totals: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
}

export interface CalendarDayMarker {
  date: string;
  hasMeals: boolean;
  hasWorkoutOrPlan: boolean;
  hasWeight: boolean;
  hasSleep: boolean;
  calories: number;
}

export interface IntegrationStatusDTO {
  geminiConfigured: boolean;
  geminiModel: string;
  xunjiConfigured: boolean;
  whoopConfigured: boolean;
  whoopConnected: boolean;
  whoopLastSyncedAt: string | null;
  appleWatchWebhookProtected: boolean;
  appleWatchLastSyncedAt: string | null;
  lanUrls: string[];
  mdnsUrl: string | null;
  accessPinEnabled: boolean;
}
