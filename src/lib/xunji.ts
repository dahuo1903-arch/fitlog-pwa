import { prisma } from "@/lib/prisma";
import { DEFAULT_USER_ID, safeJsonParse } from "@/lib/daily-log";
import type {
  PlanExerciseItem,
  XunjiMovementSummary,
  XunjiWorkoutSummary,
} from "@/types/fitness";

const XUNJI_TRAINS_URL = "https://trains.xunjiapp.cn/api_trains_for_llm_v2";
const XUNJI_PLAN_URL = "https://api.xunjiapp.cn/open/plan/query_gzip";

// 训记全量读取接口限频约 30 秒，这里在本地加 30 秒冷却保护
export const XUNJI_COOLDOWN_MS = 30_000;

interface XunjiRawSet {
  done?: boolean;
  weight?: string | number | null;
  unit?: string | null;
  reps?: string | number | null;
  selfWeight?: boolean;
}

interface XunjiRawMovement {
  name?: string;
  sets?: XunjiRawSet[];
}

interface XunjiRawTrain {
  localid?: string | number;
  title?: string;
  start?: number;
  end?: number;
  started_at?: number;
  ended_at?: number;
  movements?: XunjiRawMovement[];
}

interface XunjiPlanMeta {
  plan_ref: string;
  title: string;
  status: string;
  start_date?: string;
  end_date?: string;
}

interface XunjiPlanTargetSet {
  set_type?: string;
  weight?: number | null;
  unit?: string | null;
  reps?: number | null;
  duration_seconds?: number | null;
}

interface XunjiPlanMovement {
  name: string;
  target_sets?: XunjiPlanTargetSet[];
}

interface XunjiPlanDay {
  datestr: string;
  day_type?: string;
  completion_status?: string;
  workout?: {
    name?: string;
    movements?: XunjiPlanMovement[];
  } | null;
}

interface XunjiPlanDetailRes {
  plan?: XunjiPlanMeta;
  days?: XunjiPlanDay[];
}

function getEnvXunjiApiKey(): string | null {
  const key = process.env.XUNJI_API_KEY?.trim();
  return key ? key : null;
}

export function isXunjiConfigured(): boolean {
  return Boolean(getEnvXunjiApiKey());
}

/**
 * 按用户空间解析训记 API Key：
 * - 优先读取该用户在「连接」中填写的个人训记 Key
 * - 仅主空间 ("local") 允许回退到服务器 .env 中的 XUNJI_API_KEY，严防其他访客读取到部署者个人数据
 */
export async function getXunjiApiKeyForUser(
  userId = DEFAULT_USER_ID
): Promise<{ apiKey: string | null; isCustom: boolean }> {
  const conn = await prisma.wearableConnection.findUnique({
    where: { userId_provider: { userId, provider: "xunji" } },
    select: { accessToken: true },
  });
  const customKey = conn?.accessToken?.trim();
  if (customKey) {
    return { apiKey: customKey, isCustom: true };
  }

  if (userId === DEFAULT_USER_ID) {
    return { apiKey: getEnvXunjiApiKey(), isCustom: false };
  }

  return { apiKey: null, isCustom: false };
}

export async function isXunjiConfiguredForUser(
  userId = DEFAULT_USER_ID
): Promise<{ configured: boolean; isCustom: boolean }> {
  const { apiKey, isCustom } = await getXunjiApiKeyForUser(userId);
  return { configured: Boolean(apiKey), isCustom };
}

async function postXunji<T>(
  endpoint: string,
  payload: Record<string, unknown>,
  apiKey: string
): Promise<T> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Accept-Encoding": "gzip",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`训记接口返回非 JSON (${res.status}): ${text.slice(0, 160)}`);
  }

  if (!res.ok) {
    throw new Error(
      `训记接口请求失败 (${res.status}): ${JSON.stringify(parsed).slice(0, 200)}`
    );
  }

  const obj = parsed as { res?: unknown };
  if (typeof obj?.res === "string") {
    throw new Error(`训记接口返回提示：${obj.res}`);
  }

  return parsed as T;
}

export function parseXunjiWorkouts(rawTrains: XunjiRawTrain[]): {
  workouts: XunjiWorkoutSummary[];
  totalVolume: number;
} {
  let grandTotalVolume = 0;

  const workouts: XunjiWorkoutSummary[] = rawTrains.map((train, idx) => {
    let trainVolume = 0;
    const movements: XunjiMovementSummary[] = (train.movements ?? []).map(
      (move) => {
        const sets = move.sets ?? [];
        let moveVolume = 0;
        let doneSets = 0;
        let maxWeight = 0;
        let unit = "kg";

        for (const s of sets) {
          if (s.unit) unit = s.unit;
          const isDone = s.done !== false;
          if (isDone) doneSets += 1;

          const w = Number(s.weight);
          const r = Number(s.reps);
          if (Number.isFinite(w) && w > maxWeight) {
            maxWeight = w;
          }
          if (isDone && Number.isFinite(w) && Number.isFinite(r) && w > 0 && r > 0) {
            moveVolume += w * r;
          }
        }

        trainVolume += moveVolume;
        return {
          name: move.name || "未命名动作",
          sets: sets.length,
          doneSets,
          maxWeight: Number(maxWeight.toFixed(1)),
          volume: Math.round(moveVolume),
          unit,
        };
      }
    );

    grandTotalVolume += trainVolume;

    const startTs = train.started_at ?? train.start;
    const endTs = train.ended_at ?? train.end;
    const durationMinutes =
      startTs && endTs && endTs > startTs
        ? Math.max(1, Math.round((endTs - startTs) / 60_000))
        : null;

    return {
      localId: String(train.localid ?? idx),
      title: train.title || "力量训练",
      durationMinutes,
      totalVolume: Math.round(trainVolume),
      movements,
    };
  });

  return {
    workouts,
    totalVolume: Math.round(grandTotalVolume),
  };
}

export async function fetchXunjiDayWorkouts(
  dateStr: string,
  userId = DEFAULT_USER_ID
) {
  const { apiKey } = await getXunjiApiKeyForUser(userId);
  if (!apiKey) {
    throw new Error(
      "尚未配置你的训记 Open API Key，请点右上角「连接」填写个人训记 Key"
    );
  }

  const data = await postXunji<{ res?: { trains?: XunjiRawTrain[] } }>(
    XUNJI_TRAINS_URL,
    {
      schema_version: "train_open_api_v2",
      datestr: dateStr,
      include_full_data: true,
    },
    apiKey
  );

  const trains = Array.isArray(data?.res?.trains) ? data.res.trains : [];
  return parseXunjiWorkouts(trains);
}

function formatTargetSummary(sets: XunjiPlanTargetSet[] | undefined): string {
  if (!sets || sets.length === 0) return "按计划完成";
  const working = sets.filter((s) => s.set_type !== "warmup");
  const list = working.length > 0 ? working : sets;
  const count = list.length;
  const first = list[0];

  const parts: string[] = [`${count}组`];
  if (first?.reps) {
    parts.push(`${first.reps}次`);
  } else if (first?.duration_seconds) {
    parts.push(`${first.duration_seconds}秒`);
  }
  if (first?.weight) {
    parts.push(`${first.weight}${first.unit || "kg"}`);
  }
  return parts.join(" · ");
}

export async function syncXunjiPlansToCache(
  userId = DEFAULT_USER_ID
): Promise<number> {
  const { apiKey } = await getXunjiApiKeyForUser(userId);
  if (!apiKey) {
    throw new Error("尚未配置个人训记 Open API Key");
  }

  const listResp = await postXunji<{ res?: { plans?: XunjiPlanMeta[] } }>(
    XUNJI_PLAN_URL,
    {
      schema_version: "plan_open_api_v1",
      action: "list",
    },
    apiKey
  );

  const plans = listResp?.res?.plans ?? [];
  // 优先同步进行中计划，最多同步最近 3 个计划，减少 API 调用量
  const prioritized = [...plans]
    .sort((a, b) => {
      const aActive = a.status === "active" || a.status === "ongoing" ? 0 : 1;
      const bActive = b.status === "active" || b.status === "ongoing" ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;
      return (b.end_date ?? "").localeCompare(a.end_date ?? "");
    })
    .slice(0, 3);

  let synced = 0;
  for (const plan of prioritized) {
    if (!plan.start_date || !plan.end_date) continue;
    const detail = await postXunji<{ res?: XunjiPlanDetailRes }>(
      XUNJI_PLAN_URL,
      {
        schema_version: "plan_open_api_v1",
        action: "get",
        plan_ref: plan.plan_ref,
        start_date: plan.start_date,
        end_date: plan.end_date,
        include_movements: true,
      },
      apiKey
    );

    if (detail?.res) {
      await prisma.xunjiPlanCache.upsert({
        where: { userId_planRef: { userId, planRef: plan.plan_ref } },
        update: {
          title: plan.title,
          status: plan.status,
          startDate: plan.start_date,
          endDate: plan.end_date,
          rawJson: JSON.stringify(detail.res),
          syncedAt: new Date(),
        },
        create: {
          userId,
          planRef: plan.plan_ref,
          title: plan.title,
          status: plan.status,
          startDate: plan.start_date,
          endDate: plan.end_date,
          rawJson: JSON.stringify(detail.res),
          syncedAt: new Date(),
        },
      });
      synced += 1;
    }
  }

  return synced;
}

export async function lookupXunjiPlanForDate(
  dateStr: string,
  userId = DEFAULT_USER_ID
): Promise<{
  planTitle: string;
  planItems: PlanExerciseItem[];
} | null> {
  const cachedPlans = await prisma.xunjiPlanCache.findMany({
    where: { userId },
    orderBy: { syncedAt: "desc" },
  });

  for (const cache of cachedPlans) {
    const parsed = safeJsonParse<XunjiPlanDetailRes | null>(cache.rawJson, null);
    const day = parsed?.days?.find((d) => d.datestr === dateStr);
    if (!day) continue;

    if (day.day_type === "rest" || !day.workout) {
      return {
        planTitle: `${cache.title} · 休息日`,
        planItems: [],
      };
    }

    const workoutName = day.workout.name
      ? `${cache.title} · ${day.workout.name}`
      : cache.title;
    const isCompleted = day.completion_status === "completed";
    const items: PlanExerciseItem[] = (day.workout.movements ?? []).map(
      (move, idx) => ({
        id: `xunji-${dateStr}-${idx}`,
        name: move.name,
        target: formatTargetSummary(move.target_sets),
        done: isCompleted,
      })
    );

    return {
      planTitle: workoutName,
      planItems: items,
    };
  }

  return null;
}
