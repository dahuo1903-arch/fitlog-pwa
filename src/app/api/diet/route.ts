import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  DEFAULT_USER_ID,
  ensureDailyLog,
  getDailyLogDTO,
} from "@/lib/daily-log";
import { isValidDateStr } from "@/lib/date";
import { parseDietWithGemini } from "@/lib/gemini-diet";

const geminiDietSchema = z.object({
  mode: z.literal("gemini").optional().default("gemini"),
  date: z.string(),
  text: z.string().max(1000).optional(),
  imageBase64: z.string().max(10_000_000).optional(),
  imageMimeType: z.string().max(50).optional(),
  mealType: z
    .enum(["auto", "breakfast", "lunch", "dinner", "snack", "meal"])
    .optional()
    .default("auto"),
});

const manualDietSchema = z.object({
  mode: z.literal("manual"),
  date: z.string(),
  name: z.string().min(1).max(120),
  calories: z.number().min(0).max(10000),
  protein: z.number().min(0).max(500).optional().default(0),
  carbs: z.number().min(0).max(1000).optional().default(0),
  fat: z.number().min(0).max(500).optional().default(0),
  mealType: z
    .enum(["breakfast", "lunch", "dinner", "snack", "meal"])
    .optional()
    .default("meal"),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (body?.mode === "manual") {
      const parsed = manualDietSchema.safeParse(body);
      if (!parsed.success || !isValidDateStr(parsed.data.date)) {
        return NextResponse.json(
          { error: "请填写有效的食物名称、热量与日期" },
          { status: 400 }
        );
      }

      const data = parsed.data;
      const log = await ensureDailyLog(data.date, DEFAULT_USER_ID);
      const created = await prisma.mealItem.create({
        data: {
          dailyLogId: log.id,
          date: data.date,
          mealType: data.mealType,
          rawInput: data.name,
          name: data.name.trim(),
          calories: Math.round(data.calories),
          protein: Number(data.protein.toFixed(1)),
          carbs: Number(data.carbs.toFixed(1)),
          fat: Number(data.fat.toFixed(1)),
          source: "manual",
        },
      });

      const daily = await getDailyLogDTO(data.date, DEFAULT_USER_ID);
      return NextResponse.json({ daily, added: [created] }, { status: 201 });
    }

    const parsed = geminiDietSchema.safeParse(body);
    if (!parsed.success || !isValidDateStr(parsed.data.date)) {
      return NextResponse.json(
        { error: "请提供有效的日期及饮食描述或食物照片" },
        { status: 400 }
      );
    }

    const data = parsed.data;
    if (!data.text?.trim() && !data.imageBase64) {
      return NextResponse.json(
        { error: "请输入今天吃了什么，或上传一张食物照片" },
        { status: 400 }
      );
    }

    const items = await parseDietWithGemini({
      text: data.text,
      imageBase64: data.imageBase64,
      imageMimeType: data.imageMimeType,
      preferredMealType: data.mealType,
    });

    const log = await ensureDailyLog(data.date, DEFAULT_USER_ID);
    const rawInput =
      data.text?.trim() || (data.imageBase64 ? "[食物照片]" : "饮食记录");

    const created = await prisma.$transaction(
      items.map((item) =>
        prisma.mealItem.create({
          data: {
            dailyLogId: log.id,
            date: data.date,
            mealType:
              data.mealType !== "auto" ? data.mealType : item.mealType || "meal",
            rawInput,
            name: item.name,
            calories: item.calories,
            protein: item.protein,
            carbs: item.carbs,
            fat: item.fat,
            source: "gemini",
          },
        })
      )
    );

    const daily = await getDailyLogDTO(data.date, DEFAULT_USER_ID);
    return NextResponse.json({ daily, added: created }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "饮食记录保存失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
