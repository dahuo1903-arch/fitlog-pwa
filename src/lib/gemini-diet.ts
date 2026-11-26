import { GoogleGenAI } from "@google/genai";
import { z } from "zod";

export const DEFAULT_GEMINI_MODEL = "gemini-4-hydrogen";
const FALLBACK_GEMINI_MODEL = "gemini-3.5-flash-lite";

const parsedMealItemSchema = z.object({
  name: z.string().min(1).max(120),
  calories: z.number().min(0).max(10000),
  protein: z.number().min(0).max(500),
  carbs: z.number().min(0).max(1000),
  fat: z.number().min(0).max(500),
  mealType: z
    .enum(["breakfast", "lunch", "dinner", "snack", "meal"])
    .optional()
    .default("meal"),
});

const parsedDietResponseSchema = z.object({
  items: z.array(parsedMealItemSchema).min(1).max(12),
});

export type ParsedDietItem = z.infer<typeof parsedMealItemSchema>;

export function getGeminiModel(): string {
  const configured = process.env.GEMINI_MODEL?.trim();
  return configured || DEFAULT_GEMINI_MODEL;
}

export function isGeminiConfigured(): boolean {
  return Boolean(
    process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim()
  );
}

function getGeminiClient(): GoogleGenAI {
  const apiKey =
    process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim();

  if (!apiKey) {
    throw new Error(
      "未配置 GEMINI_API_KEY，请在 .env 中填写 Gemini API Key，或先切换“手动记录”模式。"
    );
  }

  return new GoogleGenAI({ apiKey });
}

async function createInteractionWithFallback(
  params: Omit<Parameters<GoogleGenAI["interactions"]["create"]>[0], "model" | "stream">
) {
  const ai = getGeminiClient();
  const primary = getGeminiModel();
  const candidateModels =
    primary === FALLBACK_GEMINI_MODEL
      ? [primary]
      : [primary, FALLBACK_GEMINI_MODEL];

  let lastError: unknown = null;

  for (let i = 0; i < candidateModels.length; i += 1) {
    const currentModel = candidateModels[i];
    try {
      return await ai.interactions.create({
        ...params,
        model: currentModel,
      });
    } catch (err) {
      lastError = err;
      const errMsg = err instanceof Error ? err.message : String(err);
      const isTransient =
        errMsg.includes("503") ||
        errMsg.includes("429") ||
        errMsg.includes("high demand") ||
        errMsg.includes("RESOURCE_EXHAUSTED");
      if (!isTransient || i === candidateModels.length - 1) {
        throw err;
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Gemini 服务暂时不可用，请稍后重试。");
}

function normalizeAudioMimeType(raw?: string): string {
  const base = (raw || "audio/webm").split(";")[0].trim().toLowerCase();
  if (base === "audio/mp4" || base === "audio/x-m4a") return "audio/m4a";
  if (base === "audio/mpeg3" || base === "audio/x-mpeg-3") return "audio/mp3";
  if (base === "audio/x-wav") return "audio/wav";
  const allowed = new Set([
    "audio/webm",
    "audio/m4a",
    "audio/mp3",
    "audio/mpeg",
    "audio/ogg",
    "audio/wav",
    "audio/aac",
    "audio/flac",
    "audio/opus",
  ]);
  return allowed.has(base) ? base : "audio/webm";
}

const DIET_JSON_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      description: "拆解后的饮食条目列表（通常 1~5 条，按单餐或清晰菜品分组）",
      items: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "简洁清晰的中文食物与份量名称，例如：鸡胸肉 200g + 米饭 1 碗",
          },
          calories: {
            type: "number",
            description: "估算热量，单位 kcal（非负整数）",
          },
          protein: {
            type: "number",
            description: "估算蛋白质，单位克 (g)",
          },
          carbs: {
            type: "number",
            description: "估算碳水化合物，单位克 (g)",
          },
          fat: {
            type: "number",
            description: "估算脂肪，单位克 (g)",
          },
          mealType: {
            type: "string",
            enum: ["breakfast", "lunch", "dinner", "snack", "meal"],
            description: "餐次类型：breakfast / lunch / dinner / snack / meal",
          },
        },
        required: ["name", "calories", "protein", "carbs", "fat", "mealType"],
      },
    },
  },
  required: ["items"],
};

export async function parseDietWithGemini(params: {
  text?: string;
  imageBase64?: string;
  imageMimeType?: string;
  preferredMealType?: string;
}): Promise<ParsedDietItem[]> {
  const promptLines = [
    "请根据以下用户的饮食输入（文字和/或食物照片），估算热量 (kcal) 与三大营养素（蛋白质、碳水、脂肪，单位克）。",
    "要求：",
    "1. 如果描述属于同一顿饭的几种简单搭配，可按菜品拆成简洁的 1~4 条；如果就是单个组合餐，保留 1 条即可，名称清晰带份量。",
    "2. 参考常见中餐/健身餐标准克重和营养成分表做务实估算，不要夸大或漏算烹调用油。",
    "3. 只返回符合 schema 的 JSON。",
  ];

  if (params.preferredMealType && params.preferredMealType !== "auto") {
    promptLines.push(`用户选择的餐次为：${params.preferredMealType}。`);
  }
  if (params.text?.trim()) {
    promptLines.push(`用户输入：${params.text.trim()}`);
  }

  const promptText = promptLines.join("\n");

  const input = params.imageBase64
    ? [
        {
          type: "user_input" as const,
          content: [
            { type: "text" as const, text: promptText },
            {
              type: "image" as const,
              data: params.imageBase64,
              mime_type: (params.imageMimeType || "image/jpeg") as
                | "image/jpeg"
                | "image/png"
                | "image/webp"
                | "image/heic",
            },
          ],
        },
      ]
    : promptText;

  const interaction = await createInteractionWithFallback({
    system_instruction:
      "你是一位精准、克制的中文健身营养记录助手。根据用户口述或食物照片估算热量与蛋白质、碳水、脂肪，并严格按照 JSON Schema 输出。",
    input,
    response_format: {
      type: "text",
      mime_type: "application/json",
      schema: DIET_JSON_SCHEMA,
    },
    store: false,
  });

  const rawText = interaction.output_text?.trim();
  if (!rawText) {
    throw new Error("Gemini 未返回可解析的饮食结果，请重试。");
  }

  let jsonObj: unknown;
  try {
    jsonObj = JSON.parse(rawText);
  } catch {
    throw new Error(`Gemini 返回格式无法解析为 JSON：${rawText.slice(0, 120)}`);
  }

  const validated = parsedDietResponseSchema.safeParse(jsonObj);
  if (!validated.success) {
    throw new Error("Gemini 返回的营养字段格式不完整，请重试或改用手动录入。");
  }

  return validated.data.items.map((item) => ({
    ...item,
    calories: Math.round(item.calories),
    protein: Number(item.protein.toFixed(1)),
    carbs: Number(item.carbs.toFixed(1)),
    fat: Number(item.fat.toFixed(1)),
  }));
}

export async function transcribeDietAudioWithGemini(params: {
  audioBase64: string;
  audioMimeType?: string;
}): Promise<string> {
  const mimeType = normalizeAudioMimeType(params.audioMimeType);

  const interaction = await createInteractionWithFallback({
    system_instruction:
      "你是一个精准的中文健身饮食语音输入法。将用户口述的饮食内容转写为干净自然的简体中文短句，保留准确的食物名称、份量和克数（数字优先用阿拉伯数字，如 200g、2 个鸡蛋），去除嗯/啊等语气词。只输出转写文本本身，不要添加任何解释、引号或前缀。如果录音中没有听清有效说话内容，输出空字符串。",
    input: [
      {
        type: "user_input" as const,
        content: [
          {
            type: "text" as const,
            text: "请将这段饮食记录语音转写为简洁准确的简体中文文字。",
          },
          {
            type: "audio" as const,
            data: params.audioBase64,
            mime_type: mimeType,
          },
        ],
      },
    ],
    store: false,
  });

  const transcript = (interaction.output_text || "")
    .trim()
    .replace(/^[“"「『]+|[”"」』]+$/g, "")
    .trim();

  return transcript;
}
