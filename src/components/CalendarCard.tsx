"use client";

import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { addDays, formatLocalDate } from "@/lib/date";
import type { CalendarDayMarker } from "@/types/fitness";

interface CalendarCardProps {
  selectedDate: string;
  markers: Record<string, CalendarDayMarker>;
  onSelectDate: (date: string) => void;
  onMonthChange: (month: string) => void;
}

const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];

function getMondayOfWeek(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const day = dt.getDay(); // 0=Sun, 1=Mon...
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(dateStr, diff);
}

function buildMonthGrid(year: number, month: number): (string | null)[] {
  const firstDay = new Date(year, month - 1, 1);
  const startWeekday = (firstDay.getDay() + 6) % 7; // Mon=0..Sun=6
  const totalDays = new Date(year, month, 0).getDate();
  const cells: (string | null)[] = [];

  for (let i = 0; i < startWeekday; i += 1) {
    cells.push(null);
  }
  for (let day = 1; day <= totalDays; day += 1) {
    cells.push(
      `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
    );
  }
  while (cells.length % 7 !== 0) {
    cells.push(null);
  }
  return cells;
}

export function CalendarCard({
  selectedDate,
  markers,
  onSelectDate,
  onMonthChange,
}: CalendarCardProps) {
  const [expanded, setExpanded] = useState(false);
  const today = useMemo(() => formatLocalDate(), []);

  const [selectedYear, selectedMonth] = useMemo(() => {
    const [y, m] = selectedDate.split("-").map(Number);
    return [y, m];
  }, [selectedDate]);

  const weekDates = useMemo(() => {
    const monday = getMondayOfWeek(selectedDate);
    return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  }, [selectedDate]);

  const monthGrid = useMemo(
    () => buildMonthGrid(selectedYear, selectedMonth),
    [selectedYear, selectedMonth]
  );

  const shiftPeriod = (direction: -1 | 1) => {
    if (expanded) {
      const target = new Date(selectedYear, selectedMonth - 1 + direction, 1);
      const nextDate = formatLocalDate(target);
      onMonthChange(nextDate.slice(0, 7));
      onSelectDate(nextDate);
    } else {
      const nextDate = addDays(selectedDate, direction * 7);
      if (nextDate.slice(0, 7) !== selectedDate.slice(0, 7)) {
        onMonthChange(nextDate.slice(0, 7));
      }
      onSelectDate(nextDate);
    }
  };

  const renderDots = (dateStr: string) => {
    const m = markers[dateStr];
    if (!m) return <span className="h-1.5" />;
    const hasAny = m.hasMeals || m.hasWorkoutOrPlan || m.hasWeight || m.hasSleep;
    if (!hasAny) return <span className="h-1.5" />;

    return (
      <span className="flex h-1.5 items-center justify-center gap-0.5">
        {m.hasMeals && <span className="h-1 w-1 rounded-full bg-emerald-400" />}
        {m.hasWorkoutOrPlan && (
          <span className="h-1 w-1 rounded-full bg-sky-400" />
        )}
        {(m.hasWeight || m.hasSleep) && (
          <span className="h-1 w-1 rounded-full bg-zinc-400" />
        )}
      </span>
    );
  };

  return (
    <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/70 p-3.5">
      <div className="mb-2.5 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => shiftPeriod(-1)}
            aria-label={expanded ? "上个月" : "上一周"}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-100 active:scale-95"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="tabular-nums text-sm font-medium text-zinc-200">
            {selectedYear}年{selectedMonth}月
          </span>
          <button
            type="button"
            onClick={() => shiftPeriod(1)}
            aria-label={expanded ? "下个月" : "下一周"}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-100 active:scale-95"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          {selectedDate !== today && (
            <button
              type="button"
              onClick={() => {
                onMonthChange(today.slice(0, 7));
                onSelectDate(today);
              }}
              className="rounded-lg bg-zinc-800 px-2.5 py-1 text-xs text-zinc-300 transition hover:bg-zinc-700"
            >
              今天
            </button>
          )}
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200"
          >
            <CalendarDays className="h-3.5 w-3.5" />
            <span>{expanded ? "收起" : "月历"}</span>
          </button>
        </div>
      </div>

      <div className="mb-1 grid grid-cols-7 text-center text-[11px] text-zinc-500">
        {WEEKDAYS.map((day) => (
          <div key={day} className="py-0.5">
            {day}
          </div>
        ))}
      </div>

      {!expanded ? (
        <div className="grid grid-cols-7 gap-1">
          {weekDates.map((dateStr) => {
            const isSelected = dateStr === selectedDate;
            const isToday = dateStr === today;
            const dayNum = Number(dateStr.slice(8, 10));
            return (
              <button
                key={dateStr}
                type="button"
                onClick={() => onSelectDate(dateStr)}
                className={`flex min-h-[44px] flex-col items-center justify-center gap-1 rounded-xl transition active:scale-95 ${
                  isSelected
                    ? "bg-zinc-100 text-zinc-950 font-semibold"
                    : isToday
                      ? "bg-zinc-800/90 text-emerald-400 ring-1 ring-emerald-500/40"
                      : "text-zinc-300 hover:bg-zinc-800/60"
                }`}
              >
                <span className="tabular-nums text-sm leading-none">{dayNum}</span>
                {renderDots(dateStr)}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-7 gap-1">
          {monthGrid.map((dateStr, idx) => {
            if (!dateStr) {
              return <div key={`empty-${idx}`} className="h-10" />;
            }
            const isSelected = dateStr === selectedDate;
            const isToday = dateStr === today;
            const dayNum = Number(dateStr.slice(8, 10));
            return (
              <button
                key={dateStr}
                type="button"
                onClick={() => {
                  onSelectDate(dateStr);
                  setExpanded(false);
                }}
                className={`flex h-10 flex-col items-center justify-center gap-0.5 rounded-xl transition active:scale-95 ${
                  isSelected
                    ? "bg-zinc-100 text-zinc-950 font-semibold"
                    : isToday
                      ? "bg-zinc-800/90 text-emerald-400 ring-1 ring-emerald-500/40"
                      : "text-zinc-300 hover:bg-zinc-800/60"
                }`}
              >
                <span className="tabular-nums text-xs leading-none">{dayNum}</span>
                {renderDots(dateStr)}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
