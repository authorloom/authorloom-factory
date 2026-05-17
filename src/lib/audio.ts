import { execa, type ExecaError } from "execa";
import fs from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";

import { createAudioAsset } from "@/lib/db";
import { paths } from "@/lib/paths";

type ImportAudioInput = {
  campaignId?: string | null;
  title: string;
  sourceUrl: string;
};

type CommandFailure = {
  message: string;
  command?: string;
  output?: string;
};

function commandErrorMessage(error: unknown, fallback: string): CommandFailure {
  if (error instanceof Error) {
    const execaError = error as ExecaError;
    const output =
      typeof execaError.all === "string"
        ? execaError.all
        : [execaError.stdout, execaError.stderr]
            .filter((value): value is string => typeof value === "string")
            .join("\n");

    return {
      message: error.message || fallback,
      command: execaError.command,
      output: output || undefined,
    };
  }

  return { message: fallback };
}

function formatYtDlpError(details: CommandFailure) {
  const output = details.output ?? "";
  const combinedDetails = [details.message, output].join("\n");

  if (
    combinedDetails.includes("Unsupported URL") &&
    combinedDetails.includes("tiktok.com") &&
    combinedDetails.includes("/photo/")
  ) {
    return [
      "TikTok photo/carousel posts are not supported for audio import.",
      "This short link resolves to a TikTok /photo/ post, not a standard /video/ post, so yt-dlp cannot extract audio from it.",
      "Use a TikTok video URL or another source video/audio URL instead.",
    ].join("\n");
  }

  return [
    "yt-dlp download failed.",
    details.message,
    details.output ? `Output:\n${details.output}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

async function findDownloadedSourceFile(directory: string, filePrefix: string) {
  const entries = await fs.readdir(directory);
  const sourceFilename = entries.find(
    (entry) =>
      entry.startsWith(`${filePrefix}.`) &&
      !entry.endsWith(".part") &&
      !entry.endsWith(".ytdl"),
  );

  if (!sourceFilename) {
    throw new Error("yt-dlp completed but no source file was found.");
  }

  return path.join(directory, sourceFilename);
}

export async function importAudioFromSource({
  campaignId,
  title,
  sourceUrl,
}: ImportAudioInput) {
  const trimmedTitle = title.trim();
  const trimmedSourceUrl = sourceUrl.trim();

  if (!trimmedTitle) {
    throw new Error("Audio title is required.");
  }

  if (!trimmedSourceUrl) {
    throw new Error("Source URL is required.");
  }

  const id = nanoid();
  const storageKey = campaignId ?? "global";
  const sourceDirectory = path.join(paths.sourceVideosDirectory, storageKey);
  const audioDirectory = path.join(paths.audioDirectory, storageKey);
  const sourcePrefix = `${id}-source`;
  const sourceOutputTemplate = path.join(sourceDirectory, `${sourcePrefix}.%(ext)s`);
  const audioFilename = `${id}.m4a`;
  const audioFilepath = path.join(audioDirectory, audioFilename);

  await fs.mkdir(sourceDirectory, { recursive: true });
  await fs.mkdir(audioDirectory, { recursive: true });

  try {
    await execa("yt-dlp", ["-o", sourceOutputTemplate, trimmedSourceUrl], {
      all: true,
    });
  } catch (error) {
    const details = commandErrorMessage(error, "yt-dlp download failed.");
    throw new Error(formatYtDlpError(details));
  }

  const sourceFilepath = await findDownloadedSourceFile(
    sourceDirectory,
    sourcePrefix,
  );

  try {
    await execa(
      "ffmpeg",
      ["-y", "-i", sourceFilepath, "-vn", "-c:a", "aac", audioFilepath],
      { all: true },
    );
  } catch (error) {
    const details = commandErrorMessage(error, "FFmpeg audio extraction failed.");
    throw new Error(
      [
        "FFmpeg audio extraction failed.",
        details.message,
        details.output ? `Output:\n${details.output}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }

  const audioAssetId = createAudioAsset({
    id,
    campaignId: campaignId ?? null,
    title: trimmedTitle,
    sourceUrl: trimmedSourceUrl,
    filename: audioFilename,
    filepath: audioFilepath,
  });

  return {
    audioAssetId,
    title: trimmedTitle,
    sourceFilepath,
    audioFilepath,
  };
}
