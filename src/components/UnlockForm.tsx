"use client";

import { useState } from "react";
import { Eye, EyeOff, Loader2, Lock } from "lucide-react";

interface UnlockFormProps {
  nextPath: string;
}

export function UnlockForm({ nextPath }: UnlockFormProps) {
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pin.trim() || submitting) return;

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "解锁失败");
      }
      const safeTarget =
        nextPath.startsWith("/") && !nextPath.startsWith("//") ? nextPath : "/";
      window.location.replace(safeTarget);
    } catch (err) {
      setError(err instanceof Error ? err.message : "解锁失败，请重试");
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3.5">
      <div className="relative">
        <input
          type={showPin ? "text" : "password"}
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          placeholder="输入个人访问密码"
          autoComplete="current-password"
          autoFocus
          disabled={submitting}
          className="h-12 w-full rounded-xl border border-zinc-800 bg-zinc-950 pl-4 pr-11 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-emerald-500/60 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => setShowPin((v) => !v)}
          aria-label={showPin ? "隐藏密码" : "显示密码"}
          className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-300"
        >
          {showPin ? (
            <EyeOff className="h-4 w-4" />
          ) : (
            <Eye className="h-4 w-4" />
          )}
        </button>
      </div>

      {error && (
        <p className="rounded-xl border border-rose-500/30 bg-rose-950/40 px-3 py-2 text-xs text-rose-200">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting || !pin.trim()}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 text-sm font-medium text-zinc-950 transition hover:bg-emerald-400 disabled:opacity-40 active:scale-[0.99]"
      >
        {submitting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Lock className="h-4 w-4" />
        )}
        <span>{submitting ? "验证中..." : "解锁 FitLog"}</span>
      </button>

      <p className="text-center text-[11px] text-zinc-500">
        解锁后当前设备自动保持 30 天登录态，云端数据私密保护。
      </p>
    </form>
  );
}
