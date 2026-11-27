"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { CalendarCard } from "@/components/CalendarCard";
import { DietCard } from "@/components/DietCard";
import { VitalsRow } from "@/components/VitalsRow";
import { WorkoutPlanCard } from "@/components/WorkoutPlanCard";
import { ConnectionsDrawer } from "@/components/ConnectionsDrawer";
import { formatLocalDate } from "@/lib/date";
import type {
  CalendarDayMarker,
  DailyLogDTO,
  IntegrationStatusDTO,
} from "@/types/fitness";

interface FitLogAppProps {
  initialDaily: DailyLogDTO;
  initialMarkers: CalendarDayMarker[];
  initialStatus: IntegrationStatusDTO;
  initialNotice?: { text: string; isError?: boolean } | null;
}

function indexMarkers(list: CalendarDayMarker[]): Record<string, CalendarDayMarker> {
  const map: Record<string, CalendarDayMarker> = {};
  for (const item of list) {
    map[item.date] = item;
  }
  return map;
}

function formatHeaderDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  return `${m}月${d}日 · ${weekdays[dt.getDay()]}`;
}

export function FitLogApp({
  initialDaily,
  initialMarkers,
  initialStatus,
  initialNotice = null,
}: FitLogAppProps) {
  const [selectedDate, setSelectedDate] = useState(initialDaily.date);
  const [daily, setDaily] = useState<DailyLogDTO>(initialDaily);
  const [markers, setMarkers] = useState<Record<string, CalendarDayMarker>>(() =>
    indexMarkers(initialMarkers)
  );
  const [status, setStatus] = useState<IntegrationStatusDTO>(initialStatus);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [syncingWhoop, setSyncingWhoop] = useState(false);
  const [loadingDate, setLoadingDate] = useState(false);
  const [notice, setNotice] = useState<{ text: string; isError?: boolean } | null>(
    initialNotice
  );

  const showNotice = useCallback((text: string, isError = false) => {
    setNotice({ text, isError });
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 3600);
    return () => clearTimeout(timer);
  }, [notice]);

  const refreshStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/integrations/status", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setStatus(data.status);
      }
    } catch {
      // ignore
    }
  }, []);

  // 清理地址栏里的 OAuth / 空间同步回调 query 参数
  useEffect(() => {
    if (
      window.location.search.includes("whoop=") ||
      window.location.search.includes("space=")
    ) {
      window.history.replaceState({}, "", "/");
    }
  }, []);

  const fetchCalendarMonth = useCallback(async (month: string) => {
    try {
      const res = await fetch(`/api/calendar?month=${month}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = await res.json();
      setMarkers((prev) => ({ ...prev, ...indexMarkers(data.markers ?? []) }));
    } catch {
      // ignore
    }
  }, []);

  const updateMarkerFromDaily = useCallback((nextDaily: DailyLogDTO) => {
    setMarkers((prev) => ({
      ...prev,
      [nextDaily.date]: {
        date: nextDaily.date,
        hasMeals: nextDaily.meals.length > 0,
        hasWorkoutOrPlan:
          Boolean(nextDaily.planTitle) ||
          nextDaily.planItems.length > 0 ||
          nextDaily.workouts.length > 0,
        hasWeight: nextDaily.weightKg !== null,
        hasSleep: nextDaily.sleepMinutes !== null,
        calories: nextDaily.totals.calories,
      },
    }));
  }, []);

  const handleDailyUpdated = useCallback(
    (nextDaily: DailyLogDTO) => {
      setDaily(nextDaily);
      updateMarkerFromDaily(nextDaily);
    },
    [updateMarkerFromDaily]
  );

  const handleSelectDate = useCallback(
    async (dateStr: string) => {
      setSelectedDate(dateStr);
      setLoadingDate(true);
      try {
        const res = await fetch(`/api/daily?date=${dateStr}`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error("读取当日数据失败");
        const data = await res.json();
        setDaily(data.daily);
        updateMarkerFromDaily(data.daily);
      } catch (err) {
        showNotice(err instanceof Error ? err.message : "加载失败", true);
      } finally {
        setLoadingDate(false);
      }
    },
    [showNotice, updateMarkerFromDaily]
  );

  const autoSyncingRef = useRef(false);
  const lastAutoSyncAttemptRef = useRef(0);

  const handleSyncWhoop = useCallback(
    async (syncBodyWeight = false, silent = false) => {
      if (autoSyncingRef.current) return;
      autoSyncingRef.current = true;
      setSyncingWhoop(true);
      try {
        const res = await fetch("/api/whoop/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            date: selectedDate,
            daysBack: 7,
            timezoneOffsetMinutes: new Date().getTimezoneOffset(),
            syncBodyWeight,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "同步 WHOOP 失败");
        handleDailyUpdated(data.daily);
        fetchCalendarMonth(selectedDate.slice(0, 7));
        refreshStatus();
        if (!silent) {
          showNotice(data.message || "WHOOP 数据已同步");
        }
      } catch (err) {
        showNotice(err instanceof Error ? err.message : "同步 WHOOP 失败", true);
      } finally {
        setSyncingWhoop(false);
        autoSyncingRef.current = false;
      }
    },
    [
      fetchCalendarMonth,
      handleDailyUpdated,
      refreshStatus,
      selectedDate,
      showNotice,
    ]
  );

  // 打开 App 或从后台切回前台时自动静默同步 WHOOP（今日无睡眠或距上次同步超过 30 分钟，且至少间隔 5 分钟防频刷）
  useEffect(() => {
    if (!status.whoopConnected) return;

    const maybeAutoSync = () => {
      const today = formatLocalDate();
      if (selectedDate !== today) return;

      const now = Date.now();
      if (now - lastAutoSyncAttemptRef.current < 5 * 60_000) return;

      const lastSyncedMs = status.whoopLastSyncedAt
        ? new Date(status.whoopLastSyncedAt).getTime()
        : 0;
      const isStale = !lastSyncedMs || now - lastSyncedMs > 30 * 60_000;
      const missingTodaySleep = daily.sleepMinutes === null;

      if (missingTodaySleep || isStale) {
        lastAutoSyncAttemptRef.current = now;
        void handleSyncWhoop(false, true);
      }
    };

    maybeAutoSync();

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        maybeAutoSync();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [
    daily.sleepMinutes,
    handleSyncWhoop,
    selectedDate,
    status.whoopConnected,
    status.whoopLastSyncedAt,
  ]);

  const handleDisconnectWhoop = useCallback(async () => {
    await fetch("/api/whoop/disconnect", { method: "POST" });
    await refreshStatus();
    showNotice("已断开 WHOOP 连接");
  }, [refreshStatus, showNotice]);

  return (
    <main className="safe-pt safe-pb mx-auto flex min-h-screen w-full max-w-md flex-col gap-3.5 px-4">
      {/* 极简顶栏 */}
      <header className="flex items-center justify-between pt-1">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold tracking-tight text-zinc-50">
              FitLog
            </h1>
            {loadingDate && (
              <span className="text-[11px] text-zinc-500">加载中...</span>
            )}
          </div>
          <p className="text-xs text-zinc-400">{formatHeaderDate(selectedDate)}</p>
        </div>

        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="flex h-10 items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900/80 px-3 text-xs text-zinc-300 transition hover:border-zinc-700 hover:text-zinc-100 active:scale-95"
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              status.whoopConnected ? "bg-emerald-400" : "bg-zinc-500"
            }`}
          />
          <SlidersHorizontal className="h-3.5 w-3.5" />
          <span>连接</span>
        </button>
      </header>

      {/* 轻量通知条 */}
      {notice && (
        <div
          role="status"
          className={`rounded-xl border px-3.5 py-2.5 text-xs ${
            notice.isError
              ? "border-rose-500/40 bg-rose-950/50 text-rose-200"
              : "border-emerald-500/30 bg-emerald-950/40 text-emerald-200"
          }`}
        >
          {notice.text}
        </div>
      )}

      {/* 1. 日历 */}
      <CalendarCard
        selectedDate={selectedDate}
        markers={markers}
        onSelectDate={handleSelectDate}
        onMonthChange={fetchCalendarMonth}
      />

      {/* 2. 今日饮食（Gemini 自然语言/拍照 + 手动） */}
      <DietCard
        daily={daily}
        geminiConfigured={status.geminiConfigured}
        onDailyUpdated={handleDailyUpdated}
        onNotice={showNotice}
      />

      {/* 3. 体重 & 4. 睡眠时间 */}
      <VitalsRow
        daily={daily}
        whoopConnected={status.whoopConnected}
        onDailyUpdated={handleDailyUpdated}
        onSyncWhoop={() => handleSyncWhoop(false)}
        syncingWhoop={syncingWhoop}
        onNotice={showNotice}
      />

      {/* 5. 健身计划（手动计划 + 训记同步） */}
      <WorkoutPlanCard
        daily={daily}
        xunjiConfigured={status.xunjiConfigured}
        onDailyUpdated={handleDailyUpdated}
        onNotice={showNotice}
      />

      <ConnectionsDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        status={status}
        onSyncWhoop={handleSyncWhoop}
        onDisconnectWhoop={handleDisconnectWhoop}
        onRefreshStatus={refreshStatus}
        onNotice={showNotice}
        syncingWhoop={syncingWhoop}
      />
    </main>
  );
}
