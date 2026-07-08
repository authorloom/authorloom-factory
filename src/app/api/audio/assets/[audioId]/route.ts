import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  deleteUnusedAudioAsset,
  getAudioAsset,
  updateAudioAssetTags,
} from "@/lib/db";
import { paths } from "@/lib/paths";

export const runtime = "nodejs";

type AudioAssetContext = {
  params: Promise<{
    audioId: string;
  }>;
};

const audioTagsSchema = z.object({
  tags: z.array(z.string()).default([]),
});

function isInsideDirectory(filepath: string, directory: string) {
  const relativePath = path.relative(directory, filepath);

  return Boolean(relativePath) && !relativePath.startsWith("..") && !path.isAbsolute(relativePath);
}

async function removeFileIfSafe(filepath: string, directory: string) {
  if (!isInsideDirectory(filepath, directory)) {
    return;
  }

  await fs.rm(filepath, { force: true });
}

async function removeSourceVideoIfSafe(audioId: string, campaignId: string | null) {
  const storageKey = campaignId ?? "global";
  const sourceDirectory = path.join(paths.sourceVideosDirectory, storageKey);

  let entries: string[];

  try {
    entries = await fs.readdir(sourceDirectory);
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return;
    }

    throw error;
  }

  await Promise.all(
    entries
      .filter((entry) => entry.startsWith(`${audioId}-source.`))
      .map((entry) => removeFileIfSafe(path.join(sourceDirectory, entry), sourceDirectory)),
  );
}

function getAudioContentType(filepath: string) {
  const extension = path.extname(filepath).toLowerCase();

  if (extension === ".mp3") {
    return "audio/mpeg";
  }

  if (extension === ".wav") {
    return "audio/wav";
  }

  if (extension === ".aac") {
    return "audio/aac";
  }

  return "audio/mp4";
}

function parseRangeHeader(rangeHeader: string, fileSize: number) {
  const rangeMatch = rangeHeader.match(/^bytes=(\d*)-(\d*)$/);

  if (!rangeMatch) {
    return null;
  }

  const [, startValue, endValue] = rangeMatch;
  let start = startValue ? Number(startValue) : 0;
  let end = endValue ? Number(endValue) : fileSize - 1;

  if (!startValue && endValue) {
    const suffixLength = Number(endValue);
    start = Math.max(fileSize - suffixLength, 0);
    end = fileSize - 1;
  }

  if (
    Number.isNaN(start) ||
    Number.isNaN(end) ||
    start < 0 ||
    end < start ||
    start >= fileSize
  ) {
    return null;
  }

  return {
    start,
    end: Math.min(end, fileSize - 1),
  };
}

function fileStream(filepath: string, options?: { start?: number; end?: number }) {
  return Readable.toWeb(createReadStream(filepath, options)) as ReadableStream;
}

export async function GET(request: Request, context: AudioAssetContext) {
  const { audioId } = await context.params;
  const audioAsset = getAudioAsset(audioId);

  if (!audioAsset) {
    return NextResponse.json({ error: "Audio asset not found." }, { status: 404 });
  }

  try {
    const stat = await fs.stat(audioAsset.filepath);
    const contentType = getAudioContentType(audioAsset.filepath);
    const rangeHeader = request.headers.get("range");

    if (rangeHeader) {
      const range = parseRangeHeader(rangeHeader, stat.size);

      if (!range) {
        return new Response(null, {
          status: 416,
          headers: {
            "Accept-Ranges": "bytes",
            "Content-Range": `bytes */${stat.size}`,
          },
        });
      }

      const contentLength = range.end - range.start + 1;

      return new Response(fileStream(audioAsset.filepath, range), {
        status: 206,
        headers: {
          "Accept-Ranges": "bytes",
          "Content-Length": String(contentLength),
          "Content-Range": `bytes ${range.start}-${range.end}/${stat.size}`,
          "Content-Type": contentType,
        },
      });
    }

    return new Response(fileStream(audioAsset.filepath), {
      headers: {
        "Accept-Ranges": "bytes",
        "Content-Length": String(stat.size),
        "Content-Type": contentType,
      },
    });
  } catch (error) {
    console.error("Audio preview read failed.", error);

    return NextResponse.json({ error: "Audio file not found." }, { status: 404 });
  }
}

export async function DELETE(request: Request, context: AudioAssetContext) {
  try {
    const { audioId } = await context.params;
    const deletedAudio = deleteUnusedAudioAsset(audioId);

    await removeFileIfSafe(deletedAudio.filepath, paths.audioDirectory);
    await removeSourceVideoIfSafe(deletedAudio.id, deletedAudio.campaign_id);

    return NextResponse.json({ deleted: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Audio delete failed.";
    console.error("Audio delete failed.", error);

    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(request: Request, context: AudioAssetContext) {
  try {
    const { audioId } = await context.params;
    const payload = audioTagsSchema.safeParse(await request.json());

    if (!payload.success) {
      return NextResponse.json(
        { error: z.prettifyError(payload.error) },
        { status: 400 },
      );
    }

    const tags = updateAudioAssetTags(audioId, payload.data.tags);

    return NextResponse.json({ tags });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Audio tag update failed.";
    console.error("Audio tag update failed.", error);

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
