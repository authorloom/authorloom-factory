import { NextResponse } from "next/server";
import { z } from "zod";

import { importAudioFromSource } from "@/lib/audio";

export const runtime = "nodejs";

const globalAudioImportSchema = z.object({
  title: z.string().trim().min(1, "Audio title is required."),
  sourceUrl: z.url("Enter a valid source URL."),
});

export async function POST(request: Request) {
  try {
    const payload = globalAudioImportSchema.safeParse(await request.json());

    if (!payload.success) {
      return NextResponse.json(
        { error: z.prettifyError(payload.error) },
        { status: 400 },
      );
    }

    const importedAudio = await importAudioFromSource({
      title: payload.data.title,
      sourceUrl: payload.data.sourceUrl,
    });

    return NextResponse.json(importedAudio);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Global audio import failed.";
    console.error("Global audio import failed.", error);

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
