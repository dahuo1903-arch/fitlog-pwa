"use client";

import { useState } from "react";
import {
  Check,
  Dumbbell,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import type { DailyLogDTO, PlanExerciseItem } from "@/types/fitness";

interface WorkoutPlanCardProps {
  daily: DailyLogDTO;
  xunjiConfigured: boolean;
  onDailyUpdated: (daily: DailyLogDTO) => void;
  onNotice: (text: string, isError?: boolean) => void;
}

export function WorkoutPlanCard({
  daily,
  xunjiConfigured,
  onDailyUpdated,
  onNotice,
}: WorkoutPlanCardProps) {
  const [syncingXunji, setSyncingXunji] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [exerciseName, setExerciseName] = useState("");
  const [exerciseTarget, setExerciseTarget] = useState("");
  const [saving, setSaving] = useState(false);

  const patchPlan = async (payload: {
    planTitle?: string | null;
    planItems?: PlanExerciseItem[];
  }) => {
    setSaving(true);
    try {
      const res = await fetch("/api/daily", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: daily.date, ...payload }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "保存健身计划失败");
      onDailyUpdated(data.daily);
    } catch (err) {
      onNotice(err instanceof Error ? err.message : "保存失败", true);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleItem = async (id: string) => {
    const next = daily.planItems.map((item) =>
      item.id === id ? { ...item, done: !item.done } : item
    );
    await patchPlan({ planItems: next });
  };

  const handleRemoveItem = async (id: string) => {
    const next = daily.planItems.filter((item) => item.id !== id);
    await patchPlan({ planItems: next });
  };

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!exerciseName.trim()) return;
    const next: PlanExerciseItem[] = [
      ...daily.planItems,
      {
        id: `m-${Date.now()}`,
        name: exerciseName.trim(),
        target: exerciseTarget.trim(),
        done: false,
      },
    ];
    await patchPlan({ planItems: next });
    setExerciseName("");
    setExerciseTarget("");
    setAdding(false);
  };

  const handleSaveTitle = async (e: React.FormEvent) => {
    e.preventDefault();
    await patchPlan({ planTitle: titleDraft.trim() || null });
    setEditingTitle(false);
  };

  const handleSyncXunji = async () => {
    setSyncingXunji(true);
    try {
      const res = await fetch("/api/xunji/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: daily.date, syncPlans: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "同步训记失败");
      onDailyUpdated(data.daily);
      onNotice(data.message || "训记同步完成");
    } catch (err) {
      onNotice(err instanceof Error ? err.message : "同步训记失败", true);
    } finally {
      setSyncingXunji(false);
    }
  };

  const completedCount = daily.planItems.filter((i) => i.done).length;

  return (
    <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/70 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Dumbbell className="h-4 w-4 shrink-0 text-sky-400" />
          <h2 className="text-sm font-medium text-zinc-200">健身计划</h2>
          {daily.planItems.length > 0 && (
            <span className="tabular-nums rounded-md bg-zinc-800 px-1.5 py-0.5 text-[11px] text-zinc-400">
              {completedCount}/{daily.planItems.length}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            className="flex h-8 items-center gap-1 rounded-lg bg-zinc-800/90 px-2.5 text-xs text-zinc-300 transition hover:bg-zinc-700"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>加动作</span>
          </button>
          <button
            type="button"
            onClick={handleSyncXunji}
            disabled={syncingXunji}
            title={
              xunjiConfigured
                ? "从训记同步今日训练与计划"
                : "请先在 .env 配置 XUNJI_API_KEY"
            }
            className="flex h-8 items-center gap-1 rounded-lg border border-zinc-700/80 bg-zinc-950 px-2.5 text-xs text-zinc-300 transition hover:border-sky-500/50 hover:text-sky-300 disabled:opacity-50"
          >
            {syncingXunji ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            <span>同步训记</span>
          </button>
        </div>
      </div>

      {/* 训练主题 */}
      {!editingTitle ? (
        <button
          type="button"
          onClick={() => {
            setTitleDraft(daily.planTitle ?? "");
            setEditingTitle(true);
          }}
          className="mb-2.5 block w-full text-left text-sm font-medium text-zinc-100 transition hover:text-sky-300"
        >
          {daily.planTitle || (
            <span className="font-normal text-zinc-500">
              点击填写今日训练主题（如：推日 · 胸肩三头 / 休息日）
            </span>
          )}
        </button>
      ) : (
        <form onSubmit={handleSaveTitle} className="mb-3 flex gap-2">
          <input
            type="text"
            autoFocus
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            placeholder="例如：背 + 二头 / 腿部训练"
            className="h-10 min-w-0 flex-1 rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 focus:border-sky-400 focus:outline-none"
          />
          <button
            type="submit"
            disabled={saving}
            className="h-10 rounded-xl bg-sky-500 px-3 text-xs font-medium text-zinc-950"
          >
            保存
          </button>
        </form>
      )}

      {/* 快速新增计划动作 */}
      {adding && (
        <form
          onSubmit={handleAddItem}
          className="mb-3 flex flex-wrap items-center gap-2 rounded-xl bg-zinc-950/80 p-2.5"
        >
          <input
            type="text"
            autoFocus
            value={exerciseName}
            onChange={(e) => setExerciseName(e.target.value)}
            placeholder="动作名（如：杠铃深蹲）"
            className="h-10 min-w-[140px] flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-sky-500/60 focus:outline-none"
          />
          <input
            type="text"
            value={exerciseTarget}
            onChange={(e) => setExerciseTarget(e.target.value)}
            placeholder="组数/目标（如：4×8 · 100kg）"
            className="h-10 w-36 rounded-lg border border-zinc-800 bg-zinc-900 px-3 text-xs text-zinc-100 placeholder:text-zinc-500 focus:border-sky-500/60 focus:outline-none"
          />
          <button
            type="submit"
            disabled={saving || !exerciseName.trim()}
            className="h-10 rounded-lg bg-zinc-100 px-3 text-xs font-medium text-zinc-950 disabled:opacity-40"
          >
            添加
          </button>
        </form>
      )}

      {/* 计划动作清单 */}
      {daily.planItems.length > 0 && (
        <ul className="space-y-1.5">
          {daily.planItems.map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between gap-2 rounded-xl bg-zinc-950/60 px-3 py-2"
            >
              <button
                type="button"
                onClick={() => handleToggleItem(item.id)}
                className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
              >
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition ${
                    item.done
                      ? "border-emerald-500 bg-emerald-500 text-zinc-950"
                      : "border-zinc-600 bg-transparent"
                  }`}
                >
                  {item.done && <Check className="h-3.5 w-3.5 stroke-[2.5]" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p
                    className={`truncate text-sm ${
                      item.done ? "text-zinc-500 line-through" : "text-zinc-100"
                    }`}
                  >
                    {item.name}
                  </p>
                  {item.target && (
                    <p className="text-[11px] text-zinc-500">{item.target}</p>
                  )}
                </div>
              </button>
              <button
                type="button"
                onClick={() => handleRemoveItem(item.id)}
                aria-label="删除计划动作"
                className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-600 hover:bg-zinc-800 hover:text-rose-400"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* 训记实际已完成训练记录 */}
      {daily.workouts.length > 0 && (
        <div className="mt-3 rounded-xl border border-zinc-800/70 bg-zinc-950/70 p-3">
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="font-medium text-sky-300">训记已完成记录</span>
            {daily.totalVolume !== null && daily.totalVolume > 0 && (
              <span className="tabular-nums text-zinc-400">
                总容量 {daily.totalVolume.toLocaleString()} kg
              </span>
            )}
          </div>
          <div className="space-y-2">
            {daily.workouts.map((workout) => (
              <div key={workout.localId} className="space-y-1">
                <div className="flex items-center justify-between text-xs text-zinc-300">
                  <span className="font-medium">{workout.title}</span>
                  {workout.durationMinutes && (
                    <span className="tabular-nums text-zinc-500">
                      {workout.durationMinutes} 分钟
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {workout.movements.map((move, idx) => (
                    <span
                      key={`${workout.localId}-${idx}`}
                      className="tabular-nums rounded-lg bg-zinc-900 px-2 py-1 text-[11px] text-zinc-300 ring-1 ring-zinc-800"
                    >
                      {move.name} · {move.doneSets}组
                      {move.maxWeight > 0
                        ? ` · 最高${move.maxWeight}${move.unit}`
                        : ""}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {daily.planItems.length === 0 && daily.workouts.length === 0 && (
        <p className="text-xs text-zinc-500">
          暂无动作，可点右上角“加动作”快速记录，或“同步训记”拉取当日训练与计划。
        </p>
      )}
    </section>
  );
}
