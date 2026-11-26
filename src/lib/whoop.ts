import { prisma } from "@/lib/prisma";
import { DEFAULT_USER_ID, ensureDailyLog } from "@/lib/daily-log";
import { addDays } from "@/lib/date";

export const WHOOP_AUTH_URL = "https://api.prod.whoop.com/oauth/oauth2/auth";
export const WHOOP_TOKEN_URL = "https://api.prod.whoop.com/oauth/oauth2/token";
export const WHOOP_API_BASE = "https://api.prod.whoop.com/developer/v2";

export const WHOOP_SCOPES = [
  "offline",
  "read:sleep",
  "read:cycles",
  "read:recovery",
  "read:workout",
  "read:body_measurement",
  "read:profile",
].join(" ");

interface WhoopTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
  token_type?: string;
}

interface WhoopSleepRecord {
  id: string;
  cycle_id?: number;
  start: string;
  end: string;
  timezone_offset?: string;
  nap?: boolean;
  score_state?: string;
  score?: {
    sleep_performance_percentage?: number;
    stage_summary?: {
      total_in_bed_time_milli?: number;
      total_awake_time_milli?: number;
      total_light_sleep_time_milli?: number;
      total_slow_wave_sleep_time_milli?: number;
      total_rem_sleep_time_milli?: number;
    };
  };
}

interface WhoopCycleRecord {
  id: number;
  start: string;
  end?: string | null;
  timezone_offset?: string;
  score_state?: string;
  score?: {
    strain?: number;
    kilojoule?: number;
    average_heart_rate?: number;
    max_heart_rate?: number;
  };
}

interface WhoopRecoveryRecord {
  cycle_id: number;
  sleep_id?: string;
  score_state?: string;
  score?: {
    recovery_score?: number;
    resting_heart_rate?: number;
    hrv_rmssd_milli?: number;
  };
}

interface WhoopBodyMeasurement {
  height_meter?: number;
  weight_kilogram?: number;
  max_heart_rate?: number;
}

export function getWhoopConfig(originOverride?: string) {
  const clientId = process.env.WHOOP_CLIENT_ID?.trim() || "";
  const clientSecret = process.env.WHOOP_CLIENT_SECRET?.trim() || "";
  const baseOrigin =
    originOverride?.replace(/\/+$/, "") ||
    process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, "") ||
    "http://localhost:3000";
  const redirectUri =
    process.env.WHOOP_REDIRECT_URI?.trim() || `${baseOrigin}/api/whoop/callback`;

  return { clientId, clientSecret, redirectUri };
}

export function isWhoopConfigured(): boolean {
  const { clientId, clientSecret } = getWhoopConfig();
  return Boolean(clientId && clientSecret);
}

export function buildWhoopAuthUrl(
  state: string,
  originOverride?: string
): string {
  const { clientId, redirectUri } = getWhoopConfig(originOverride);
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: WHOOP_SCOPES,
    state,
  });
  return `${WHOOP_AUTH_URL}?${params.toString()}`;
}

export async function exchangeWhoopCode(
  code: string,
  userId = DEFAULT_USER_ID,
  originOverride?: string
) {
  const { clientId, clientSecret, redirectUri } = getWhoopConfig(originOverride);
  if (!clientId || !clientSecret) {
    throw new Error("未配置 WHOOP_CLIENT_ID 或 WHOOP_CLIENT_SECRET");
  }

  const form = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
  });

  const res = await fetch(WHOOP_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
    cache: "no-store",
  });

  const data = (await res.json()) as WhoopTokenResponse & {
    error_description?: string;
    error?: string;
  };

  if (!res.ok || !data.access_token) {
    throw new Error(
      data.error_description || data.error || `WHOOP 换取令牌失败 (${res.status})`
    );
  }

  const expiresAt = new Date(Date.now() + (data.expires_in || 3600) * 1000);

  return prisma.wearableConnection.upsert({
    where: { userId_provider: { userId, provider: "whoop" } },
    update: {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? undefined,
      expiresAt,
      scope: data.scope ?? WHOOP_SCOPES,
    },
    create: {
      userId,
      provider: "whoop",
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? null,
      expiresAt,
      scope: data.scope ?? WHOOP_SCOPES,
    },
  });
}

async function refreshWhoopToken(
  refreshToken: string,
  userId = DEFAULT_USER_ID
): Promise<string> {
  const { clientId, clientSecret } = getWhoopConfig();
  if (!clientId || !clientSecret) {
    throw new Error("未配置 WHOOP_CLIENT_ID / WHOOP_CLIENT_SECRET");
  }

  const form = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    scope: "offline",
  });

  const res = await fetch(WHOOP_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
    cache: "no-store",
  });

  const data = (await res.json()) as WhoopTokenResponse & {
    error_description?: string;
    error?: string;
  };

  if (!res.ok || !data.access_token) {
    throw new Error(
      data.error_description || "WHOOP 登录状态已过期，请重新连接 WHOOP"
    );
  }

  const expiresAt = new Date(Date.now() + (data.expires_in || 3600) * 1000);
  await prisma.wearableConnection.update({
    where: { userId_provider: { userId, provider: "whoop" } },
    data: {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? refreshToken,
      expiresAt,
      scope: data.scope ?? undefined,
    },
  });

  return data.access_token;
}

export async function getValidWhoopAccessToken(
  userId = DEFAULT_USER_ID
): Promise<string> {
  const conn = await prisma.wearableConnection.findUnique({
    where: { userId_provider: { userId, provider: "whoop" } },
  });

  if (!conn?.accessToken) {
    throw new Error("尚未连接 WHOOP 账号，请在右上角“设备连接”中完成 OAuth 授权");
  }

  const needsRefresh =
    conn.expiresAt && conn.expiresAt.getTime() - Date.now() < 120_000;

  if (needsRefresh) {
    if (!conn.refreshToken) {
      throw new Error("WHOOP 访问令牌已过期且无刷新令牌，请重新连接 WHOOP");
    }
    return refreshWhoopToken(conn.refreshToken, userId);
  }

  return conn.accessToken;
}

async function fetchWhoopJson<T>(path: string, accessToken: string): Promise<T> {
  const res = await fetch(`${WHOOP_API_BASE}${path}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`WHOOP API 请求失败 (${res.status}): ${text.slice(0, 160)}`);
  }

  return (await res.json()) as T;
}

async function fetchWhoopCollection<T>(
  path: string,
  baseParams: Record<string, string>,
  accessToken: string,
  maxPages = 4
): Promise<T[]> {
  const all: T[] = [];
  let nextToken: string | null | undefined = undefined;

  for (let page = 0; page < maxPages; page += 1) {
    const params = new URLSearchParams(baseParams);
    if (nextToken) {
      params.set("nextToken", nextToken);
    }
    const res = await fetchWhoopJson<{
      records?: T[];
      next_token?: string | null;
    }>(`${path}?${params.toString()}`, accessToken);

    if (res.records?.length) {
      all.push(...res.records);
    }
    if (!res.next_token) break;
    nextToken = res.next_token;
  }

  return all;
}

// 优先解析 WHOOP 记录自带的 timezone_offset（如 "Z"、"+08:00"、"-05:00"），转换为与 JS Date.getTimezoneOffset() 一致的分钟偏移
function resolveTimezoneOffsetMinutes(
  recordTzOffset: string | undefined,
  fallbackJsTzOffset: number
): number {
  if (!recordTzOffset) return fallbackJsTzOffset;
  const trimmed = recordTzOffset.trim();
  if (trimmed === "Z" || trimmed === "z") return 0;
  const match = /^([+-])(\d{2}):?(\d{2})$/.exec(trimmed);
  if (!match) return fallbackJsTzOffset;
  const sign = match[1] === "+" ? 1 : -1;
  const hours = Number(match[2]);
  const minutes = Number(match[3]);
  // ISO +08:00 对应 JS getTimezoneOffset() = -480
  return -sign * (hours * 60 + minutes);
}

// 将 ISO 时间按时区偏移（同 JS Date.getTimezoneOffset()）换算为本地 YYYY-MM-DD、HH:mm 及小时数
function toLocalDateAndHHMM(
  isoString: string,
  tzOffsetMinutes: number
): { date: string; hhmm: string; hour: number } {
  const utcMs = new Date(isoString).getTime();
  const localMs = utcMs - tzOffsetMinutes * 60_000;
  const shifted = new Date(localMs);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  const hour = shifted.getUTCHours();
  const hh = String(hour).padStart(2, "0");
  const mm = String(shifted.getUTCMinutes()).padStart(2, "0");
  return {
    date: `${year}-${month}-${day}`,
    hhmm: `${hh}:${mm}`,
    hour,
  };
}

function calcSleepMinutes(record: WhoopSleepRecord): number | null {
  const stages = record.score?.stage_summary;
  if (stages) {
    const light = stages.total_light_sleep_time_milli ?? 0;
    const sws = stages.total_slow_wave_sleep_time_milli ?? 0;
    const rem = stages.total_rem_sleep_time_milli ?? 0;
    if (light + sws + rem > 0) {
      return Math.round((light + sws + rem) / 60_000);
    }
    if (stages.total_in_bed_time_milli !== undefined) {
      const awake = stages.total_awake_time_milli ?? 0;
      return Math.max(
        0,
        Math.round((stages.total_in_bed_time_milli - awake) / 60_000)
      );
    }
  }
  const diff = new Date(record.end).getTime() - new Date(record.start).getTime();
  if (Number.isFinite(diff) && diff > 0) {
    return Math.round(diff / 60_000);
  }
  return null;
}

export async function syncWhoopRange(params: {
  anchorDate: string;
  daysBack?: number;
  timezoneOffsetMinutes?: number;
  syncBodyWeight?: boolean;
  userId?: string;
}) {
  const userId = params.userId ?? DEFAULT_USER_ID;
  const daysBack = Math.min(Math.max(params.daysBack ?? 7, 1), 30);
  const tzOffset = params.timezoneOffsetMinutes ?? 0;

  const accessToken = await getValidWhoopAccessToken(userId);

  // 拉取范围往前多留 1 天缓冲，覆盖跨午夜早睡周期（如前晚 22:25 入睡但归属次日）及主睡眠关联
  const startDate = addDays(params.anchorDate, -daysBack);
  const fetchStartDate = addDays(startDate, -1);
  const endDate = addDays(params.anchorDate, 2);

  const rangeQuery = {
    start: `${fetchStartDate}T00:00:00.000Z`,
    end: `${endDate}T23:59:59.999Z`,
    limit: "25",
  };

  const [sleepRecords, cycleRecords, recoveryRecords, bodyRes] =
    await Promise.all([
      fetchWhoopCollection<WhoopSleepRecord>(
        "/activity/sleep",
        rangeQuery,
        accessToken
      ),
      fetchWhoopCollection<WhoopCycleRecord>(
        "/cycle",
        rangeQuery,
        accessToken
      ),
      fetchWhoopCollection<WhoopRecoveryRecord>(
        "/recovery",
        rangeQuery,
        accessToken
      ).catch(() => [] as WhoopRecoveryRecord[]),
      params.syncBodyWeight
        ? fetchWhoopJson<WhoopBodyMeasurement>(
            "/user/measurement/body",
            accessToken
          ).catch(() => null)
        : Promise.resolve(null),
    ]);

  const recoveryByCycleId = new Map<number, WhoopRecoveryRecord>();
  const recoveryBySleepId = new Map<string, WhoopRecoveryRecord>();
  for (const rec of recoveryRecords) {
    recoveryByCycleId.set(rec.cycle_id, rec);
    if (rec.sleep_id) recoveryBySleepId.set(rec.sleep_id, rec);
  }

  // 每个 cycle 保留时长最长的一条主睡眠（排除午睡 nap）
  const mainSleepByCycleId = new Map<number, WhoopSleepRecord>();
  const orphanMainSleeps: WhoopSleepRecord[] = [];
  for (const sleep of sleepRecords) {
    if (sleep.nap) continue;
    if (sleep.cycle_id === undefined) {
      orphanMainSleeps.push(sleep);
      continue;
    }
    const existing = mainSleepByCycleId.get(sleep.cycle_id);
    if (
      !existing ||
      (calcSleepMinutes(sleep) ?? 0) > (calcSleepMinutes(existing) ?? 0)
    ) {
      mainSleepByCycleId.set(sleep.cycle_id, sleep);
    }
  }

  // 同一天若有多条主睡眠，保留时长最长的那条；同时记录每个 cycle_id 的权威归属日期（主睡眠醒来日）
  const mainSleepByDate = new Map<
    string,
    {
      sleep: WhoopSleepRecord;
      minutes: number | null;
      startHHMM: string;
      endHHMM: string;
    }
  >();
  const cycleIdToDate = new Map<number, string>();

  const allMainSleeps = [...mainSleepByCycleId.values(), ...orphanMainSleeps];
  for (const sleep of allMainSleeps) {
    const sleepTz = resolveTimezoneOffsetMinutes(sleep.timezone_offset, tzOffset);
    const endLocal = toLocalDateAndHHMM(sleep.end, sleepTz);
    const startLocal = toLocalDateAndHHMM(sleep.start, sleepTz);
    const sleepMinutes = calcSleepMinutes(sleep);

    if (sleep.cycle_id !== undefined) {
      cycleIdToDate.set(sleep.cycle_id, endLocal.date);
    }

    const prev = mainSleepByDate.get(endLocal.date);
    if (!prev || (sleepMinutes ?? 0) >= (prev.minutes ?? 0)) {
      mainSleepByDate.set(endLocal.date, {
        sleep,
        minutes: sleepMinutes,
        startHHMM: startLocal.hhmm,
        endHHMM: endLocal.hhmm,
      });
    }
  }

  const touchedDates = new Set<string>();
  const datesBoundBySleepCycle = new Set<string>();

  // 1. 写入主睡眠（按醒来日期归属到当天）
  for (const [date, entry] of mainSleepByDate.entries()) {
    // 跳过为了边界补齐而多提前 1 天拉取到的历史记录
    if (date < startDate) continue;

    const { sleep, minutes, startHHMM, endHHMM } = entry;
    const rec =
      recoveryBySleepId.get(sleep.id) ??
      (sleep.cycle_id !== undefined
        ? recoveryByCycleId.get(sleep.cycle_id)
        : undefined);

    await ensureDailyLog(date, userId);
    await prisma.dailyLog.update({
      where: { userId_date: { userId, date } },
      data: {
        sleepMinutes: minutes ?? undefined,
        sleepStart: startHHMM,
        sleepEnd: endHHMM,
        sleepPerformance:
          sleep.score?.sleep_performance_percentage !== undefined
            ? Number(sleep.score.sleep_performance_percentage.toFixed(1))
            : undefined,
        sleepSource: "whoop",
        recoveryScore:
          rec?.score?.recovery_score !== undefined
            ? Number(rec.score.recovery_score.toFixed(1))
            : undefined,
        hrvMs:
          rec?.score?.hrv_rmssd_milli !== undefined
            ? Number(rec.score.hrv_rmssd_milli.toFixed(1))
            : undefined,
        restingHr:
          rec?.score?.resting_heart_rate !== undefined
            ? Math.round(rec.score.resting_heart_rate)
            : undefined,
        wearableSource: "whoop",
        wearableSyncedAt: new Date(),
      },
    });
    touchedDates.add(date);
    if (sleep.cycle_id !== undefined) {
      datesBoundBySleepCycle.add(date);
    }
  }

  // 2. 写入 Cycle 消耗与 Strain（kilojoule / 4.184 = kcal）
  // WHOOP 生理周期从前一晚入睡开始、到次日晚间入睡结束（end 往往落在次日凌晨）。
  // 绝不能用 cycle.end 归属日期（会导致昨天周期覆盖今天），应严格通过 cycle_id 对齐其主睡眠醒来日。
  const sortedCycles = [...cycleRecords].sort(
    (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
  );

  let syncedCycleCount = 0;
  for (const cycle of sortedCycles) {
    const matchedDate = cycleIdToDate.get(cycle.id);
    let targetDate: string;

    if (matchedDate) {
      targetDate = matchedDate;
    } else {
      // 无主睡眠关联的周期：根据开始时刻推断归属日期（晚 18:00 后入睡的周期归属次日）
      const cycleTz = resolveTimezoneOffsetMinutes(
        cycle.timezone_offset,
        tzOffset
      );
      const startLocal = toLocalDateAndHHMM(cycle.start, cycleTz);
      targetDate =
        startLocal.hour >= 18 ? addDays(startLocal.date, 1) : startLocal.date;

      // 避免无主睡眠的孤立周期覆盖已有精确主睡眠绑定的当天数据
      if (datesBoundBySleepCycle.has(targetDate)) {
        continue;
      }
    }

    if (targetDate < startDate) continue;

    const kcal =
      cycle.score?.kilojoule !== undefined
        ? Math.round(cycle.score.kilojoule / 4.184)
        : undefined;
    const strain =
      cycle.score?.strain !== undefined
        ? Number(cycle.score.strain.toFixed(1))
        : undefined;
    const rec = recoveryByCycleId.get(cycle.id);

    await ensureDailyLog(targetDate, userId);
    await prisma.dailyLog.update({
      where: { userId_date: { userId, date: targetDate } },
      data: {
        totalBurnKcal: kcal,
        strainScore: strain,
        recoveryScore:
          rec?.score?.recovery_score !== undefined
            ? Number(rec.score.recovery_score.toFixed(1))
            : undefined,
        hrvMs:
          rec?.score?.hrv_rmssd_milli !== undefined
            ? Number(rec.score.hrv_rmssd_milli.toFixed(1))
            : undefined,
        restingHr:
          rec?.score?.resting_heart_rate !== undefined
            ? Math.round(rec.score.resting_heart_rate)
            : undefined,
        wearableSource: "whoop",
        wearableSyncedAt: new Date(),
      },
    });
    touchedDates.add(targetDate);
    syncedCycleCount += 1;
  }

  // 3. 可选同步身体体重（仅当当天无手动体重记录时填充）
  if (bodyRes?.weight_kilogram) {
    const existing = await ensureDailyLog(params.anchorDate, userId);
    if (existing.weightKg === null || existing.weightSource === "whoop") {
      await prisma.dailyLog.update({
        where: { userId_date: { userId, date: params.anchorDate } },
        data: {
          weightKg: Number(bodyRes.weight_kilogram.toFixed(1)),
          weightSource: "whoop",
        },
      });
      touchedDates.add(params.anchorDate);
    }
  }

  await prisma.wearableConnection.update({
    where: { userId_provider: { userId, provider: "whoop" } },
    data: { lastSyncedAt: new Date() },
  });

  return {
    syncedDays: touchedDates.size,
    sleepCount: [...mainSleepByDate.keys()].filter((d) => d >= startDate).length,
    cycleCount: syncedCycleCount,
  };
}
