"use client";

import { useState } from "react";
import { Check, Loader2, Moon, RefreshCw, Scale } from "lucide-react";
import { formatSleepMinutes, formatTimeHHMM } from "@/lib/date";
import type { DailyLogDTO } from "@/types/fitness";

interface VitalsRowProps {
  daily: DailyLogDTO;
  whoopConnected: boolean;
  onDailyUpdated: (daily: DailyLogDTO) => void;
  onSyncWhoop: () => Promise<void>;
  syncingWhoop: boolean;
  onNotice: (text: string, isError?: boolean) => void;
}

const SOURCE_LABELS: Record<string, string> = {
  whoop: "WHOOP",
  apple_watch: "Watch",
  manual: "手动",
};

export function VitalsRow({
  daily,
  whoopConnected,
  onDailyUpdated,
  onSyncWhoop,
  syncingWhoop,
  onNotice,
}: VitalsRowProps) {
  // 体重编辑态
  const [editingWeight, setEditingWeight] = useState(false);
  const [weightInput, setWeightInput] = useState("");
  const [savingWeight, setSavingWeight] = useState(false);

  // 睡眠编辑态
  const [editingSleep, setEditingSleep] = useState(false);
  const [sleepHours, setSleepHours] = useState("");
  const [sleepMins, setSleepMins] = useState("");
  const [sleepStart, setSleepStart] = useState("");
  const [sleepEnd, setSleepEnd] = useState("");
  const [savingSleep, setSavingSleep] = useState(false);

  const openWeightEdit = () => {
    const initial = daily.weightKg ?? daily.latestWeightKg;
    setWeightInput(initial !== null ? String(initial) : "");
    setEditingWeight(true);
  };

  const saveWeight = async (e: React.FormEvent) => {
    e.preventDefault();
    const num = Number(weightInput);
    if (!Number.isFinite(num) || num < 20 || num > 300) {
      onNotice("请输入有效体重（20~300 kg）", true);
      return;
    }

    setSavingWeight(true);
    try {
      const res = await fetch("/api/daily", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: daily.date, weightKg: num }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "保存体重失败");
      onDailyUpdated(data.daily);
      setEditingWeight(false);
    } catch (err) {
      onNotice(err instanceof Error ? err.message : "保存体重失败", true);
    } finally {
      setSavingWeight(false);
    }
  };

  const openSleepEdit = () => {
    const total = daily.sleepMinutes ?? 450;
    setSleepHours(String(Math.floor(total / 60)));
    setSleepMins(String(total % 60));
    setSleepStart(formatTimeHHMM(daily.sleepStart) ?? "");
    setSleepEnd(formatTimeHHMM(daily.sleepEnd) ?? "");
    setEditingSleep(true);
  };

  const saveSleep = async (e: React.FormEvent) => {
    e.preventDefault();
    const h = Number(sleepHours || 0);
    const m = Number(sleepMins || 0);
    const total = Math.round(h * 60 + m);
    if (!Number.isFinite(total) || total < 0 || total > 1440) {
      onNotice("请输入有效的睡眠时长", true);
      return;
    }

    setSavingSleep(true);
    try {
      const res = await fetch("/api/daily", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: daily.date,
          sleepMinutes: total,
          sleepStart: sleepStart.trim() || null,
          sleepEnd: sleepEnd.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "保存睡眠失败");
      onDailyUpdated(data.daily);
      setEditingSleep(false);
    } catch (err) {
      onNotice(err instanceof Error ? err.message : "保存睡眠失败", true);
    } finally {
      setSavingSleep(false);
    }
  };

  const startLabel = formatTimeHHMM(daily.sleepStart);
  const endLabel = formatTimeHHMM(daily.sleepEnd);

  return (
    <section className="grid grid-cols-2 gap-3">
      {/* 体重卡片 */}
      <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/70 p-3.5">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs text-zinc-400">
            <Scale className="h-3.5 w-3.5 text-zinc-400" />
            <span>体重</span>
          </div>
          {daily.weightSource && (
            <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">
              {SOURCE_LABELS[daily.weightSource] ?? daily.weightSource}
            </span>
          )}
        </div>

        {!editingWeight ? (
          <button
            type="button"
            onClick={openWeightEdit}
            className="flex w-full flex-col items-start text-left transition active:opacity-75"
          >
            <div className="tabular-nums flex items-baseline gap-1">
              <span className="text-2xl font-semibold text-zinc-50">
                {daily.weightKg !== null ? daily.weightKg.toFixed(1) : "--"}
              </span>
              <span className="text-xs text-zinc-500">kg</span>
            </div>
            <p className="mt-1 text-[11px] text-zinc-500">
              {daily.weightKg !== null
                ? "点击修改"
                : daily.latestWeightKg !== null
                  ? `上次 ${daily.latestWeightKg.toFixed(1)} kg · 点击记录`
                  : "点击记录今日体重"}
            </p>
          </button>
        ) : (
          <form onSubmit={saveWeight} className="space-y-2">
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                step="0.1"
                inputMode="decimal"
                autoFocus
                value={weightInput}
                onChange={(e) => setWeightInput(e.target.value)}
                placeholder="70.0"
                className="h-10 min-w-0 flex-1 rounded-xl border border-zinc-700 bg-zinc-950 px-2.5 text-sm text-zinc-100 focus:border-emerald-500/60 focus:outline-none"
              />
              <button
                type="submit"
                disabled={savingWeight}
                aria-label="保存体重"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500 text-zinc-950"
              >
                {savingWeight ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
              </button>
            </div>
            <button
              type="button"
              onClick={() => setEditingWeight(false)}
              className="text-[11px] text-zinc-500 hover:text-zinc-300"
            >
              取消
            </button>
          </form>
        )}
      </div>

      {/* 睡眠时间卡片 */}
      <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/70 p-3.5">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs text-zinc-400">
            <Moon className="h-3.5 w-3.5 text-indigo-400" />
            <span>睡眠时间</span>
          </div>
          <div className="flex items-center gap-1">
            {daily.sleepSource && (
              <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">
                {SOURCE_LABELS[daily.sleepSource] ?? daily.sleepSource}
              </span>
            )}
            {whoopConnected && (
              <button
                type="button"
                onClick={onSyncWhoop}
                disabled={syncingWhoop}
                title="从 WHOOP 同步睡眠与消耗"
                aria-label="从 WHOOP 同步睡眠"
                className="flex h-6 w-6 items-center justify-center rounded-md text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-100"
              >
                <RefreshCw
                  className={`h-3 w-3 ${syncingWhoop ? "animate-spin" : ""}`}
                />
              </button>
            )}
          </div>
        </div>

        {!editingSleep ? (
          <button
            type="button"
            onClick={openSleepEdit}
            className="flex w-full flex-col items-start text-left transition active:opacity-75"
          >
            <div className="tabular-nums text-2xl font-semibold text-zinc-50">
              {formatSleepMinutes(daily.sleepMinutes)}
            </div>
            <p className="tabular-nums mt-1 truncate text-[11px] text-zinc-500">
              {startLabel && endLabel
                ? `${startLabel} - ${endLabel}${
                    daily.recoveryScore !== null
                      ? ` · 恢复 ${Math.round(daily.recoveryScore)}%`
                      : ""
                  }`
                : daily.recoveryScore !== null
                  ? `WHOOP 恢复 ${Math.round(daily.recoveryScore)}%`
                  : "点击记录睡眠"}
            </p>
          </button>
        ) : (
          <form onSubmit={saveSleep} className="space-y-2">
            <div className="flex items-center gap-1">
              <input
                type="number"
                min="0"
                max="24"
                inputMode="numeric"
                autoFocus
                value={sleepHours}
                onChange={(e) => setSleepHours(e.target.value)}
                placeholder="7"
                className="h-9 w-12 rounded-lg border border-zinc-700 bg-zinc-950 px-2 text-center text-sm text-zinc-100 focus:border-indigo-400 focus:outline-none"
              />
              <span className="text-xs text-zinc-500">h</span>
              <input
                type="number"
                min="0"
                max="59"
                inputMode="numeric"
                value={sleepMins}
                onChange={(e) => setSleepMins(e.target.value)}
                placeholder="30"
                className="h-9 w-12 rounded-lg border border-zinc-700 bg-zinc-950 px-2 text-center text-sm text-zinc-100 focus:border-indigo-400 focus:outline-none"
              />
              <span className="text-xs text-zinc-500">m</span>
            </div>
            <div className="flex items-center gap-1">
              <input
                type="time"
                value={sleepStart}
                onChange={(e) => setSleepStart(e.target.value)}
                aria-label="入睡时间"
                className="h-8 min-w-0 flex-1 rounded-lg border border-zinc-800 bg-zinc-950 px-1.5 text-[11px] text-zinc-300 focus:outline-none"
              />
              <span className="text-[10px] text-zinc-600">-</span>
              <input
                type="time"
                value={sleepEnd}
                onChange={(e) => setSleepEnd(e.target.value)}
                aria-label="起床时间"
                className="h-8 min-w-0 flex-1 rounded-lg border border-zinc-800 bg-zinc-950 px-1.5 text-[11px] text-zinc-300 focus:outline-none"
              />
            </div>
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setEditingSleep(false)}
                className="text-[11px] text-zinc-500 hover:text-zinc-300"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={savingSleep}
                className="flex items-center gap-1 rounded-lg bg-indigo-500 px-2.5 py-1 text-xs font-medium text-white"
              >
                {savingSleep && <Loader2 className="h-3 w-3 animate-spin" />}
                <span>保存</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
