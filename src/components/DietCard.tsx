"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Camera,
  Loader2,
  Mic,
  Plus,
  Sparkles,
  Square,
  Trash2,
  X,
} from "lucide-react";
import type { DailyLogDTO } from "@/types/fitness";

interface DietCardProps {
  daily: DailyLogDTO;
  geminiConfigured: boolean;
  onDailyUpdated: (daily: DailyLogDTO) => void;
  onNotice: (text: string, isError?: boolean) => void;
}

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
}

interface SpeechRecognitionErrorEventLike {
  error: string;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function pickSupportedAudioMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
    "audio/ogg",
  ];
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return "";
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("读取语音数据失败"));
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      const base64 = dataUrl.split(",")[1] ?? "";
      resolve(base64);
    };
    reader.readAsDataURL(blob);
  });
}

function appendSpokenText(existing: string, spoken: string): string {
  const prev = existing.trim();
  const next = spoken.trim();
  if (!next) return existing;
  if (!prev) return next;
  return `${prev}，${next}`;
}

const MEAL_TYPE_LABELS: Record<string, string> = {
  breakfast: "早",
  lunch: "午",
  dinner: "晚",
  snack: "加餐",
  meal: "餐",
};

async function compressImageToBase64(file: File): Promise<{
  base64: string;
  mimeType: string;
  previewUrl: string;
}> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("读取图片失败"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("解析图片失败"));
      img.onload = () => {
        const maxSide = 1024;
        const ratio = Math.min(1, maxSide / Math.max(img.width, img.height));
        const width = Math.max(1, Math.round(img.width * ratio));
        const height = Math.max(1, Math.round(img.height * ratio));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("浏览器不支持图片压缩"));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
        const base64 = dataUrl.split(",")[1] ?? "";
        resolve({
          base64,
          mimeType: "image/jpeg",
          previewUrl: dataUrl,
        });
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export function DietCard({
  daily,
  geminiConfigured,
  onDailyUpdated,
  onNotice,
}: DietCardProps) {
  const [mode, setMode] = useState<"gemini" | "manual">(
    geminiConfigured ? "gemini" : "manual"
  );
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState<{
    base64: string;
    mimeType: string;
    previewUrl: string;
  } | null>(null);

  const [manualName, setManualName] = useState("");
  const [manualKcal, setManualKcal] = useState("");
  const [manualProtein, setManualProtein] = useState("");
  const [manualCarbs, setManualCarbs] = useState("");
  const [manualFat, setManualFat] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // 语音输入状态：live=浏览器实时听写, record=Gemini录音转写, transcribing=云端识别中
  const [voiceState, setVoiceState] = useState<
    "idle" | "live" | "record" | "transcribing"
  >("idle");
  const [interimText, setInterimText] = useState("");
  const [recordSeconds, setRecordSeconds] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const textInputRef = useRef<HTMLInputElement>(null);
  const speechRef = useRef<SpeechRecognitionLike | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const preferRecorderRef = useRef(false);
  const baseTextRef = useRef("");
  const finalSpeechRef = useRef("");

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const releaseMediaStream = useCallback(() => {
    if (mediaStreamRef.current) {
      for (const track of mediaStreamRef.current.getTracks()) {
        track.stop();
      }
      mediaStreamRef.current = null;
    }
  }, []);

  // 组件卸载时彻底释放麦克风与识别器
  useEffect(() => {
    return () => {
      stopTimer();
      try {
        speechRef.current?.abort();
      } catch {
        // ignore
      }
      try {
        if (mediaRecorderRef.current?.state === "recording") {
          mediaRecorderRef.current.stop();
        }
      } catch {
        // ignore
      }
      releaseMediaStream();
    };
  }, [releaseMediaStream, stopTimer]);

  const startGeminiRecorder = useCallback(async () => {
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      const isNonLocalHttp =
        typeof window !== "undefined" &&
        window.location.protocol === "http:" &&
        window.location.hostname !== "localhost" &&
        window.location.hostname !== "127.0.0.1";
      onNotice(
        isNonLocalHttp
          ? "当前为局域网 HTTP 地址，手机浏览器限制网页麦克风；可点输入框用手机键盘自带语音听写，或通过 localhost/HTTPS 使用。"
          : "当前浏览器不支持网页录音，可直接使用系统键盘语音输入。",
        true
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const mimeType = pickSupportedAudioMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      audioChunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        stopTimer();
        releaseMediaStream();
        mediaRecorderRef.current = null;

        const chunks = audioChunksRef.current;
        audioChunksRef.current = [];
        if (chunks.length === 0) {
          setVoiceState("idle");
          return;
        }

        const actualType = recorder.mimeType || mimeType || "audio/webm";
        const blob = new Blob(chunks, { type: actualType });
        if (blob.size < 400) {
          setVoiceState("idle");
          onNotice("录音时间太短，请按住或说完后再点停止", true);
          return;
        }

        setVoiceState("transcribing");
        try {
          const audioBase64 = await blobToBase64(blob);
          const res = await fetch("/api/diet/transcribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              audioBase64,
              audioMimeType: actualType,
            }),
          });
          const data = await res.json();
          if (!res.ok) {
            throw new Error(data.error || "语音转文字失败");
          }
          setText((prev) => appendSpokenText(prev, data.text));
          textInputRef.current?.focus();
          onNotice("语音已转写，确认后点“记录”即可计算营养");
        } catch (err) {
          onNotice(err instanceof Error ? err.message : "语音转写失败", true);
        } finally {
          setVoiceState("idle");
          setRecordSeconds(0);
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecordSeconds(0);
      setVoiceState("record");
      stopTimer();
      timerRef.current = setInterval(() => {
        setRecordSeconds((s) => s + 1);
      }, 1000);
    } catch (err) {
      releaseMediaStream();
      setVoiceState("idle");
      const msg =
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "未获得麦克风权限，请在浏览器地址栏允许使用麦克风"
          : "无法启动麦克风录音，请检查系统麦克风权限";
      onNotice(msg, true);
    }
  }, [onNotice, releaseMediaStream, stopTimer]);

  const stopVoiceInput = useCallback(() => {
    if (voiceState === "live") {
      try {
        speechRef.current?.stop();
      } catch {
        setVoiceState("idle");
      }
      return;
    }
    if (voiceState === "record") {
      try {
        if (mediaRecorderRef.current?.state === "recording") {
          mediaRecorderRef.current.stop();
        } else {
          setVoiceState("idle");
        }
      } catch {
        releaseMediaStream();
        setVoiceState("idle");
      }
    }
  }, [releaseMediaStream, voiceState]);

  const handleToggleVoice = useCallback(() => {
    if (voiceState === "transcribing" || submitting) return;
    if (voiceState === "live" || voiceState === "record") {
      stopVoiceInput();
      return;
    }

    const SpeechCtor = getSpeechRecognitionCtor();
    // 若浏览器不支持 Web Speech，或此前 Web Speech 因网络受限失败，则直接用高可靠 Gemini 录音转写
    if (!SpeechCtor || preferRecorderRef.current) {
      void startGeminiRecorder();
      return;
    }

    try {
      const recognition = new SpeechCtor();
      recognition.lang = "zh-CN";
      recognition.continuous = true;
      recognition.interimResults = true;

      baseTextRef.current = text.trim();
      finalSpeechRef.current = "";
      setInterimText("");

      let fallbackTriggered = false;

      recognition.onresult = (event) => {
        let interim = "";
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const result = event.results[i];
          const transcript = result[0]?.transcript ?? "";
          if (result.isFinal) {
            finalSpeechRef.current += transcript;
          } else {
            interim += transcript;
          }
        }
        const combinedFinal = appendSpokenText(
          baseTextRef.current,
          finalSpeechRef.current
        );
        setText(combinedFinal);
        setInterimText(interim);
      };

      recognition.onerror = (event) => {
        speechRef.current = null;
        setInterimText("");

        if (
          event.error === "network" ||
          event.error === "service-not-allowed" ||
          event.error === "language-not-supported"
        ) {
          // 桌面 Chromium 常见网络报错，自动无缝降级到 Gemini 录音转写
          fallbackTriggered = true;
          preferRecorderRef.current = true;
          setVoiceState("idle");
          void startGeminiRecorder();
          return;
        }

        setVoiceState("idle");
        if (event.error === "not-allowed") {
          onNotice("未获得麦克风权限，请在浏览器设置中允许麦克风访问", true);
        } else if (event.error !== "no-speech" && event.error !== "aborted") {
          onNotice(`语音识别中断 (${event.error})，请重试`, true);
        }
      };

      recognition.onend = () => {
        speechRef.current = null;
        if (fallbackTriggered) return;
        setInterimText((pending) => {
          if (pending.trim()) {
            setText((prev) => appendSpokenText(prev, pending));
          }
          return "";
        });
        setVoiceState("idle");
        textInputRef.current?.focus();
      };

      speechRef.current = recognition;
      setVoiceState("live");
      recognition.start();
    } catch {
      preferRecorderRef.current = true;
      void startGeminiRecorder();
    }
  }, [
    onNotice,
    startGeminiRecorder,
    stopVoiceInput,
    submitting,
    text,
    voiceState,
  ]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImageToBase64(file);
      setPhoto(compressed);
      setMode("gemini");
    } catch (err) {
      onNotice(err instanceof Error ? err.message : "图片处理失败", true);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleGeminiSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (voiceState === "live" || voiceState === "record") {
      stopVoiceInput();
      return;
    }
    if (!text.trim() && !photo) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/diet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "gemini",
          date: daily.date,
          text: text.trim() || undefined,
          imageBase64: photo?.base64,
          imageMimeType: photo?.mimeType,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Gemini 饮食解析失败");
      }
      onDailyUpdated(data.daily);
      setText("");
      setPhoto(null);
      onNotice(`已记录 ${data.added?.length ?? 1} 条饮食`);
    } catch (err) {
      onNotice(err instanceof Error ? err.message : "记录失败", true);
    } finally {
      setSubmitting(false);
    }
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const calories = Number(manualKcal);
    if (!manualName.trim() || !Number.isFinite(calories) || calories < 0) {
      onNotice("请填写食物名称和有效热量", true);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/diet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "manual",
          date: daily.date,
          name: manualName.trim(),
          calories,
          protein: Number(manualProtein) || 0,
          carbs: Number(manualCarbs) || 0,
          fat: Number(manualFat) || 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "保存饮食记录失败");
      }
      onDailyUpdated(data.daily);
      setManualName("");
      setManualKcal("");
      setManualProtein("");
      setManualCarbs("");
      setManualFat("");
      onNotice("已保存饮食记录");
    } catch (err) {
      onNotice(err instanceof Error ? err.message : "保存失败", true);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/diet/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "删除失败");
      onDailyUpdated(data.daily);
    } catch (err) {
      onNotice(err instanceof Error ? err.message : "删除失败", true);
    } finally {
      setDeletingId(null);
    }
  };

  const isListening = voiceState === "live" || voiceState === "record";
  const formatDuration = (sec: number) =>
    `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;

  return (
    <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/70 p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-medium text-zinc-200">今日饮食</h2>
          <button
            type="button"
            onClick={() => setMode((m) => (m === "gemini" ? "manual" : "gemini"))}
            className="rounded-md bg-zinc-800/90 px-2 py-0.5 text-[11px] text-zinc-400 transition hover:text-zinc-200"
          >
            {mode === "gemini" ? "切到手动" : "切到 Gemini"}
          </button>
        </div>

        <div className="tabular-nums text-right">
          <span className="text-lg font-semibold text-zinc-50">
            {daily.totals.calories}
          </span>
          <span className="ml-1 text-xs text-zinc-400">kcal</span>
          {daily.totalBurnKcal !== null && (
            <span className="ml-2 text-xs text-zinc-500">
              / 消耗 {daily.totalBurnKcal}
            </span>
          )}
        </div>
      </div>

      {/* 极简三大营养素一行 */}
      <div className="mb-3 grid grid-cols-3 gap-2 rounded-xl bg-zinc-950/70 px-3 py-2 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-zinc-500">蛋白</span>
          <span className="tabular-nums font-medium text-emerald-400">
            {daily.totals.protein}g
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-zinc-500">碳水</span>
          <span className="tabular-nums font-medium text-amber-300">
            {daily.totals.carbs}g
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-zinc-500">脂肪</span>
          <span className="tabular-nums font-medium text-sky-300">
            {daily.totals.fat}g
          </span>
        </div>
      </div>

      {/* 输入区 */}
      {mode === "gemini" ? (
        <form onSubmit={handleGeminiSubmit} className="space-y-2">
          {photo && (
            <div className="relative inline-block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.previewUrl}
                alt="待解析食物照片"
                className="h-16 w-16 rounded-xl border border-zinc-700 object-cover"
              />
              <button
                type="button"
                onClick={() => setPhoto(null)}
                aria-label="移除照片"
                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-zinc-800 text-zinc-200 ring-1 ring-zinc-600"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}

          <input
            ref={textInputRef}
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="输入或语音说出吃了什么，如：200g鸡胸肉+一碗米饭"
            disabled={submitting || voiceState === "transcribing"}
            className="h-11 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-emerald-500/60 focus:outline-none"
          />

          {/* 语音识别 / 录音实时状态条 */}
          {(isListening || voiceState === "transcribing") && (
            <div className="flex items-center justify-between gap-2 rounded-xl border border-rose-500/30 bg-rose-950/30 px-3 py-2 text-xs text-rose-200">
              <div className="flex min-w-0 items-center gap-2">
                {voiceState === "transcribing" ? (
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-emerald-400" />
                ) : (
                  <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-rose-400" />
                )}
                <span className="truncate">
                  {voiceState === "transcribing"
                    ? "正在用 Gemini 转写语音..."
                    : voiceState === "record"
                      ? `正在录音 ${formatDuration(recordSeconds)} · 说完再点停止`
                      : interimText
                        ? `识别中：${interimText}`
                        : "正在聆听，直接说出吃了什么..."}
                </span>
              </div>
              {isListening && (
                <button
                  type="button"
                  onClick={stopVoiceInput}
                  className="shrink-0 rounded-md bg-rose-500/20 px-2 py-0.5 text-[11px] font-medium text-rose-200 hover:bg-rose-500/30"
                >
                  完成
                </button>
              )}
            </div>
          )}

          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleToggleVoice}
                disabled={submitting || voiceState === "transcribing"}
                aria-label={isListening ? "停止语音输入" : "语音输入饮食"}
                className={`flex h-11 items-center gap-1.5 rounded-xl border px-3 text-xs font-medium transition active:scale-95 disabled:opacity-50 ${
                  isListening
                    ? "border-rose-500/70 bg-rose-500/20 text-rose-200"
                    : "border-zinc-800 bg-zinc-950 text-zinc-300 hover:border-zinc-700 hover:text-zinc-100"
                }`}
              >
                {voiceState === "transcribing" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : isListening ? (
                  <Square className="h-3.5 w-3.5 fill-current" />
                ) : (
                  <Mic className="h-4 w-4 text-emerald-400" />
                )}
                <span>
                  {voiceState === "transcribing"
                    ? "转写中"
                    : isListening
                      ? "停止"
                      : "语音"}
                </span>
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFileChange}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={submitting || isListening}
                aria-label="拍照或选择食物照片"
                className="flex h-11 items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-950 px-3 text-xs font-medium text-zinc-300 transition hover:border-zinc-700 hover:text-zinc-100 active:scale-95 disabled:opacity-50"
              >
                <Camera className="h-4 w-4 text-zinc-400" />
                <span>拍照</span>
              </button>
            </div>

            <button
              type="submit"
              disabled={
                submitting ||
                isListening ||
                voiceState === "transcribing" ||
                (!text.trim() && !photo)
              }
              className="flex h-11 shrink-0 items-center gap-1.5 rounded-xl bg-emerald-500 px-4 text-sm font-medium text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40 active:scale-95"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              <span>记录</span>
            </button>
          </div>

          {!geminiConfigured && (
            <p className="text-[11px] text-amber-400/90">
              尚未配置 GEMINI_API_KEY，可在 .env 中填入，或点击上方“切到手动”先直接记。
            </p>
          )}
        </form>
      ) : (
        <form onSubmit={handleManualSubmit} className="space-y-2">
          <div className="flex gap-2">
            <input
              type="text"
              value={manualName}
              onChange={(e) => setManualName(e.target.value)}
              placeholder="食物名称（如：拿铁 + 全麦吐司）"
              className="h-11 min-w-0 flex-1 rounded-xl border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-emerald-500/60 focus:outline-none"
            />
            <input
              type="number"
              inputMode="numeric"
              value={manualKcal}
              onChange={(e) => setManualKcal(e.target.value)}
              placeholder="热量 kcal"
              className="h-11 w-24 shrink-0 rounded-xl border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-emerald-500/60 focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              step="0.1"
              inputMode="decimal"
              value={manualProtein}
              onChange={(e) => setManualProtein(e.target.value)}
              placeholder="蛋白 g"
              className="h-10 min-w-0 flex-1 rounded-xl border border-zinc-800 bg-zinc-950 px-2.5 text-xs text-zinc-100 placeholder:text-zinc-500 focus:border-emerald-500/60 focus:outline-none"
            />
            <input
              type="number"
              step="0.1"
              inputMode="decimal"
              value={manualCarbs}
              onChange={(e) => setManualCarbs(e.target.value)}
              placeholder="碳水 g"
              className="h-10 min-w-0 flex-1 rounded-xl border border-zinc-800 bg-zinc-950 px-2.5 text-xs text-zinc-100 placeholder:text-zinc-500 focus:border-emerald-500/60 focus:outline-none"
            />
            <input
              type="number"
              step="0.1"
              inputMode="decimal"
              value={manualFat}
              onChange={(e) => setManualFat(e.target.value)}
              placeholder="脂肪 g"
              className="h-10 min-w-0 flex-1 rounded-xl border border-zinc-800 bg-zinc-950 px-2.5 text-xs text-zinc-100 placeholder:text-zinc-500 focus:border-emerald-500/60 focus:outline-none"
            />
            <button
              type="submit"
              disabled={submitting || !manualName.trim() || !manualKcal}
              className="flex h-10 shrink-0 items-center gap-1 rounded-xl bg-zinc-100 px-3 text-xs font-medium text-zinc-950 transition hover:bg-zinc-200 disabled:opacity-40"
            >
              {submitting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus className="h-3.5 w-3.5" />
              )}
              <span>添加</span>
            </button>
          </div>
        </form>
      )}

      {/* 餐食记录列表 */}
      {daily.meals.length > 0 ? (
        <ul className="mt-3 divide-y divide-zinc-800/70">
          {daily.meals.map((meal) => (
            <li
              key={meal.id}
              className="flex items-center justify-between gap-2 py-2.5 first:pt-1 last:pb-0"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="shrink-0 rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">
                    {MEAL_TYPE_LABELS[meal.mealType] ?? "餐"}
                  </span>
                  <p className="truncate text-sm text-zinc-100">{meal.name}</p>
                </div>
                <p className="tabular-nums mt-0.5 text-[11px] text-zinc-500">
                  蛋白 {meal.protein}g · 碳水 {meal.carbs}g · 脂肪 {meal.fat}g
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <span className="tabular-nums text-sm font-medium text-zinc-200">
                  {meal.calories}
                  <span className="ml-0.5 text-[11px] text-zinc-500">kcal</span>
                </span>
                <button
                  type="button"
                  onClick={() => handleDelete(meal.id)}
                  disabled={deletingId === meal.id}
                  aria-label="删除饮食条目"
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-zinc-800 hover:text-rose-400"
                >
                  {deletingId === meal.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-center text-xs text-zinc-500">
          今天还没有饮食记录，点“语音”说一句吃了什么即可。
        </p>
      )}
    </section>
  );
}
