"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  Check,
  CheckCircle2,
  CircleDashed,
  Copy,
  Download,
  Loader2,
  LogOut,
  RefreshCw,
  Smartphone,
  Watch,
  X,
} from "lucide-react";
import type { IntegrationStatusDTO } from "@/types/fitness";

interface ConnectionsDrawerProps {
  open: boolean;
  onClose: () => void;
  status: IntegrationStatusDTO;
  onSyncWhoop: (syncBodyWeight: boolean) => Promise<void>;
  onDisconnectWhoop: () => Promise<void>;
  syncingWhoop: boolean;
}

export function ConnectionsDrawer({
  open,
  onClose,
  status,
  onSyncWhoop,
  onDisconnectWhoop,
  syncingWhoop,
}: ConnectionsDrawerProps) {
  const [syncWeight, setSyncWeight] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [canInstallPrompt, setCanInstallPrompt] = useState(false);
  const [locking, setLocking] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const syncPwaState = () => {
      const standalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        Boolean((window.navigator as { standalone?: boolean }).standalone);
      const ios =
        /iPad|iPhone|iPod/.test(window.navigator.userAgent) &&
        !(window as unknown as { MSStream?: unknown }).MSStream;
      setIsStandalone(standalone);
      setIsIos(ios);
      setCanInstallPrompt(Boolean(window.__fitlogInstallPrompt));
    };

    syncPwaState();
    window.addEventListener("fitlog:install-prompt-ready", syncPwaState);
    return () => {
      window.removeEventListener("fitlog:install-prompt-ready", syncPwaState);
    };
  }, [open]);

  const handleInstallApp = async () => {
    const promptEvent = window.__fitlogInstallPrompt;
    if (!promptEvent) return;
    await promptEvent.prompt();
    await promptEvent.userChoice.catch(() => null);
    window.__fitlogInstallPrompt = null;
    setCanInstallPrompt(false);
  };

  const handleLockDevice = async () => {
    setLocking(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      window.location.replace("/unlock");
    } finally {
      setLocking(false);
    }
  };

  const handleCopyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedUrl(url);
      setTimeout(() => setCopiedUrl((cur) => (cur === url ? null : cur)), 2000);
    } catch {
      // ignore
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-xs sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-3xl border border-zinc-800 bg-zinc-950 p-5 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-zinc-100">
            数据源与设备连接
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-900 text-zinc-400 hover:text-zinc-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 text-sm">
          {/* 1. WHOOP */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-emerald-400" />
                <span className="font-medium text-zinc-100">WHOOP v2</span>
              </div>
              {status.whoopConnected ? (
                <span className="flex items-center gap-1 text-xs text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  已连接
                </span>
              ) : (
                <span className="flex items-center gap-1 text-xs text-zinc-500">
                  <CircleDashed className="h-3.5 w-3.5" />
                  {status.whoopConfigured ? "待授权" : "未配置密钥"}
                </span>
              )}
            </div>

            <p className="mt-1.5 text-xs text-zinc-400">
              自动读取睡眠时长、入睡/起床时间、每日消耗 (kcal) 与恢复度。
            </p>

            {status.whoopConnected ? (
              <div className="mt-3 space-y-2.5">
                <label className="flex items-center gap-2 text-xs text-zinc-400">
                  <input
                    type="checkbox"
                    checked={syncWeight}
                    onChange={(e) => setSyncWeight(e.target.checked)}
                    className="rounded border-zinc-700 bg-zinc-900"
                  />
                  <span>若当日未手动记体重，则顺便同步 WHOOP 体重</span>
                </label>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onSyncWhoop(syncWeight)}
                    disabled={syncingWhoop}
                    className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-500 text-xs font-medium text-zinc-950 hover:bg-emerald-400 disabled:opacity-50"
                  >
                    {syncingWhoop ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5" />
                    )}
                    <span>同步最近 7 天 WHOOP 数据</span>
                  </button>
                  <button
                    type="button"
                    disabled={disconnecting}
                    onClick={async () => {
                      setDisconnecting(true);
                      try {
                        await onDisconnectWhoop();
                      } finally {
                        setDisconnecting(false);
                      }
                    }}
                    className="h-10 rounded-xl border border-zinc-700 px-3 text-xs text-zinc-400 hover:text-rose-400"
                  >
                    断开
                  </button>
                </div>
              </div>
            ) : status.whoopConfigured ? (
              <a
                href="/api/whoop/auth"
                className="mt-3 flex h-10 w-full items-center justify-center rounded-xl bg-zinc-100 text-xs font-medium text-zinc-950 transition hover:bg-zinc-200"
              >
                前往 WHOOP 授权连接
              </a>
            ) : (
              <div className="mt-2.5 rounded-xl bg-zinc-950 p-2.5 text-[11px] text-zinc-400">
                在 <code className="text-zinc-200">.env</code> 填写{" "}
                <code className="text-zinc-200">WHOOP_CLIENT_ID</code> 和{" "}
                <code className="text-zinc-200">WHOOP_CLIENT_SECRET</code>，并在
                WHOOP Developer 后台将 Redirect URI 设为{" "}
                <code className="text-zinc-200">
                  /api/whoop/callback
                </code>
                。
              </div>
            )}
          </div>

          {/* 2. Gemini & 训记状态 */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-zinc-200">Gemini 饮食</span>
                <span
                  className={
                    status.geminiConfigured ? "text-emerald-400" : "text-amber-400"
                  }
                >
                  {status.geminiConfigured ? "已就绪" : "未填 Key"}
                </span>
              </div>
              <p className="mt-1 truncate text-[11px] text-zinc-500">
                {status.geminiModel}
              </p>
            </div>

            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-zinc-200">训记 API</span>
                <span
                  className={
                    status.xunjiConfigured ? "text-emerald-400" : "text-amber-400"
                  }
                >
                  {status.xunjiConfigured ? "已就绪" : "未填 Key"}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-zinc-500">30s 防限频缓存</p>
            </div>
          </div>

          {/* 3. 安装为独立 App & 局域网地址 */}
          <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/50 p-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Download className="h-4 w-4 text-emerald-400" />
                <span className="font-medium text-zinc-200">
                  安装为手机 / 桌面 App
                </span>
              </div>
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] ${
                  isStandalone
                    ? "bg-emerald-500/15 text-emerald-400"
                    : "bg-zinc-800 text-zinc-400"
                }`}
              >
                {isStandalone ? "已独立安装" : "支持热更新"}
              </span>
            </div>

            {isStandalone ? (
              <p className="mt-1.5 text-xs text-zinc-400">
                当前已作为独立 App 运行；云端推送新功能后，重新打开或切回前台即可自动获取最新版本。
              </p>
            ) : canInstallPrompt ? (
              <div className="mt-2.5 space-y-2">
                <p className="text-xs text-zinc-400">
                  一键安装到主屏幕后，全屏无地址栏运行，后续新增功能自动热更新。
                </p>
                <button
                  type="button"
                  onClick={handleInstallApp}
                  className="flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-500 text-xs font-medium text-zinc-950 hover:bg-emerald-400"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>安装 FitLog 到主屏幕</span>
                </button>
              </div>
            ) : isIos ? (
              <p className="mt-1.5 text-xs leading-relaxed text-zinc-400">
                在 Safari 点击底部 <strong className="text-zinc-200">分享</strong>{" "}
                按钮，选择 <strong className="text-zinc-200">添加到主屏幕</strong>{" "}
                即可安装成全屏独立 App；后续云端更新打开即生效，无需重新安装。
              </p>
            ) : (
              <p className="mt-1.5 text-xs leading-relaxed text-zinc-400">
                手机使用 iOS Safari「分享 → 添加到主屏幕」或 Android Chrome「安装应用」，即可安装为全屏独立 App 并自动热更新。
              </p>
            )}

            {(status.lanUrls.length > 0 || status.mdnsUrl) && (
              <div className="mt-3 border-t border-zinc-800/80 pt-3">
                <div className="mb-1.5 flex items-center justify-between text-[11px] text-zinc-400">
                  <span className="flex items-center gap-1.5">
                    <Smartphone className="h-3.5 w-3.5 text-sky-400" />
                    <span>局域网访问（仅本地开发同 Wi-Fi）</span>
                  </span>
                  <span className="text-zinc-500">勿用 localhost</span>
                </div>
                <div className="space-y-1.5">
                  {[
                    ...status.lanUrls,
                    ...(status.mdnsUrl ? [status.mdnsUrl] : []),
                  ].map((url) => (
                    <div
                      key={url}
                      className="flex items-center justify-between gap-2 rounded-xl bg-zinc-950 px-2.5 py-1.5"
                    >
                      <code className="truncate text-xs text-sky-300">
                        {url}
                      </code>
                      <button
                        type="button"
                        onClick={() => handleCopyUrl(url)}
                        className="flex shrink-0 items-center gap-1 rounded-lg bg-zinc-800 px-2 py-1 text-[11px] text-zinc-300 hover:bg-zinc-700"
                      >
                        {copiedUrl === url ? (
                          <>
                            <Check className="h-3 w-3 text-emerald-400" />
                            <span className="text-emerald-400">已复制</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3 w-3" />
                            <span>复制</span>
                          </>
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 4. Apple Watch 后续预留插槽 */}
          <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Watch className="h-4 w-4 text-zinc-400" />
                <span className="font-medium text-zinc-200">
                  Apple Watch（后续扩展插槽）
                </span>
              </div>
              <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">
                已预留接口
              </span>
            </div>
            <p className="mt-1.5 text-xs text-zinc-400">
              已就绪标准化写入接口{" "}
              <code className="text-zinc-200">POST /api/wearables/apple-watch</code>
              ，后续面向其他用户时可直接对接 iPhone 快捷指令自动化或原生 HealthKit
              App，字段（睡眠、体重、静息/活动消耗、userId）与 WHOOP 统一。
            </p>
          </div>

          {/* 5. 隐私访问锁控制 */}
          {status.accessPinEnabled && (
            <button
              type="button"
              disabled={locking}
              onClick={handleLockDevice}
              className="flex h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900/70 text-xs text-zinc-300 transition hover:border-rose-500/40 hover:text-rose-300 disabled:opacity-50"
            >
              {locking ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <LogOut className="h-3.5 w-3.5" />
              )}
              <span>锁定当前设备（退出 30 天免密）</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
