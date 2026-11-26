"use client";

import { useEffect, useState } from "react";

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

declare global {
  interface Window {
    __fitlogInstallPrompt?: BeforeInstallPromptEvent | null;
  }
}

export function PwaManager() {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    const handleBeforeInstall = (event: Event) => {
      event.preventDefault();
      window.__fitlogInstallPrompt = event as BeforeInstallPromptEvent;
      window.dispatchEvent(new Event("fitlog:install-prompt-ready"));
    };

    const handleAppInstalled = () => {
      window.__fitlogInstallPrompt = null;
      window.dispatchEvent(new Event("fitlog:install-prompt-ready"));
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    window.addEventListener("appinstalled", handleAppInstalled);

    // 仅在生产环境注册 Service Worker，避免干扰本地开发热重载
    const shouldRegisterSw =
      process.env.NODE_ENV === "production" &&
      "serviceWorker" in navigator &&
      (window.location.protocol === "https:" ||
        window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1");

    let registration: ServiceWorkerRegistration | null = null;
    let refreshing = false;

    const handleControllerChange = () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && registration) {
        registration.update().catch(() => {
          // ignore
        });
      }
    };

    if (shouldRegisterSw) {
      const hadController = Boolean(navigator.serviceWorker.controller);

      navigator.serviceWorker.addEventListener(
        "controllerchange",
        handleControllerChange
      );
      document.addEventListener("visibilitychange", handleVisibilityChange);

      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((reg) => {
          registration = reg;

          if (reg.waiting && hadController) {
            setUpdateAvailable(true);
          }

          reg.addEventListener("updatefound", () => {
            const nextWorker = reg.installing;
            if (!nextWorker) return;
            nextWorker.addEventListener("statechange", () => {
              if (
                nextWorker.state === "installed" &&
                navigator.serviceWorker.controller
              ) {
                setUpdateAvailable(true);
              }
            });
          });
        })
        .catch(() => {
          // ignore
        });
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
      window.removeEventListener("appinstalled", handleAppInstalled);
      if (shouldRegisterSw) {
        navigator.serviceWorker.removeEventListener(
          "controllerchange",
          handleControllerChange
        );
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      }
    };
  }, []);

  if (!updateAvailable) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 items-center justify-between gap-3 rounded-2xl border border-emerald-500/40 bg-zinc-900/95 px-3.5 py-2.5 text-xs text-zinc-100 shadow-lg backdrop-blur">
      <span>FitLog 已有新版本可用</span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="shrink-0 rounded-lg bg-emerald-500 px-2.5 py-1 font-medium text-zinc-950"
      >
        立即更新
      </button>
    </div>
  );
}
