import { NextResponse } from "next/server";
import { z } from "zod";
import { transcribeDietAudioWithGemini } from "@/lib/gemini-diet";

const transcribeSchema = z.object({
  audioBase64: z.string().min(10).max(15_000_000),
  audioMimeType: z.string().max(100).optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = transcribeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "未收到有效的语音录音数据" },
        { status: 400 }
      );
    }

    const text = await transcribeDietAudioWithGemini({
      audioBase64: parsed.data.audioBase64,
      audioMimeType: parsed.data.audioMimeType,
    });

    if (!text) {
      return NextResponse.json(
        { error: "没有听清说话内容，请靠近麦克风再试一次" },
        { status: 422 }
      );
    }

    return NextResponse.json({ text });
  } catch (error) {
    const message = error instanceof Error ? error.message : "语音转文字失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
