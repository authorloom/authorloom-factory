import type { ExecaError } from "execa";
import fs from "node:fs/promises";
import path from "node:path";

import {
  getRenderJobDetails,
  markRenderJobDone,
  markRenderJobFailed,
  markRenderJobRunning,
} from "@/lib/db";
import { paths } from "@/lib/paths";

const minRenderDurationSeconds = 6;
const maxRenderDurationSeconds = 8;
const thumbnailIntroDurationSeconds = 0.01;

const canvasWidth = 1080;
const canvasHeight = 1920;

// Organic Reels/TikTok safe area.
const safeTop = 160;
const safeBottom = 340;
const safeContentBottom = canvasHeight - safeBottom;

const maxScreenshotWidth = 820;
const minScreenshotWidth = 440;
const hookScreenshotGap = 8;
const defaultHookYOffset = 156;
const defaultLayoutVerticalNudge = -80;

type HookOverlayResult = {
  filepath: string;
  width: number;
  height: number;
};

type OverlayInput = {
  inputIndex: number;
  height: number;
};

type CoverOverlayInput = OverlayInput & {
  width: number;
};

type HookOverlayInput = OverlayInput & {
  startSeconds?: number;
  endSeconds?: number;
};

type MediaDimensions = {
  width: number;
  height: number;
};

type Layout = {
  screenshotWidth: number;
  screenshotY: number;
  hookY: number;
  hookHeight: number;
  footerHeight: number;
};

type RenderOptions = {
  backgroundStartTime?: number;
  backgroundEndTime?: number;
  playbackSpeed?: number;
  screenshotPlacement?: string;
  screenshotScale?: number;
  zoomLevel?: number;
  cropVariant?: string;
  durationSeconds?: number;
  hookPlacement?: string;
  hookSize?: number;
  metadataLinePlacement?: string;
  metadataLineSize?: number;
  layoutTemplate?: string;
  multiHookTexts?: string[];
  variationParameters?: Partial<RenderOptions> | null;
  proofAdjustments?: Partial<RenderOptions> | null;
  postCopy?: {
    keywords?: string[];
    keywordOrder?: string[];
    renderedBookTitleLine?: string | null;
  } | null;
};

async function runCommand(
  file: string,
  args: string[],
  options: { all?: boolean } = {},
) {
  const { execa } = await import("execa");
  return execa(file, args, options);
}

function getRandomRenderDurationSeconds() {
  return Math.floor(
    Math.random() * (maxRenderDurationSeconds - minRenderDurationSeconds + 1),
  ) + minRenderDurationSeconds;
}

function commandErrorMessage(error: unknown) {
  if (error instanceof Error) {
    const execaError = error as ExecaError;
    const output =
      typeof execaError.all === "string"
        ? execaError.all
        : [execaError.stdout, execaError.stderr]
            .filter((value): value is string => typeof value === "string")
            .join("\n");

    return [error.message, output ? `Output:\n${output}` : null]
      .filter(Boolean)
      .join("\n");
  }

  return "FFmpeg render failed.";
}

async function getMediaDimensions(filepath: string): Promise<MediaDimensions> {
  const result = await runCommand(
    "ffprobe",
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height",
      "-of",
      "json",
      filepath,
    ],
    { all: true },
  );

  const parsed = JSON.parse(result.stdout || "{}") as {
    streams?: Array<{ width?: number; height?: number }>;
  };

  const stream = parsed.streams?.[0];

  if (!stream?.width || !stream?.height) {
    throw new Error(`Could not read media dimensions for ${filepath}`);
  }

  return {
    width: stream.width,
    height: stream.height,
  };
}

async function getMediaDurationSeconds(filepath: string): Promise<number | null> {
  const result = await runCommand(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      filepath,
    ],
    { all: true },
  );
  const duration = Number.parseFloat(result.stdout.trim());

  return Number.isFinite(duration) && duration > 0 ? duration : null;
}

async function fileExists(filepath: string | null) {
  if (!filepath) {
    return false;
  }

  return fs
    .access(filepath)
    .then(() => true)
    .catch(() => false);
}

function isHeicFile(filepath: string) {
  return [".heic", ".heif"].includes(path.extname(filepath).toLowerCase());
}

async function prepareScreenshotForRender({
  campaignId,
  jobId,
  screenshotFilepath,
}: {
  campaignId: string;
  jobId: string;
  screenshotFilepath: string;
}) {
  if (!isHeicFile(screenshotFilepath)) {
    return {
      filepath: screenshotFilepath,
      temporary: false,
    };
  }

  const tempDirectory = path.join(paths.rendersDirectory, campaignId, ".tmp");
  const outputFilepath = path.join(tempDirectory, `${jobId}-screenshot.png`);

  await fs.mkdir(tempDirectory, { recursive: true });

  const converters =
    process.platform === "darwin"
      ? [
          {
            file: "sips",
            args: ["-s", "format", "png", screenshotFilepath, "--out", outputFilepath],
          },
          { file: "heif-convert", args: [screenshotFilepath, outputFilepath] },
          { file: "magick", args: [screenshotFilepath, outputFilepath] },
          { file: "convert", args: [screenshotFilepath, outputFilepath] },
          { file: "ffmpeg", args: ["-y", "-i", screenshotFilepath, outputFilepath] },
        ]
      : [
          { file: "heif-convert", args: [screenshotFilepath, outputFilepath] },
          { file: "magick", args: [screenshotFilepath, outputFilepath] },
          { file: "convert", args: [screenshotFilepath, outputFilepath] },
          { file: "ffmpeg", args: ["-y", "-i", screenshotFilepath, outputFilepath] },
        ];
  const errors: string[] = [];

  for (const converter of converters) {
    try {
      await runCommand(converter.file, converter.args, { all: true });
      await getMediaDimensions(outputFilepath);
      return {
        filepath: outputFilepath,
        temporary: true,
      };
    } catch (error) {
      errors.push(`${converter.file}: ${commandErrorMessage(error)}`);
    }
  }

  throw new Error(
    `Could not convert HEIC screenshot for render.\n${errors.join("\n\n")}`,
  );
}

function calculateLayout({
  screenshotDimensions,
  hookHeight,
  footerHeight = 0,
}: {
  screenshotDimensions: MediaDimensions;
  hookHeight: number;
  footerHeight?: number;
}): Layout {
  const hookY = safeTop + 20 + defaultHookYOffset;
  const screenshotY = hookY + hookHeight + hookScreenshotGap;
  const maxScreenshotBottom = safeContentBottom - footerHeight - 32;
  const availableScreenshotHeight = Math.max(
    320,
    maxScreenshotBottom - screenshotY,
  );

  const widthThatFitsHeight =
    screenshotDimensions.width *
    (availableScreenshotHeight / screenshotDimensions.height);

  const screenshotWidth = Math.max(
    Math.min(minScreenshotWidth, Math.floor(widthThatFitsHeight)),
    Math.min(maxScreenshotWidth, Math.floor(widthThatFitsHeight)),
  );

  return {
    screenshotWidth,
    hookY,
    screenshotY,
    hookHeight,
    footerHeight,
  };
}

function buildImageTextFilterComplex({
  layout,
  options,
  screenshotDimensions,
  hookOverlays = [],
  coverOverlay,
  metadataOverlay,
  keywordsOverlay,
  outputLabel = "vout",
}: {
  layout: Layout;
  options?: RenderOptions;
  screenshotDimensions: MediaDimensions;
  hookOverlays?: HookOverlayInput[];
  coverOverlay?: CoverOverlayInput | null;
  metadataOverlay?: OverlayInput | null;
  keywordsOverlay?: OverlayInput | null;
  outputLabel?: string;
}) {
  const effectiveOptions = {
    ...(options ?? {}),
    ...(options?.variationParameters ?? {}),
    ...(options?.proofAdjustments ?? {}),
  };
  const playbackSpeed = clampNumber(effectiveOptions.playbackSpeed, 0.95, 1.05, 1);
  const zoomLevel = clampNumber(effectiveOptions.zoomLevel, 1, 1.08, 1);
  const screenshotScale = clampNumber(
    effectiveOptions.screenshotScale,
    0.9,
    1.1,
    1,
  );
  const screenshotPlacement = effectiveOptions.screenshotPlacement ?? "center";
  const hookPlacement = effectiveOptions.hookPlacement ?? "auto";
  const layoutTemplate = effectiveOptions.layoutTemplate ?? "booktok_text_screenshot";
  const isCompactLayout = layoutTemplate === "booktok_compact_screenshot";
  const isCoverCenterLayout = layoutTemplate === "left_cover_center_screenshot";
  const isCoverOffsetLayout = layoutTemplate === "left_cover_offset_screenshot";
  const isCoverLayout = isCoverCenterLayout || isCoverOffsetLayout;
  const isFullBackgroundLayout = layoutTemplate === "booktok_full_background_multi_hook";
  const layoutVerticalNudge = isFullBackgroundLayout ? 0 : defaultLayoutVerticalNudge;
  const cropVariant = effectiveOptions.cropVariant ?? "center";
  const scaledCanvasWidth = Math.round(canvasWidth * zoomLevel);
  const scaledCanvasHeight = Math.round(canvasHeight * zoomLevel);
  const cropX =
    cropVariant === "left"
      ? "0"
      : cropVariant === "right"
        ? "iw-ow"
        : "(iw-ow)/2";
  const cropY =
    cropVariant === "top"
      ? "0"
      : cropVariant === "bottom"
        ? "ih-oh"
        : "(ih-oh)/2";
  const shotX = "(W-w)/2";
  const hookY =
    isFullBackgroundLayout
      ? Math.round(canvasHeight * 0.22)
      : isCompactLayout
        ? Math.round(canvasHeight * 0.28)
        : hookPlacement === "top"
      ? safeTop + defaultHookYOffset
      : hookPlacement === "upper-middle"
        ? safeTop + 120
        : hookPlacement === "middle"
          ? Math.round(canvasHeight * 0.32)
          : layout.hookY;
  const coverWidth = coverOverlay
    ? isCoverOffsetLayout
      ? 230
      : 210
    : 0;
  const coverHeight = coverOverlay
    ? Math.round(coverOverlay.height * (coverWidth / coverOverlay.width))
    : 0;
  const coverY = coverOverlay
    ? Math.max(Math.round(hookY + layout.hookHeight + 10), isCoverOffsetLayout ? 520 : 500)
    : 0;
  const copySafeBottom = canvasHeight - Math.round(safeBottom * 0.36);
  const copyBlockBottomPadding = 24;
  const copyGap = 10;
  const lowestMetadataY =
    copySafeBottom -
    copyBlockBottomPadding -
    (metadataOverlay?.height ?? 0) -
    (keywordsOverlay?.height ?? 0) -
    ((metadataOverlay && keywordsOverlay) ? 8 : 0);
  const minShotY = Math.round(
    coverOverlay
      ? coverY + coverHeight + 10
      : hookY + layout.hookHeight + hookScreenshotGap,
  );
  const maxShotBottom = Math.max(minShotY + 300, lowestMetadataY - copyGap);
  const availableShotHeight = Math.max(300, maxShotBottom - minShotY);
  const widthThatFitsAvailableHeight = Math.floor(
    screenshotDimensions.width * (availableShotHeight / screenshotDimensions.height),
  );
  const desiredScreenshotWidth = Math.round(
    (isCoverCenterLayout ? 560 : isCoverOffsetLayout ? 600 : maxScreenshotWidth) *
      screenshotScale,
  );
  const screenshotWidth = Math.max(
    320,
    Math.min(
      isCoverCenterLayout ? 560 : isCoverOffsetLayout ? 600 : maxScreenshotWidth,
      widthThatFitsAvailableHeight,
      desiredScreenshotWidth,
    ),
  );
  const screenshotHeight = Math.round(
    screenshotDimensions.height * (screenshotWidth / screenshotDimensions.width),
  );
  const shotYOffset =
    screenshotPlacement === "upper-center"
      ? -30
      : screenshotPlacement === "lower-center"
        ? 30
        : 0;
  const maxShotY = Math.max(minShotY, maxShotBottom - screenshotHeight);
  const centeredShotY =
    minShotY + Math.max(0, Math.round((availableShotHeight - screenshotHeight) / 2));
  const requestedShotY =
    (isCompactLayout ? maxShotY : isCoverLayout ? centeredShotY : centeredShotY) +
    shotYOffset;
  const shotY = Math.max(minShotY, Math.min(maxShotY, requestedShotY));

  const preferredMetadataY = Math.round(shotY + screenshotHeight + copyGap);
  const metadataY = Math.max(
    preferredMetadataY,
    Math.min(lowestMetadataY, preferredMetadataY + 24),
  );
  const keywordsY = Math.min(
    copySafeBottom - copyBlockBottomPadding - (keywordsOverlay?.height ?? 0),
    metadataY + (metadataOverlay?.height ?? 0) + 8,
  );
  const nudgedHookY = Math.max(safeTop + 16, hookY + layoutVerticalNudge);
  const nudgedShotY = Math.max(nudgedHookY + layout.hookHeight + 8, shotY + layoutVerticalNudge);
  const nudgedCoverY = coverOverlay
    ? Math.max(nudgedHookY + layout.hookHeight + 8, coverY + layoutVerticalNudge)
    : coverY;
  const nudgedMetadataY = Math.max(
    nudgedShotY + screenshotHeight + copyGap,
    metadataY + layoutVerticalNudge,
  );
  const nudgedKeywordsY = Math.max(
    nudgedMetadataY + (metadataOverlay?.height ?? 0) + 8,
    keywordsY + layoutVerticalNudge,
  );
  const textFilters: string[] = [];
  let currentLabel = coverOverlay ? "withcover" : "withhook";

  if (metadataOverlay) {
    textFilters.push(
      `[${metadataOverlay.inputIndex}:v]format=rgba[metadata]`,
      `[${currentLabel}][metadata]overlay=x=(W-w)/2:y=${nudgedMetadataY}[withmetadata]`,
    );
    currentLabel = "withmetadata";
  }

  if (keywordsOverlay) {
    textFilters.push(
      `[${keywordsOverlay.inputIndex}:v]format=rgba[keywords]`,
      `[${currentLabel}][keywords]overlay=x=(W-w)/2:y=${nudgedKeywordsY}[${outputLabel}]`,
    );
    currentLabel = outputLabel;
  }

  if (currentLabel !== outputLabel) {
    textFilters.push(`[${currentLabel}]null[${outputLabel}]`);
  }

  const baseFilters = [
    `[0:v]setpts=${(1 / playbackSpeed).toFixed(5)}*PTS,scale=${scaledCanvasWidth}:${scaledCanvasHeight}:force_original_aspect_ratio=increase,crop=${canvasWidth}:${canvasHeight}:${cropX}:${cropY}[bg]`,
  ];

  if (isFullBackgroundLayout) {
    const timedHookFilters: string[] = [];
    let timedHookInputLabel = "bg";

    hookOverlays.forEach((overlay, index) => {
      const hookLabel = `hook${index}`;
      const outputHookLabel = `withhook${index}`;
      const enable =
        typeof overlay.startSeconds === "number" &&
        typeof overlay.endSeconds === "number"
          ? `:enable='between(t,${overlay.startSeconds},${overlay.endSeconds})'`
          : "";

      timedHookFilters.push(
        `[${overlay.inputIndex}:v]format=rgba[${hookLabel}]`,
        `[${timedHookInputLabel}][${hookLabel}]overlay=x=(W-w)/2:y=${Math.round(nudgedHookY)}${enable}[${outputHookLabel}]`,
      );
      timedHookInputLabel = outputHookLabel;
    });

    if (timedHookInputLabel !== "withhook") {
      timedHookFilters.push(`[${timedHookInputLabel}]null[withhook]`);
    }

    return [
      ...baseFilters,
      ...timedHookFilters,
      ...textFilters,
    ].join(";");
  }

  return [
    ...baseFilters,
    "[2:v]format=rgba[hook]",
    `[1:v]scale=${screenshotWidth}:-2:force_original_aspect_ratio=decrease,setsar=1[shot]`,
    `[bg][shot]overlay=x=${shotX}:y=${Math.round(nudgedShotY)}[withshot]`,
    `[withshot][hook]overlay=x=(W-w)/2:y=${Math.round(nudgedHookY)}[withhook]`,
    ...(coverOverlay
      ? [
          `[${coverOverlay.inputIndex}:v]scale=${coverWidth}:-2:force_original_aspect_ratio=decrease,setsar=1[cover]`,
          `[withhook][cover]overlay=x=(W-w)/2:y=${Math.round(nudgedCoverY)}[withcover]`,
        ]
      : []),
    ...textFilters,
  ].join(";");
}

function wrapText(text: string, maxLineLength: number) {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const nextLine = currentLine ? `${currentLine} ${word}` : word;
    if (nextLine.length > maxLineLength && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = nextLine;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.join("\n");
}

async function createTextOverlayImage({
  campaignId,
  jobId,
  suffix,
  text,
  width,
  height,
  fontSize,
}: {
  campaignId: string;
  jobId: string;
  suffix: string;
  text: string;
  width: number;
  height: number;
  fontSize: number;
}) {
  const tempDirectory = path.join(paths.rendersDirectory, campaignId, ".tmp");
  const overlayFilepath = path.join(tempDirectory, `${jobId}-${suffix}.png`);
  const overlayConfigFilepath = path.join(tempDirectory, `${jobId}-${suffix}.json`);

  await fs.mkdir(tempDirectory, { recursive: true });
  await fs.writeFile(
    overlayConfigFilepath,
    JSON.stringify({
      fontCandidates: hookFontCandidates(),
      fontSize: String(fontSize),
      height,
      outputFilepath: overlayFilepath,
      text,
      width,
    }),
  );

  try {
    await runCommand(
      "node",
      [
        path.join(paths.projectRoot, "scripts", "render-hook-overlay.mjs"),
        overlayConfigFilepath,
      ],
      { all: true },
    );
  } finally {
    await fs.rm(overlayConfigFilepath, { force: true });
  }

  return {
    filepath: overlayFilepath,
    width,
    height,
  };
}

async function createPostCopyOverlays({
  campaignId,
  jobId,
  renderOptions,
}: {
  campaignId: string;
  jobId: string;
  renderOptions: RenderOptions;
}) {
  const postCopy = renderOptions.postCopy ?? null;
  const metadataLine = normaliseRenderedMetadataLine(
    postCopy?.renderedBookTitleLine?.trim() ?? "",
  );
  const keywords = (
    postCopy?.keywordOrder?.length ? postCopy.keywordOrder : postCopy?.keywords
  )?.filter((keyword): keyword is string => Boolean(keyword?.trim()));

  const metadataOverlay = metadataLine
    ? await createTextOverlayImage({
        campaignId,
        jobId,
        suffix: "metadata",
        text: wrapText(metadataLine, 44),
        width: 820,
        height: metadataLine.length > 44 ? 96 : 54,
        fontSize: 34,
      })
    : null;
  const keywordText = keywords?.length ? wrapText(keywords.join(" • "), 54) : "";
  const keywordsOverlay = keywordText
    ? await createTextOverlayImage({
        campaignId,
        jobId,
        suffix: "keywords",
        text: keywordText,
        width: 860,
        height: keywordText.includes("\n") ? 110 : 58,
        fontSize: 30,
      })
    : null;

  return {
    metadataOverlay,
    keywordsOverlay,
  };
}

function normaliseRenderedMetadataLine(value: string) {
  return value
    .replace(/\bBuy\b/gi, "Read")
    .replace(/\bGet\b/gi, "Read")
    .replace(/\bKDP\b/gi, "K U")
    .replace(/\bKindle\s+Unlimited\b/gi, "K U")
    .replace(/\bAmazon\b/gi, "K U")
    .replace(/\bon\s+K\s*U\b/gi, "in K U")
    .replace(/\bfrom\s+K\s*U\b/gi, "in K U")
    .replace(/\bat\s+K\s*U\b/gi, "in K U")
    .replace(/\s+/g, " ")
    .trim();
}

function clampNumber(
  value: number | undefined,
  min: number,
  max: number,
  fallback: number,
) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

function parseRenderOptions(value: string | null): RenderOptions {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as RenderOptions;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function buildThumbnailIntroFilterComplex({
  mainFilterComplex,
  thumbnailInputIndex,
  introDurationSeconds,
}: {
  mainFilterComplex: string;
  thumbnailInputIndex: number;
  introDurationSeconds: string;
}) {
  return [
    mainFilterComplex,
    `[${thumbnailInputIndex}:v]scale=${canvasWidth}:${canvasHeight}:force_original_aspect_ratio=increase,crop=${canvasWidth}:${canvasHeight},setsar=1[thumbv]`,
    `[mainv][thumbv]overlay=x=0:y=0:enable='between(t,0,${introDurationSeconds})'[vout]`,
  ].join(";");
}

function hookFontCandidates() {
  return [
    path.join(paths.projectRoot, "public", "fonts", "TikTokSans-Bold.ttf"),
    path.join(paths.projectRoot, "public", "fonts", "TikTokSans-Semibold.ttf"),
    path.join(paths.projectRoot, "public", "fonts", "ProximaNova-Semibold.ttf"),
    path.join(paths.projectRoot, "public", "fonts", "ProximaNova-SemiBold.ttf"),
    path.join(paths.projectRoot, "public", "fonts", "TikTokSans-Semibold.ttf"),
    path.join(paths.projectRoot, "public", "fonts", "TikTokSans-SemiBold.ttf"),
    path.join(paths.projectRoot, "public", "fonts", "Aveny-T.ttf"),
    path.join(paths.projectRoot, "public", "fonts", "AvenyT.ttf"),
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/Library/Fonts/Arial Unicode.ttf",
  ];
}

async function createHookOverlayImage(
  campaignId: string,
  jobId: string,
  hookText: string,
  suffix = "hook",
): Promise<HookOverlayResult> {
  const tempDirectory = path.join(paths.rendersDirectory, campaignId, ".tmp");
  const overlayFilepath = path.join(tempDirectory, `${jobId}-${suffix}.png`);
  const overlayConfigFilepath = path.join(tempDirectory, `${jobId}-${suffix}.json`);

  await fs.mkdir(tempDirectory, { recursive: true });

  const normalizedHook = hookText.replace(/\s+/g, " ").trim();

  const fontSize =
    normalizedHook.length > 160
      ? "42"
      : normalizedHook.length > 120
        ? "46"
        : normalizedHook.length > 90
          ? "50"
          : "58";

  const overlayHeight =
    normalizedHook.length > 160
      ? 440
      : normalizedHook.length > 120
        ? 380
        : normalizedHook.length > 90
          ? 330
          : 260;

  const overlayWidth = 820;

  await fs.writeFile(
    overlayConfigFilepath,
    JSON.stringify({
      fontCandidates: hookFontCandidates(),
      fontSize,
      height: overlayHeight,
      outputFilepath: overlayFilepath,
      text: normalizedHook,
      width: overlayWidth,
    }),
  );

  try {
    await runCommand(
      "node",
      [
        path.join(paths.projectRoot, "scripts", "render-hook-overlay.mjs"),
        overlayConfigFilepath,
      ],
      { all: true },
    );
  } finally {
    await fs.rm(overlayConfigFilepath, { force: true });
  }

  return {
    filepath: overlayFilepath,
    width: overlayWidth,
    height: overlayHeight,
  };
}

export async function renderJob(jobId: string) {
  const job = getRenderJobDetails(jobId);

  if (!job) {
    throw new Error("Render job not found.");
  }

  const renderOptions = parseRenderOptions(job.render_options_json);
  const layoutTemplate = renderOptions.layoutTemplate ?? "booktok_text_screenshot";
  const isCoverLayout =
    layoutTemplate === "left_cover_center_screenshot" ||
    layoutTemplate === "left_cover_offset_screenshot";
  const multiHookTexts = Array.isArray(renderOptions.multiHookTexts)
    ? renderOptions.multiHookTexts.filter((text) => Boolean(text?.trim()))
    : [];
  const isFullBackgroundMultiHook =
    renderOptions.layoutTemplate === "booktok_full_background_multi_hook" &&
    multiHookTexts.length > 0;
  const rawRequestedRenderDuration =
    renderOptions.durationSeconds ??
    job.render_duration_seconds ??
    getRandomRenderDurationSeconds();
  const audioDuration = job.audio_filepath
    ? await getMediaDurationSeconds(job.audio_filepath).catch(() => null)
    : null;
  const audioStartOffset = Math.max(0, job.audio_start_offset_seconds ?? 0);
  const availableAudioDuration =
    audioDuration === null ? null : Math.max(0.5, audioDuration - audioStartOffset);
  const requestedRenderDuration = isFullBackgroundMultiHook
    ? rawRequestedRenderDuration
    : clampNumber(
        rawRequestedRenderDuration,
        minRenderDurationSeconds,
        maxRenderDurationSeconds,
        getRandomRenderDurationSeconds(),
      );
  const renderDuration =
    availableAudioDuration === null
      ? requestedRenderDuration
      : Math.min(requestedRenderDuration, availableAudioDuration);

  if (
    isFullBackgroundMultiHook &&
    availableAudioDuration !== null &&
    availableAudioDuration < requestedRenderDuration
  ) {
    throw new Error(
      `Audio segment is too short for timed multi-hook render. Required ${requestedRenderDuration}s, available ${availableAudioDuration.toFixed(2)}s after start offset.`,
    );
  }

  const hasThumbnailFile = await fileExists(job.thumbnail_filepath);
  const hasCoverOverlay = isCoverLayout && hasThumbnailFile;
  const hasThumbnailIntro = hasThumbnailFile && !hasCoverOverlay;
  const renderDurationSeconds = String(renderDuration);
  const thumbnailIntroDuration = String(thumbnailIntroDurationSeconds);

  const outputFilename = `${job.id}.mp4`;
  const outputDirectory = path.join(paths.rendersDirectory, job.campaign_id);
  const outputFilepath = path.join(outputDirectory, outputFilename);

  await fs.mkdir(outputDirectory, { recursive: true });
  markRenderJobRunning(job.id);

  const hookOverlay = isFullBackgroundMultiHook
    ? null
    : await createHookOverlayImage(job.campaign_id, job.id, job.hook_text);
  const timedHookOverlays = isFullBackgroundMultiHook
    ? await Promise.all(
        multiHookTexts.map((hookText, index) =>
          createHookOverlayImage(job.campaign_id, job.id, hookText, `hook-${index}`),
        ),
      )
    : [];
  const postCopyOverlays = await createPostCopyOverlays({
    campaignId: job.campaign_id,
    jobId: job.id,
    renderOptions,
  });
  const preparedScreenshot = await prepareScreenshotForRender({
    campaignId: job.campaign_id,
    jobId: job.id,
    screenshotFilepath: job.screenshot_filepath,
  });

  const screenshotDimensions = await getMediaDimensions(preparedScreenshot.filepath);
  const footerHeight =
    (postCopyOverlays.metadataOverlay?.height ?? 0) +
    (postCopyOverlays.keywordsOverlay?.height ?? 0) +
    96;
  const timedHookHeight = Math.max(
    0,
    ...timedHookOverlays.map((overlay) => overlay.height),
  );
  const layout = hookOverlay
    ? calculateLayout({
        screenshotDimensions,
        hookHeight: hookOverlay.height,
        footerHeight,
      })
    : timedHookHeight > 0
      ? calculateLayout({
          screenshotDimensions,
          hookHeight: timedHookHeight,
          footerHeight,
        })
    : null;

  const args = [
    "-y",
    "-stream_loop",
    "-1",
  ];

  if (
    typeof renderOptions.backgroundStartTime === "number" &&
    renderOptions.backgroundStartTime > 0
  ) {
    args.push("-ss", String(renderOptions.backgroundStartTime));
  }

  args.push(
    "-i",
    job.background_filepath,
    "-i",
    preparedScreenshot.filepath,
  );

  let nextInputIndex = 2;

  if (hookOverlay) {
    args.push("-i", hookOverlay.filepath);
    nextInputIndex += 1;
  }

  const timedHookOverlayInputs: HookOverlayInput[] = [];

  if (timedHookOverlays.length > 0) {
    timedHookOverlays.forEach((overlay, index) => {
      args.push("-i", overlay.filepath);
      timedHookOverlayInputs.push({
        inputIndex: nextInputIndex,
        height: overlay.height,
        startSeconds: index * 3,
        endSeconds: (index + 1) * 3,
      });
      nextInputIndex += 1;
    });
  }

  const metadataOverlayInputIndex = postCopyOverlays.metadataOverlay
    ? nextInputIndex
    : null;

  if (postCopyOverlays.metadataOverlay) {
    args.push("-i", postCopyOverlays.metadataOverlay.filepath);
    nextInputIndex += 1;
  }

  const keywordsOverlayInputIndex = postCopyOverlays.keywordsOverlay
    ? nextInputIndex
    : null;

  if (postCopyOverlays.keywordsOverlay) {
    args.push("-i", postCopyOverlays.keywordsOverlay.filepath);
    nextInputIndex += 1;
  }

  const thumbnailInputIndex = hasThumbnailIntro ? nextInputIndex : null;
  const coverInputIndex = hasCoverOverlay ? nextInputIndex : null;

  if ((hasThumbnailIntro || hasCoverOverlay) && job.thumbnail_filepath) {
    args.push(
      "-loop",
      "1",
      "-i",
      job.thumbnail_filepath,
    );
    nextInputIndex += 1;
  }

  const audioInputIndex = job.audio_filepath ? nextInputIndex : null;

  if (job.audio_filepath) {
    if (job.audio_start_offset_seconds && job.audio_start_offset_seconds > 0) {
      args.push("-ss", String(job.audio_start_offset_seconds));
    }
    args.push("-i", job.audio_filepath);
  }

  const mainFilterComplex = buildImageTextFilterComplex({
    layout:
      layout ?? {
        hookY: safeTop,
        hookHeight: hookOverlay?.height ?? 260,
        screenshotY: 700,
        screenshotWidth: maxScreenshotWidth,
        footerHeight,
      },
    options: renderOptions,
    screenshotDimensions,
    hookOverlays: timedHookOverlayInputs,
    coverOverlay:
      hasCoverOverlay && coverInputIndex !== null && job.thumbnail_filepath
        ? {
            inputIndex: coverInputIndex,
            ...(await getMediaDimensions(job.thumbnail_filepath)),
          }
        : null,
    metadataOverlay:
      postCopyOverlays.metadataOverlay && metadataOverlayInputIndex !== null
        ? {
            inputIndex: metadataOverlayInputIndex,
            height: postCopyOverlays.metadataOverlay.height,
          }
        : null,
    keywordsOverlay:
      postCopyOverlays.keywordsOverlay && keywordsOverlayInputIndex !== null
        ? {
            inputIndex: keywordsOverlayInputIndex,
            height: postCopyOverlays.keywordsOverlay.height,
          }
        : null,
    outputLabel: hasThumbnailIntro ? "mainv" : "vout",
  });

  const filterComplex =
    hasThumbnailIntro && thumbnailInputIndex !== null
      ? buildThumbnailIntroFilterComplex({
          mainFilterComplex,
          thumbnailInputIndex,
          introDurationSeconds: thumbnailIntroDuration,
        })
      : mainFilterComplex;

  args.push(
    "-filter_complex",
    filterComplex,
    "-t",
    renderDurationSeconds,
    "-map",
    "[vout]",
  );

  if (job.audio_filepath) {
    args.push(
      "-map",
      `${audioInputIndex}:a:0`,
      "-c:a",
      "aac",
      "-shortest",
    );
  }

  args.push(
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    outputFilepath,
  );

  try {
    console.log("Render job inputs:", {
      jobId: job.id,
      background: job.background_filepath,
      screenshot: preparedScreenshot.filepath,
      originalScreenshot: job.screenshot_filepath,
      screenshotDimensions,
      audio: job.audio_filepath,
      thumbnail: hasThumbnailIntro ? job.thumbnail_filepath : null,
      output: outputFilepath,
      renderDurationSeconds,
      thumbnailIntroDuration: hasThumbnailIntro
        ? thumbnailIntroDuration
        : null,
      hookOverlay,
      timedHookOverlays,
      layout,
      renderOptions,
      postCopyOverlays,
      safeArea: {
        safeTop,
        safeBottom,
        safeContentBottom,
      },
    });

    console.log("FFmpeg args:", args.join(" "));

    await runCommand("ffmpeg", args, { all: true });

    markRenderJobDone({
      jobId: job.id,
      outputFilename,
      outputFilepath,
    });

    return {
      outputFilename,
      outputFilepath,
    };
  } catch (error) {
    const message = commandErrorMessage(error);
    markRenderJobFailed(job.id, message);
    throw new Error(message);
  } finally {
    if (hookOverlay) {
      await fs.rm(hookOverlay.filepath, { force: true });
    }
    await Promise.all(
      timedHookOverlays.map((overlay) => fs.rm(overlay.filepath, { force: true })),
    );
    await Promise.all(
      [
        postCopyOverlays.metadataOverlay?.filepath,
        postCopyOverlays.keywordsOverlay?.filepath,
        preparedScreenshot.temporary ? preparedScreenshot.filepath : null,
      ]
        .filter((filepath): filepath is string => Boolean(filepath))
        .map((filepath) => fs.rm(filepath, { force: true })),
    );
  }
}
