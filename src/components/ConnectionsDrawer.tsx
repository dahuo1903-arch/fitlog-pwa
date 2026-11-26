"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  Check,
  CheckCircle2,
  CircleDashed,
  Copy,
  Download,
  KeyRound,
  Loader2,
  RefreshCw,
  ShieldCheck,
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
  onRefreshStatus: () => Promise<void>;
  onNotice: (text: string, isError?: boolean) => void;
  syncingWhoop: boolean;
}

export function ConnectionsDrawer({
  open,
  onClose,
  status,
  onSyncWhoop,
  onDisconnectWhoop,
  onRefreshStatus,
  onNotice,
  syncingWhoop,
}: ConnectionsDrawerProps) {
  const [syncWeight, setSyncWeight] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [canInstallPrompt, setCanInstallPrompt] = useState(false);

  // 个人训记 Key 配置
  const [editingXunji, setEditingXunji] = useState(false);
  const [xunjiInput, setXunjiInput] = useState("");
  const [savingXunji, setSavingXunji] = useState(false);

  // 跨设备空间导入 / 新建
  const [showSpaceSwitch, setShowSpaceSwitch] = useState(false);
  const [syncLinkInput, setSyncLinkInput] = useState("");
  const [switchingSpace, setSwitchingSpace] = useState(false);

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

  const handleCopyText = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((cur) => (cur === key ? null : cur)), 2000);
    } catch {
      onNotice("复制失败，请手动长按复制", true);
    }
  };

  const handleSaveXunjiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingXunji(true);
    try {
      const res = await fetch("/api/integrations/xunji", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: xunjiInput }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "保存训记 Key 失败");
      await onRefreshStatus();
      setXunjiInput("");
      setEditingXunji(false);
      onNotice(data.message || "已保存个人训记 Key");
    } catch (err) {
      onNotice(err instanceof Error ? err.message : "保存失败", true);
    } finally {
      setSavingXunji(false);
    }
  };

  const handleClaimSpace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!syncLinkInput.trim()) return;
    setSwitchingSpace(true);
    try {
      const res = await fetch("/api/space/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tokenOrUrl: syncLinkInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "切换空间失败");
      window.location.replace("/?space=synced");
    } catch (err) {
      onNotice(err instanceof Error ? err.message : "切换失败", true);
      setSwitchingSpace(false);
    }
  };

  const handleCreateFreshSpace = async () => {
    setSwitchingSpace(true);
    try {
      const res = await fetch("/api/space/reset", { method: "POST" });
      if (!res.ok) throw new Error("创建新空间失败");
      window.location.replace("/");
    } catch (err) {
      onNotice(err instanceof Error ? err.message : "操作失败", true);
      setSwitchingSpace(false);
    }
  };

  if (!open) return null;

  const fullSyncUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}${status.spaceSyncPath}`
      : status.spaceSyncPath;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-xs sm:items-center"
      onClick={onClose}
    >
      <div
        className="max-h-[86vh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-zinc-800 bg-zinc-950 p-5 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-zinc-100">
            数据源与个人空间
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
              绑定你自己的 WHOOP 账号，自动同步睡眠、每日消耗与恢复度（按个人空间独立隔绝）。
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
                自部署时在环境变量填写{" "}
                <code className="text-zinc-200">WHOOP_CLIENT_ID</code> 和{" "}
                <code className="text-zinc-200">WHOOP_CLIENT_SECRET</code> 即可开启授权。
              </div>
            )}
          </div>

          {/* 2. Gemini & 个人训记 API */}
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
                    status.xunjiConfigured ? "text-emerald-400" : "text-zinc-400"
                  }
                >
                  {status.xunjiConfigured ? "已就绪" : "未绑定"}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setEditingXunji((v) => !v)}
                className="mt-1 flex items-center gap-1 text-[11px] text-sky-400 hover:text-sky-300"
              >
                <KeyRound className="h-3 w-3" />
                <span>
                  {status.xunjiCustomKeySet ? "修改个人 Key" : "填我的训记 Key"}
                </span>
              </button>
            </div>
          </div>

          {editingXunji && (
            <form
              onSubmit={handleSaveXunjiKey}
              className="space-y-2 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-3"
            >
              <p className="text-[11px] text-zinc-400">
                填写你自己的训记 Open API Key（仅保存在你当前的隔离空间，他人完全不可见；留空保存可清除）。
              </p>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={xunjiInput}
                  onChange={(e) => setXunjiInput(e.target.value)}
                  placeholder="xjllm_..."
                  className="h-9 min-w-0 flex-1 rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-xs text-zinc-100 placeholder:text-zinc-500 focus:border-sky-500 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={savingXunji}
                  className="h-9 shrink-0 rounded-xl bg-sky-500 px-3 text-xs font-medium text-zinc-950 disabled:opacity-50"
                >
                  {savingXunji ? "保存中" : "保存"}
                </button>
              </div>
            </form>
          )}

          {/* 3. 无密码个人隔离空间 & 跨设备同步 */}
          <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/50 p-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-400" />
                <span className="font-medium text-zinc-200">
                  独立个人空间（免密码）
                </span>
              </div>
              <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-300">
                {status.spaceLabel}
              </span>
            </div>

            <p className="mt-1.5 text-xs text-zinc-400">
              无需登录密码，每位用户的数据、WHOOP 与训记均自动完全隔绝。换新手机时，复制下方专属链接打开一次即可同步自己的数据（请勿分享给他人）。
            </p>

            <div className="mt-2.5 flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleCopyText("space-sync", fullSyncUrl)}
                className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl bg-zinc-800 text-xs font-medium text-zinc-100 hover:bg-zinc-700"
              >
                {copiedKey === "space-sync" ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                    <span className="text-emerald-400">已复制同步链接</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span>复制跨设备同步链接</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => setShowSpaceSwitch((v) => !v)}
                className="h-9 rounded-xl border border-zinc-700 px-3 text-xs text-zinc-300 hover:border-zinc-500"
              >
                切换/新建
              </button>
            </div>

            {showSpaceSwitch && (
              <div className="mt-2.5 space-y-2 border-t border-zinc-800 pt-2.5">
                <form onSubmit={handleClaimSpace} className="flex gap-2">
                  <input
                    type="text"
                    value={syncLinkInput}
                    onChange={(e) => setSyncLinkInput(e.target.value)}
                    placeholder="粘贴你的跨设备同步链接..."
                    className="h-9 min-w-0 flex-1 rounded-xl border border-zinc-700 bg-zinc-950 px-2.5 text-xs text-zinc-100 placeholder:text-zinc-500 focus:border-emerald-500 focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={switchingSpace || !syncLinkInput.trim()}
                    className="h-9 shrink-0 rounded-xl bg-emerald-500 px-3 text-xs font-medium text-zinc-950 disabled:opacity-40"
                  >
                    同步
                  </button>
                </form>
                <button
                  type="button"
                  disabled={switchingSpace}
                  onClick={handleCreateFreshSpace}
                  className="text-[11px] text-zinc-400 underline underline-offset-2 hover:text-zinc-200"
                >
                  新建一个全新的空白隔离空间
                </button>
              </div>
            )}
          </div>

          {/* 4. 安装为独立 App & 局域网地址 */}
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
                        onClick={() => handleCopyText(url, url)}
                        className="flex shrink-0 items-center gap-1 rounded-lg bg-zinc-800 px-2 py-1 text-[11px] text-zinc-300 hover:bg-zinc-700"
                      >
                        {copiedKey === url ? (
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

          {/* 5. Apple Watch 后续预留插槽 */}
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
              ，后续可直接对接 iPhone 快捷指令自动化或原生 HealthKit
              App，字段（睡眠、体重、静息/活动消耗、userId）与 WHOOP 统一。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
