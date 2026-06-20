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

const minRenderDurationSeconds = 5;
const maxRenderDurationSeconds = 8;
const ffmpegTimeoutMs = Math.max(
  30_000,
  Number(process.env.AUTHORLOOM_FFMPEG_TIMEOUT_MS ?? 420_000),
);

const canvasWidth = 1080;
const canvasHeight = 1920;
const layoutStudioTypographyScale = 2;
const outputFps = 30;
const outputVideoBitrate = "10M";
const outputVideoMaxrate = "12M";
const outputVideoBufsize = "20M";
const outputAudioBitrate = "128k";
const outputAudioSampleRate = "48000";

// Organic Reels/TikTok safe area.
const safeTop = 160;
const safeBottom = 340;
const safeContentBottom = canvasHeight - safeBottom;

const maxScreenshotWidth = 820;
const minScreenshotWidth = 440;
const hookScreenshotGap = 8;
const defaultHookYOffset = 156;
const defaultLayoutVerticalNudge = -160;

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
  layoutTemplateId?: string;
  layoutTemplateJson?: CanvasLayoutTemplate | null;
  layoutTemplateAlternates?: {
    portrait?: CanvasLayoutTemplateAlternate | null;
    landscape?: CanvasLayoutTemplateAlternate | null;
  } | null;
  layoutStudioAssets?: {
    introFilepath?: string | null;
    introDurationSeconds?: number | null;
    outroFilepath?: string | null;
    outroDurationSeconds?: number | null;
  } | null;
  multiHookTexts?: string[];
  variationParameters?: Partial<RenderOptions> | null;
  proofAdjustments?: Partial<RenderOptions> | null;
  postCopy?: {
    keywords?: string[];
    keywordOrder?: string[];
    ctaText?: string | null;
    tropes?: string[];
    renderedBookTitleLine?: string | null;
  } | null;
};

function renderOptionAdjustments(
  options: Partial<RenderOptions> | null | undefined,
) {
  if (!options) return {};
  const adjustments = { ...options };

  delete adjustments.layoutTemplate;
  delete adjustments.layoutTemplateId;
  delete adjustments.layoutTemplateJson;
  delete adjustments.layoutTemplateAlternates;
  delete adjustments.variationParameters;
  delete adjustments.proofAdjustments;
  return adjustments;
}

type CanvasLayoutTemplateAlternate = {
  layoutId?: string | null;
  renderTemplateId?: string | null;
  templateJson?: CanvasLayoutTemplate | null;
};

type CanvasLayoutBox = {
  enabled?: boolean;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  label?: string;
  fit?: "contain" | "cover" | "text-fit";
};

type CanvasLayoutTemplate = {
  version?: number;
  kind?: string;
  canvas?: { width?: number; height?: number };
  safeArea?: { x?: number; y?: number; width?: number; height?: number };
  renderTemplateId?: string;
  elements?:
    | Partial<Record<"hook" | "cover" | "screenshot" | "metadataLine" | "keywords", CanvasLayoutBox>>
    | LayoutStudioElement[];
  scenes?: Array<{
    elements?: LayoutStudioElement[];
  }>;
  overlay?: {
    platform?: "tiktok" | "instagram" | null;
  };
  timeline?: {
    backgroundMode?: "none" | "video" | "image" | "inherit";
    backgroundId?: string;
    previewDurationSeconds?: number;
    introEnabled?: boolean;
    introAssetFamily?: "cover" | "image";
    introDurationSeconds?: number;
    outroEnabled?: boolean;
    outroAssetFamily?: "cover" | "image";
    outroDurationSeconds?: number;
  };
};

type LayoutStudioElement = {
  id?: string;
  type?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotation?: number;
  horizontalAlign?: "left" | "center" | "right";
  verticalAlign?: "top" | "middle" | "bottom";
  fit?: "contain" | "cover";
  padding?: number;
  gap?: number;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  lineHeight?: number;
  italic?: boolean;
  textColor?: string;
  backgroundColor?: string;
  backgroundOpacity?: number;
  containerOutline?: boolean;
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number;
  shadow?: boolean;
  shadowColor?: string;
  shadowBlur?: number;
  shadowDistance?: number;
  textWrap?: boolean;
  textWrapColor?: string;
  textWrapOpacity?: number;
  textWrapRadius?: number;
  textWrapPaddingX?: number;
  textWrapPaddingY?: number;
  outlineColor?: string;
  outlineWidth?: number;
  rule?: "none" | "stackAboveScreenshot";
  stackAnchor?: "top" | "middle" | "bottom";
};

type LayoutStudioResolvedElement = LayoutStudioElement & {
  x: number;
  y: number;
  width: number;
  height: number;
};

type StudioTextOverlayInput = OverlayInput & {
  element: LayoutStudioResolvedElement;
  width: number;
};

type StudioTimelineOverlayInput = OverlayInput & {
  width: number;
  startSeconds: number;
  endSeconds: number;
};

async function runCommand(
  file: string,
  args: string[],
  options: { all?: boolean } = {},
) {
  const { execa } = await import("execa");
  return execa(file, args, {
    ...options,
    timeout: ffmpegTimeoutMs,
    killSignal: "SIGKILL",
  });
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

function isStillImageFile(filepath: string) {
  return [".avif", ".gif", ".jpeg", ".jpg", ".png", ".webp"].includes(
    path.extname(filepath).toLowerCase(),
  );
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
  hookOverlayInputIndex,
  hookOverlays = [],
  coverOverlay,
  metadataOverlay,
  keywordsOverlay,
  studioTextOverlays = [],
  studioTimeline,
  outputLabel = "vout",
}: {
  layout: Layout;
  options?: RenderOptions;
  screenshotDimensions: MediaDimensions;
  hookOverlayInputIndex?: number | null;
  hookOverlays?: HookOverlayInput[];
  coverOverlay?: CoverOverlayInput | null;
  metadataOverlay?: OverlayInput | null;
  keywordsOverlay?: OverlayInput | null;
  studioTextOverlays?: StudioTextOverlayInput[];
  studioTimeline?: {
    mainStartSeconds: number;
    mainEndSeconds: number;
    introOverlay?: StudioTimelineOverlayInput | null;
    outroOverlay?: StudioTimelineOverlayInput | null;
  };
  outputLabel?: string;
}) {
  const effectiveOptions = {
    ...(options ?? {}),
    ...renderOptionAdjustments(options?.variationParameters),
    ...renderOptionAdjustments(options?.proofAdjustments),
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
  const coverX = coverOverlay
    ? isCoverLayout
      ? Math.round(canvasWidth * 0.34 - coverWidth / 2)
      : "(W-w)/2"
    : "(W-w)/2";
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
    (isCompactLayout ? maxShotY : isCoverLayout ? minShotY : centeredShotY) +
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
  const customTemplate = customCanvasTemplate(effectiveOptions);
  const studioTemplate = layoutStudioTemplate(effectiveOptions);

  if (studioTemplate) {
    return buildLayoutStudioFilterComplex({
      baseFilters,
      coverOverlay,
      outputLabel,
      screenshotDimensions,
      studioTemplate,
      studioTimeline,
      studioTextOverlays,
    });
  }

  if (customTemplate && !isFullBackgroundLayout) {
    const filters = [...baseFilters];
    let customCurrentLabel = "bg";
    const screenshotBox = customElementBox(customTemplate, "screenshot");
    const hookBox = customElementBox(customTemplate, "hook");
    const coverBox = customElementBox(customTemplate, "cover");
    const metadataBox = customElementBox(customTemplate, "metadataLine");
    const keywordsBox = customElementBox(customTemplate, "keywords");

    if (screenshotBox) {
      const shot = fitMediaIntoBox(screenshotBox, screenshotDimensions, {
        verticalAlign: "bottom",
      });
      filters.push(
        `[1:v]scale=${shot.width}:-2:force_original_aspect_ratio=decrease,setsar=1[shot]`,
        `[${customCurrentLabel}][shot]overlay=x=${shot.x}:y=${shot.y}[withshot]`,
      );
      customCurrentLabel = "withshot";
    }

    if (hookBox && typeof hookOverlayInputIndex === "number") {
      filters.push(
        `[${hookOverlayInputIndex}:v]format=rgba[hook]`,
        `[${customCurrentLabel}][hook]overlay=x=${Math.round(hookBox.x)}:y=${Math.round(hookBox.y)}[withhook]`,
      );
      customCurrentLabel = "withhook";
    }

    if (coverOverlay && coverBox) {
      const cover = fitMediaIntoBox(coverBox, {
        width: coverOverlay.width,
        height: coverOverlay.height,
      });
      filters.push(
        `[${coverOverlay.inputIndex}:v]scale=w=${cover.width}:h=-2:force_original_aspect_ratio=decrease:flags=lanczos:in_range=pc:out_range=pc,setsar=1,format=rgba[cover]`,
        `[${customCurrentLabel}][cover]overlay=x=${cover.x}:y=${cover.y}[withcover]`,
      );
      customCurrentLabel = "withcover";
    }

    if (metadataOverlay && metadataBox) {
      filters.push(
        `[${metadataOverlay.inputIndex}:v]format=rgba[metadata]`,
        `[${customCurrentLabel}][metadata]overlay=x=${Math.round(metadataBox.x)}:y=${Math.round(metadataBox.y)}[withmetadata]`,
      );
      customCurrentLabel = "withmetadata";
    }

    if (keywordsOverlay && keywordsBox) {
      filters.push(
        `[${keywordsOverlay.inputIndex}:v]format=rgba[keywords]`,
        `[${customCurrentLabel}][keywords]overlay=x=${Math.round(keywordsBox.x)}:y=${Math.round(keywordsBox.y)}[${outputLabel}]`,
      );
      customCurrentLabel = outputLabel;
    }

    if (customCurrentLabel !== outputLabel) {
      filters.push(`[${customCurrentLabel}]null[${outputLabel}]`);
    }

    return filters.join(";");
  }

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
    `[${hookOverlayInputIndex ?? 2}:v]format=rgba[hook]`,
    `[1:v]scale=${screenshotWidth}:-2:force_original_aspect_ratio=decrease,setsar=1[shot]`,
    `[bg][shot]overlay=x=${shotX}:y=${Math.round(nudgedShotY)}[withshot]`,
    `[withshot][hook]overlay=x=(W-w)/2:y=${Math.round(nudgedHookY)}[withhook]`,
    ...(coverOverlay
      ? [
          `[${coverOverlay.inputIndex}:v]scale=w=${coverWidth}:h=-2:force_original_aspect_ratio=decrease:flags=lanczos:in_range=pc:out_range=pc,setsar=1,format=rgba[cover]`,
          `[withhook][cover]overlay=x=${coverX}:y=${Math.round(nudgedCoverY)}[withcover]`,
        ]
      : []),
    ...textFilters,
  ].join(";");
}

function buildLayoutStudioFilterComplex({
  baseFilters,
  coverOverlay,
  outputLabel,
  screenshotDimensions,
  studioTemplate,
  studioTimeline,
  studioTextOverlays,
}: {
  baseFilters: string[];
  coverOverlay?: CoverOverlayInput | null;
  outputLabel: string;
  screenshotDimensions: MediaDimensions;
  studioTemplate: CanvasLayoutTemplate;
  studioTimeline?: {
    mainStartSeconds: number;
    mainEndSeconds: number;
    introOverlay?: StudioTimelineOverlayInput | null;
    outroOverlay?: StudioTimelineOverlayInput | null;
  };
  studioTextOverlays: StudioTextOverlayInput[];
}) {
  const elements = resolveLayoutStudioElements(studioTemplate, screenshotDimensions);
  const textOverlayByElementId = new Map(
    studioTextOverlays.map((overlay) => [studioElementKey(overlay.element), overlay]),
  );
  const filters = [...baseFilters];
  let currentLabel = "bg";
  let mediaIndex = 0;
  let textIndex = 0;
  const mainEnable = studioTimeline
    ? `:enable='between(t,${studioTimeline.mainStartSeconds},${studioTimeline.mainEndSeconds})'`
    : "";

  for (const element of elements) {
    const elementType = element.type;

    if (elementType === "screenshot") {
      const media = fitMediaIntoStudioElement(element, screenshotDimensions, mediaIndex);
      filters.push(
        ...media.filters("[1:v]", `studio_shot_${mediaIndex}`),
        `[${currentLabel}][studio_shot_${mediaIndex}]overlay=x=${studioOverlayX(element, media.x)}:y=${studioOverlayY(element, media.y)}${mainEnable}[studio_after_${mediaIndex}]`,
      );
      currentLabel = `studio_after_${mediaIndex}`;
      mediaIndex += 1;
      continue;
    }

    if (elementType === "cover" && coverOverlay) {
      const media = fitMediaIntoStudioElement(
        element,
        { width: coverOverlay.width, height: coverOverlay.height },
        mediaIndex,
      );
      filters.push(
        ...media.filters(`[${coverOverlay.inputIndex}:v]`, `studio_cover_${mediaIndex}`),
        `[${currentLabel}][studio_cover_${mediaIndex}]overlay=x=${studioOverlayX(element, media.x)}:y=${studioOverlayY(element, media.y)}${mainEnable}[studio_after_${mediaIndex}]`,
      );
      currentLabel = `studio_after_${mediaIndex}`;
      mediaIndex += 1;
      continue;
    }

    if (isLayoutStudioTextElement(element)) {
      const overlay = textOverlayByElementId.get(studioElementKey(element));

      if (!overlay) continue;

      filters.push(
        ...studioOverlayInputFilters(
          `[${overlay.inputIndex}:v]`,
          `studio_text_${textIndex}`,
          element,
        ),
        `[${currentLabel}][studio_text_${textIndex}]overlay=x=${studioCenteredOverlayX(element)}:y=${studioCenteredOverlayY(element)}${mainEnable}[studio_text_after_${textIndex}]`,
      );
      currentLabel = `studio_text_after_${textIndex}`;
      textIndex += 1;
    }
  }

  for (const [key, overlay] of [
    ["intro", studioTimeline?.introOverlay],
    ["outro", studioTimeline?.outroOverlay],
  ] as const) {
    if (!overlay) continue;
    const label = `studio_${key}_timeline`;
    const afterLabel = `studio_${key}_after`;
    filters.push(
      `[${overlay.inputIndex}:v]scale=${canvasWidth}:${canvasHeight}:force_original_aspect_ratio=increase,crop=${canvasWidth}:${canvasHeight}:(iw-ow)/2:(ih-oh)/2,setsar=1,format=rgba[${label}]`,
      `[${currentLabel}][${label}]overlay=x=0:y=0:enable='between(t,${overlay.startSeconds},${overlay.endSeconds})'[${afterLabel}]`,
    );
    currentLabel = afterLabel;
  }

  if (currentLabel !== outputLabel) {
    filters.push(`[${currentLabel}]null[${outputLabel}]`);
  }

  return filters.join(";");
}

function studioOverlayInputFilters(
  inputLabel: string,
  outputLabel: string,
  element: LayoutStudioElement,
) {
  const rotation = rotationRadians(element.rotation);
  const formatted = `${outputLabel}_formatted`;
  if (!rotation) {
    return [`${inputLabel}format=rgba[${outputLabel}]`];
  }

  return [
    `${inputLabel}format=rgba[${formatted}]`,
    `[${formatted}]rotate=${rotation}:c=none:ow=rotw(iw):oh=roth(ih)[${outputLabel}]`,
  ];
}

function rotationRadians(rotation: number | undefined) {
  if (typeof rotation !== "number" || !Number.isFinite(rotation)) return null;
  const normalized = ((rotation % 360) + 360) % 360;
  if (Math.abs(normalized) < 0.01) return null;
  return (normalized * Math.PI / 180).toFixed(8);
}

function studioOverlayX(element: LayoutStudioResolvedElement, fallbackX: number) {
  return rotationRadians(element.rotation)
    ? `${Math.round(element.x + element.width / 2)}-w/2`
    : String(Math.round(fallbackX));
}

function studioOverlayY(element: LayoutStudioResolvedElement, fallbackY: number) {
  return rotationRadians(element.rotation)
    ? `${Math.round(element.y + element.height / 2)}-h/2`
    : String(Math.round(fallbackY));
}

function studioCenteredOverlayX(element: LayoutStudioResolvedElement) {
  return `${Math.round(element.x + element.width / 2)}-w/2`;
}

function studioCenteredOverlayY(element: LayoutStudioResolvedElement) {
  return `${Math.round(element.y + element.height / 2)}-h/2`;
}

function rotatedElementPadding(element: LayoutStudioResolvedElement) {
  const radians = rotationRadians(element.rotation);
  if (!radians) return 0;

  const numericRadians = Number(radians);
  const sin = Math.abs(Math.sin(numericRadians));
  const cos = Math.abs(Math.cos(numericRadians));
  const rotatedWidth = element.width * cos + element.height * sin;
  const rotatedHeight = element.width * sin + element.height * cos;
  return Math.max(
    0,
    (rotatedWidth - element.width) / 2,
    (rotatedHeight - element.height) / 2,
  );
}

function studioElementKey(element: Pick<LayoutStudioElement, "id" | "type" | "x" | "y">) {
  return element.id ?? `${element.type ?? "element"}:${element.x ?? 0}:${element.y ?? 0}`;
}

function isLayoutStudioTemplate(template: CanvasLayoutTemplate | null | undefined) {
  return (
    template?.kind === "layoutStudio" &&
    Array.isArray(template.elements) &&
    template.canvas?.width === canvasWidth &&
    template.canvas?.height === canvasHeight
  );
}

function layoutStudioTemplate(options: RenderOptions): CanvasLayoutTemplate | null {
  const template = options.layoutTemplateJson;
  return template && isLayoutStudioTemplate(template) ? template : null;
}

function layoutStudioElements(template: CanvasLayoutTemplate) {
  const sceneElements = template.scenes?.[0]?.elements;
  if (Array.isArray(sceneElements) && sceneElements.length > 0) {
    return sceneElements;
  }

  return Array.isArray(template.elements) ? template.elements : [];
}

function layoutStudioHasElement(
  template: CanvasLayoutTemplate | null,
  type: string,
) {
  return template ? layoutStudioElements(template).some((element) => element.type === type) : false;
}

function resolveLayoutStudioElements(
  template: CanvasLayoutTemplate,
  screenshotDimensions: MediaDimensions,
): LayoutStudioResolvedElement[] {
  const rawElements = layoutStudioElements(template);
  const elements = rawElements
    .map(resolveLayoutStudioElementBox)
    .filter((element): element is LayoutStudioResolvedElement => Boolean(element));
  const screenshot = elements.find((element) => element.type === "screenshot");
  const hook = elements.find(
    (element) => element.type === "hook" && element.rule === "stackAboveScreenshot",
  );
  const fallbackSafeArea = safeAreaForStudioTemplate(template);
  const safeArea = {
    x: template.safeArea?.x ?? fallbackSafeArea.x,
    y: template.safeArea?.y ?? fallbackSafeArea.y,
    width: template.safeArea?.width ?? fallbackSafeArea.width,
    height: template.safeArea?.height ?? fallbackSafeArea.height,
  };

  if (!screenshot || !hook) {
    return elements;
  }

  const effectiveScreenshotHeight = effectiveContainedHeight(screenshot, screenshotDimensions);
  const gap = hook.gap ?? 24;
  const minScreenshotTop = safeArea.y + hook.height + gap;
  const maxPlacedScreenshotHeight = Math.max(
    80,
    safeArea.y + safeArea.height - minScreenshotTop,
  );
  const placedScreenshotHeight = Math.min(
    effectiveScreenshotHeight,
    screenshot.height,
    maxPlacedScreenshotHeight,
  );
  const screenshotCenter = screenshot.y + screenshot.height / 2;
  const screenshotTop =
    screenshot.stackAnchor === "top"
      ? screenshot.y
      : screenshot.stackAnchor === "middle"
        ? screenshotCenter - placedScreenshotHeight / 2
        : screenshot.y + screenshot.height - placedScreenshotHeight;
  const placedScreenshotTop = Math.round(
    Math.max(
      minScreenshotTop,
      Math.min(safeArea.y + safeArea.height - placedScreenshotHeight, screenshotTop),
    ),
  );

  hook.y = Math.round(placedScreenshotTop - hook.height - gap);
  screenshot.y = placedScreenshotTop;
  screenshot.height = Math.round(placedScreenshotHeight);
  screenshot.verticalAlign = "top";

  return elements;
}

function resolveLayoutStudioElementBox(
  element: LayoutStudioElement,
): LayoutStudioResolvedElement | null {
  if (
    typeof element.x !== "number" ||
    typeof element.y !== "number" ||
    typeof element.width !== "number" ||
    typeof element.height !== "number"
  ) {
    return null;
  }

  return {
    ...element,
    x: clampNumber(element.x, -canvasWidth, canvasWidth * 2, 0),
    y: clampNumber(element.y, -canvasHeight, canvasHeight * 2, 0),
    width: clampNumber(element.width, 1, canvasWidth * 2, 1),
    height: clampNumber(element.height, 1, canvasHeight * 2, 1),
  };
}

function safeAreaForStudioTemplate(template: CanvasLayoutTemplate) {
  if (template.overlay?.platform === "instagram") {
    return { x: 120, y: 270, width: 840, height: 1400 };
  }

  return { x: 120, y: 200, width: 840, height: 1400 };
}

function effectiveContainedHeight(
  element: { width: number; height: number },
  dimensions: MediaDimensions,
) {
  const aspect = dimensions.width > 0 && dimensions.height > 0
    ? dimensions.width / dimensions.height
    : null;

  if (!aspect) return element.height;

  return Math.min(element.height, element.width / aspect);
}

function fitMediaIntoStudioElement(
  element: LayoutStudioResolvedElement,
  dimensions: MediaDimensions,
  index: number,
) {
  const padding = clampNumber(element.padding, 0, Math.min(element.width, element.height) / 2, 0);
  const box = {
    x: element.x + padding,
    y: element.y + padding,
    width: Math.max(1, element.width - padding * 2),
    height: Math.max(1, element.height - padding * 2),
  };
  const fit = element.fit === "cover" ? "cover" : "contain";
  const scale = fit === "cover"
    ? Math.max(box.width / dimensions.width, box.height / dimensions.height)
    : Math.min(box.width / dimensions.width, box.height / dimensions.height);
  const width = Math.max(1, Math.round(dimensions.width * scale));
  const height = Math.max(1, Math.round(dimensions.height * scale));
  const horizontalOffset =
    element.horizontalAlign === "left"
      ? 0
      : element.horizontalAlign === "right"
        ? box.width - width
        : (box.width - width) / 2;
  const verticalOffset =
    element.verticalAlign === "top"
      ? 0
      : element.verticalAlign === "bottom"
        ? box.height - height
        : (box.height - height) / 2;
  const x = Math.round(box.x + Math.max(0, horizontalOffset));
  const y = Math.round(box.y + Math.max(0, verticalOffset));

  return {
    x,
    y,
    filters(inputLabel: string, output: string) {
      const scaledOutput = `${output}_scaled`;
      const finish = (filter: string) => {
        const rotation = rotationRadians(element.rotation);
        if (!rotation) return [`${filter}[${output}]`];
        return [
          `${filter}[${scaledOutput}]`,
          `[${scaledOutput}]rotate=${rotation}:c=none:ow=rotw(iw):oh=roth(ih)[${output}]`,
        ];
      };

      if (fit === "cover") {
        const cropX =
          element.horizontalAlign === "left"
            ? "0"
            : element.horizontalAlign === "right"
              ? "iw-ow"
              : "(iw-ow)/2";
        const cropY =
          element.verticalAlign === "top"
            ? "0"
            : element.verticalAlign === "bottom"
              ? "ih-oh"
              : "(ih-oh)/2";

        return finish(
          `${inputLabel}scale=${Math.round(box.width)}:${Math.round(box.height)}:force_original_aspect_ratio=increase,crop=${Math.round(box.width)}:${Math.round(box.height)}:${cropX}:${cropY},setsar=1,format=rgba`,
        );
      }

      return finish(
        `${inputLabel}scale=${width}:${height}:force_original_aspect_ratio=decrease,setsar=1,format=rgba`,
      );
    },
  };
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

  return balanceWrappedLines(lines, maxLineLength).join("\n");
}

function balanceWrappedLines(lines: string[], maxLineLength: number) {
  const balanced = [...lines];

  for (let index = balanced.length - 1; index > 0; index -= 1) {
    const currentWords = balanced[index]?.split(" ").filter(Boolean) ?? [];
    const previousWords = balanced[index - 1]?.split(" ").filter(Boolean) ?? [];

    if (currentWords.length > 1 || previousWords.length <= 1) {
      continue;
    }

    const combined = [...previousWords.slice(-1), ...currentWords].join(" ");
    if (combined.length <= maxLineLength) {
      balanced[index - 1] = previousWords.slice(0, -1).join(" ");
      balanced[index] = combined;
    }
  }

  return balanced.filter(Boolean);
}

async function createTextOverlayImage({
  campaignId,
  jobId,
  suffix,
  text,
  width,
  height,
  fontSize,
  fontCandidates = copyFontCandidates(),
  fontWeight = 400,
  shadowPreset,
  style,
}: {
  campaignId: string;
  jobId: string;
  suffix: string;
  text: string;
  width: number;
  height: number;
  fontSize: number;
  fontCandidates?: string[];
  fontWeight?: number;
  shadowPreset?: "default" | "reduced" | "subtle" | "copy";
  style?: Record<string, unknown>;
}) {
  const tempDirectory = path.join(paths.rendersDirectory, campaignId, ".tmp");
  const overlayFilepath = path.join(tempDirectory, `${jobId}-${suffix}.png`);
  const overlayConfigFilepath = path.join(tempDirectory, `${jobId}-${suffix}.json`);

  await fs.mkdir(tempDirectory, { recursive: true });
  await fs.writeFile(
    overlayConfigFilepath,
    JSON.stringify({
      fontCandidates,
      fontSize: String(fontSize),
      fontWeight,
      height,
      outputFilepath: overlayFilepath,
      shadowPreset,
      text,
      width,
      ...(style ?? {}),
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

async function createLayoutStudioTextOverlays({
  campaignId,
  jobId,
  renderOptions,
  screenshotDimensions,
  hookText,
}: {
  campaignId: string;
  jobId: string;
  renderOptions: RenderOptions;
  screenshotDimensions: MediaDimensions;
  hookText: string;
}) {
  const studioTemplate = layoutStudioTemplate(renderOptions);
  if (!studioTemplate) return [];

  const postCopy = renderOptions.postCopy ?? null;
  const keywords = (
    postCopy?.keywordOrder?.length ? postCopy.keywordOrder : postCopy?.keywords
  )?.filter((keyword): keyword is string => Boolean(keyword?.trim()));
  const textByType: Record<string, string> = {
    hook: hookText,
    title: normaliseRenderedMetadataLine(
      postCopy?.renderedBookTitleLine?.trim() ?? "",
    ),
    keywords: keywords?.join(" • ") ?? "",
    tropes: postCopy?.tropes?.filter(Boolean).join(" • ") ?? "",
    cta: postCopy?.ctaText?.trim() ?? "",
  };
  const elements = resolveLayoutStudioElements(studioTemplate, screenshotDimensions);
  const textElements = elements.filter(isLayoutStudioTextElement);

  return Promise.all(
    textElements.map(async (element, index) => {
      const text = (textByType[element.type ?? ""] ?? "").trim();
      if (!text) return null;

      const overlay = await createLayoutStudioTextOverlay({
        campaignId,
        element,
        index,
        jobId,
        text,
      });

      return {
        element,
        ...overlay,
      };
    }),
  ).then((overlays) =>
    overlays.filter((overlay): overlay is HookOverlayResult & { element: LayoutStudioResolvedElement } =>
      Boolean(overlay),
    ),
  );
}

async function createLayoutStudioTextOverlay({
  campaignId,
  element,
  index,
  jobId,
  text,
}: {
  campaignId: string;
  element: LayoutStudioResolvedElement;
  index: number;
  jobId: string;
  text: string;
}) {
  const padding = clampNumber(
    (element.padding ?? 0) * layoutStudioTypographyScale,
    0,
    Math.min(element.width, element.height) / 2,
    0,
  );
  const textWrapPaddingX = element.textWrap
    ? (element.textWrapPaddingX ?? 12) * layoutStudioTypographyScale
    : 0;
  const textWrapPaddingY = element.textWrap
    ? (element.textWrapPaddingY ?? 6) * layoutStudioTypographyScale
    : 0;
  const desiredFontSize = clampNumber(
    (element.fontSize ?? 42) * layoutStudioTypographyScale,
    8,
    180,
    42 * layoutStudioTypographyScale,
  );
  const desiredLineHeight = clampNumber(element.lineHeight, 0.8, 2.5, 1.15);
  const outlineWidth = (element.outlineWidth ?? 0) * layoutStudioTypographyScale;
  const lineHeight = element.textWrap
    ? Math.max(
        desiredLineHeight,
        minimumWrappedLineHeight(desiredFontSize, textWrapPaddingY),
      )
    : desiredLineHeight;
  const maxWidth = Math.max(40, element.width - padding * 2 - textWrapPaddingX * 2);
  const maxHeight = Math.max(24, element.height - padding * 2 - textWrapPaddingY * 2);
  const initialWrapped = wrapText(
    text,
    charsPerLine(maxWidth, desiredFontSize),
  );
  const fit = fitStudioTextForBox({
    lineHeight,
    maxHeight,
    maxWidth,
    minFontSize: 8,
    outlineWidth,
    text,
    wrappedText: initialWrapped,
    desiredFontSize,
  });
  const renderedLineHeight = element.textWrap
    ? Math.max(
        desiredLineHeight,
        minimumWrappedLineHeight(fit.fontSize, textWrapPaddingY),
      )
    : desiredLineHeight;
  const shadowPadding = element.shadow
    ? ((element.shadowBlur ?? 24) + Math.abs(element.shadowDistance ?? 8)) * layoutStudioTypographyScale
    : 0;
  const rotationPadding = rotatedElementPadding(element);
  const overlayPadding = Math.ceil(Math.max(outlineWidth + 8, shadowPadding, rotationPadding));

  return createTextOverlayImage({
    campaignId,
    fontCandidates: fontCandidatesForStudioElement(element),
    fontSize: fit.fontSize,
    fontWeight: element.fontWeight ?? 700,
    height: Math.round(element.height + overlayPadding * 2),
    jobId,
    shadowPreset: element.shadow ? "copy" : undefined,
    suffix: `studio-${element.type ?? "text"}-${index}`,
    text: fit.text,
    width: Math.round(element.width + overlayPadding * 2),
    style: {
      backgroundColor: alphaBackground(element.backgroundColor, element.backgroundOpacity),
      border: element.containerOutline
        ? `${Math.max(0, (element.borderWidth ?? 0) * layoutStudioTypographyScale)}px solid ${element.borderColor ?? "transparent"}`
        : undefined,
      borderRadius: (element.borderRadius ?? 0) * layoutStudioTypographyScale,
      containerShadow: shadowCss(
        element.shadow && !element.textWrap,
        element.shadowColor,
        (element.shadowBlur ?? 24) * layoutStudioTypographyScale,
        (element.shadowDistance ?? 8) * layoutStudioTypographyScale,
      ),
      horizontalAlign: element.horizontalAlign ?? "center",
      italic: Boolean(element.italic),
      lineHeight: renderedLineHeight,
      outlineColor: element.outlineColor ?? "transparent",
      padding: `${padding}px`,
      strokeWidth: outlineWidth,
      textAlign: element.horizontalAlign ?? "center",
      textColor: element.textColor ?? "#ffffff",
      textWrap: Boolean(element.textWrap),
      textWrapBackground: alphaBackground(
        element.textWrapColor ?? "#111111",
        element.textWrapOpacity ?? 85,
      ),
      textWrapPaddingX,
      textWrapPaddingY,
      textWrapRadius: (element.textWrapRadius ?? 18) * layoutStudioTypographyScale,
      verticalAlign: element.verticalAlign ?? "middle",
      contentWidth: Math.round(element.width),
      contentHeight: Math.round(element.height),
      wrapShadow: shadowCss(
        element.shadow && Boolean(element.textWrap),
        element.shadowColor,
        (element.shadowBlur ?? 24) * layoutStudioTypographyScale,
        (element.shadowDistance ?? 8) * layoutStudioTypographyScale,
      ),
    },
  });
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
  if (layoutStudioTemplate(renderOptions)) {
    return {
      metadataOverlay: null,
      keywordsOverlay: null,
    };
  }

  const postCopy = renderOptions.postCopy ?? null;
  const metadataLine = normaliseRenderedMetadataLine(
    postCopy?.renderedBookTitleLine?.trim() ?? "",
  );
  const keywords = (
    postCopy?.keywordOrder?.length ? postCopy.keywordOrder : postCopy?.keywords
  )?.filter((keyword): keyword is string => Boolean(keyword?.trim()));
  const layoutTemplate = renderOptions.layoutTemplate ?? "booktok_text_screenshot";
  const isCoverLayout =
    layoutTemplate === "left_cover_center_screenshot" ||
    layoutTemplate === "left_cover_offset_screenshot";
  const customTemplate = customCanvasTemplate(renderOptions);
  const customMetadataBox = customElementBox(customTemplate, "metadataLine");
  const customKeywordsBox = customElementBox(customTemplate, "keywords");
  const metadataFit =
    metadataLine && customMetadataBox
      ? fitTextForBox(metadataLine, customMetadataBox, isCoverLayout ? 28 : 34)
      : null;
  const keywordFit =
    keywords?.length && customKeywordsBox
      ? fitTextForBox(keywords.join(" • "), customKeywordsBox, isCoverLayout ? 24 : 30, 16)
      : null;

  const metadataOverlay = metadataLine && (!customTemplate || customMetadataBox)
    ? await createTextOverlayImage({
        campaignId,
        jobId,
        suffix: "metadata",
        text: metadataFit?.text ?? wrapText(metadataLine, 44),
        width: customMetadataBox?.width ?? 820,
        height: customMetadataBox?.height ?? (metadataLine.length > 44 ? (isCoverLayout ? 82 : 96) : (isCoverLayout ? 46 : 54)),
        fontSize: metadataFit?.fontSize ?? (isCoverLayout ? 28 : 34),
        fontCandidates: copyFontCandidates(),
        fontWeight: 600,
        shadowPreset: "copy",
      })
    : null;
  const keywordText = keywords?.length ? wrapText(keywords.join(" • "), 54) : "";
  const keywordsOverlay = keywordText && (!customTemplate || customKeywordsBox)
    ? await createTextOverlayImage({
        campaignId,
        jobId,
        suffix: "keywords",
        text: keywordFit?.text ?? keywordText,
        width: customKeywordsBox?.width ?? 860,
        height: customKeywordsBox?.height ?? (keywordText.includes("\n") ? (isCoverLayout ? 90 : 110) : (isCoverLayout ? 48 : 58)),
        fontSize: keywordFit?.fontSize ?? (isCoverLayout ? 24 : 30),
        fontCandidates: copyFontCandidates(),
        fontWeight: 600,
        shadowPreset: "copy",
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

function customCanvasTemplate(options: RenderOptions): CanvasLayoutTemplate | null {
  const template = options.layoutTemplateJson;

  if (!template || typeof template !== "object") return null;
  if (isLayoutStudioTemplate(template)) return null;
  if (template.canvas?.width !== canvasWidth || template.canvas?.height !== canvasHeight) {
    return null;
  }

  return template;
}

function layoutNumberForId(layoutId: string | null | undefined) {
  const match = layoutId?.toLowerCase().match(/layout[-_\s]*(\d+)/);
  return match ? Number.parseInt(match[1] ?? "0", 10) : null;
}

function renderOptionsForScreenshotOrientation(
  options: RenderOptions,
  screenshotDimensions: MediaDimensions,
): RenderOptions {
  const layoutNumber = layoutNumberForId(options.layoutTemplateId);

  if (layoutNumber !== 2 && layoutNumber !== 3 && layoutNumber !== 4) {
    return options;
  }

  const orientation =
    screenshotDimensions.height > screenshotDimensions.width ? "portrait" : "landscape";
  const alternate =
    orientation === "portrait"
      ? options.layoutTemplateAlternates?.portrait
      : options.layoutTemplateAlternates?.landscape;

  if (!alternate?.templateJson) {
    console.warn(
      `No ${orientation} alternate found for ${options.layoutTemplateId}; using selected layout. Screenshot dimensions: ${screenshotDimensions.width}x${screenshotDimensions.height}.`,
    );
    return options;
  }

  console.log(
    `Using ${orientation} layout alternate for ${options.layoutTemplateId}: ${alternate.layoutId}. Screenshot dimensions: ${screenshotDimensions.width}x${screenshotDimensions.height}.`,
  );

  return {
    ...options,
    layoutTemplate: alternate.renderTemplateId ?? options.layoutTemplate,
    layoutTemplateId: alternate.layoutId ?? options.layoutTemplateId,
    layoutTemplateJson: alternate.templateJson,
  };
}

function customElementBox(
  template: CanvasLayoutTemplate | null,
  key: "hook" | "cover" | "screenshot" | "metadataLine" | "keywords",
) {
  if (Array.isArray(template?.elements)) return null;
  const box = template?.elements?.[key];

  if (!box?.enabled) return null;
  if (
    typeof box.x !== "number" ||
    typeof box.y !== "number" ||
    typeof box.width !== "number" ||
    typeof box.height !== "number"
  ) {
    return null;
  }

  return {
    x: clampNumber(box.x, 0, canvasWidth, 0),
    y: clampNumber(box.y, 0, canvasHeight, 0),
    width: clampNumber(box.width, 1, canvasWidth, 1),
    height: clampNumber(box.height, 1, canvasHeight, 1),
    fit: box.fit,
  };
}

function fitMediaIntoBox(
  box: { x: number; y: number; width: number; height: number },
  dimensions: { width: number; height: number },
  options: { verticalAlign?: "center" | "bottom" } = {},
) {
  const scale = Math.min(box.width / dimensions.width, box.height / dimensions.height);
  const width = Math.max(1, Math.round(dimensions.width * scale));
  const height = Math.max(1, Math.round(dimensions.height * scale));
  const verticalOffset =
    options.verticalAlign === "bottom" ? box.height - height : (box.height - height) / 2;

  return {
    width,
    height,
    x: Math.round(box.x + (box.width - width) / 2),
    y: Math.round(box.y + verticalOffset),
  };
}

function charsPerLine(width: number, fontSize: number) {
  // TikTok Sans plus stroke renders wider than a naive average character
  // estimate. Keep this conservative so Satori never clips the final glyph.
  return Math.max(8, Math.floor(width / (fontSize * 0.6)));
}

function fitTextForBox(
  text: string,
  box: { width: number; height: number },
  maxFontSize: number,
  minFontSize = 18,
) {
  const normalized = text.replace(/\s+/g, " ").trim();

  for (let fontSize = maxFontSize; fontSize >= minFontSize; fontSize -= 2) {
    const wrapped = wrapText(normalized, charsPerLine(box.width - 24, fontSize));
    const lineCount = Math.max(1, wrapped.split("\n").length);
    const estimatedHeight = lineCount * fontSize * 1.08;

    if (estimatedHeight <= box.height - 8) {
      return { fontSize, text: wrapped };
    }
  }

  return {
    fontSize: minFontSize,
    text: wrapText(normalized, charsPerLine(box.width - 24, minFontSize)),
  };
}

function fitStudioTextForBox({
  desiredFontSize,
  lineHeight,
  maxHeight,
  maxWidth,
  minFontSize,
  outlineWidth,
  text,
  wrappedText,
}: {
  desiredFontSize: number;
  lineHeight: number;
  maxHeight: number;
  maxWidth: number;
  minFontSize: number;
  outlineWidth: number;
  text: string;
  wrappedText: string;
}) {
  const normalized = text.replace(/\s+/g, " ").trim();

  for (let fontSize = desiredFontSize; fontSize >= minFontSize; fontSize -= 1) {
    const wrapped = wrapText(normalized, charsPerLine(maxWidth, fontSize));
    const lineCount = Math.max(1, wrapped.split("\n").length);
    const estimatedHeight = lineCount * fontSize * lineHeight + outlineWidth * 2;

    if (estimatedHeight <= maxHeight) {
      return { fontSize, text: wrapped };
    }
  }

  return {
    fontSize: minFontSize,
    text: wrappedText,
  };
}

function minimumWrappedLineHeight(fontSize: number, paddingY: number) {
  return 1.05 + (paddingY * 1.5 + 2) / Math.max(fontSize, 1);
}

function isLayoutStudioTextElement(element: LayoutStudioElement): element is LayoutStudioResolvedElement {
  return ["hook", "title", "keywords", "tropes", "cta"].includes(element.type ?? "");
}

function fontCandidatesForStudioElement(element: LayoutStudioElement) {
  if (element.type === "hook") return hookFontCandidates();
  return copyFontCandidates();
}

function studioVideoTimelineDurations(
  template: CanvasLayoutTemplate | null,
  requestedMainDuration: number,
  options: RenderOptions,
) {
  const timeline = template?.timeline;
  const mainDuration = clampNumber(requestedMainDuration, 0.1, 30, requestedMainDuration);
  const introDurationOverride = options.layoutStudioAssets?.introDurationSeconds ?? null;
  const outroDurationOverride = options.layoutStudioAssets?.outroDurationSeconds ?? null;
  const introDuration = timeline?.introEnabled
    ? clampNumber(introDurationOverride ?? timeline.introDurationSeconds, 0.1, 30, 2)
    : 0;
  const outroDuration = timeline?.outroEnabled
    ? clampNumber(outroDurationOverride ?? timeline.outroDurationSeconds, 0.1, 30, 2)
    : 0;

  return {
    introDuration,
    mainDuration,
    outroDuration,
    totalDuration: introDuration + mainDuration + outroDuration,
  };
}

function alphaBackground(color?: string, opacity = 0) {
  if (!color || opacity <= 0) return "transparent";
  const clean = color.replace("#", "");
  const value = Number.parseInt(clean, 16);

  if (!Number.isFinite(value)) return "transparent";

  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(opacity, 100)) / 100})`;
}

function shadowCss(
  enabled: boolean | undefined,
  color: string | undefined,
  blur: number | undefined,
  distance: number | undefined,
) {
  if (!enabled) return undefined;
  return `0 ${distance ?? 8}px ${Math.max(0, blur ?? 24)}px ${color ?? "#000000"}`;
}

function hookFontCandidates() {
  return [
    path.join(paths.projectRoot, "public", "fonts", "TikTokSans-Semibold.ttf"),
    path.join(paths.projectRoot, "public", "fonts", "TikTokSans-Medium.ttf"),
    path.join(paths.projectRoot, "public", "fonts", "TikTokSans-Bold.ttf"),
    path.join(paths.projectRoot, "public", "fonts", "ProximaNova-Semibold.ttf"),
    path.join(paths.projectRoot, "public", "fonts", "ProximaNova-SemiBold.ttf"),
    path.join(paths.projectRoot, "public", "fonts", "TikTokSans-SemiBold.ttf"),
    path.join(paths.projectRoot, "public", "fonts", "Aveny-T.ttf"),
    path.join(paths.projectRoot, "public", "fonts", "AvenyT.ttf"),
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/Library/Fonts/Arial Unicode.ttf",
  ];
}

function copyFontCandidates() {
  return [
    path.join(paths.projectRoot, "public", "fonts", "TikTokSans-Semibold.ttf"),
    path.join(paths.projectRoot, "public", "fonts", "TikTokSans-Medium.ttf"),
    path.join(paths.projectRoot, "public", "fonts", "TikTokSans-Regular.ttf"),
    path.join(paths.projectRoot, "public", "fonts", "TikTokSans-Bold.ttf"),
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/Library/Fonts/Arial Unicode.ttf",
  ];
}

async function createHookOverlayImage(
  campaignId: string,
  jobId: string,
  hookText: string,
  suffix = "hook",
  layoutTemplate = "booktok_text_screenshot",
  customBox?: { width: number; height: number } | null,
): Promise<HookOverlayResult> {
  const tempDirectory = path.join(paths.rendersDirectory, campaignId, ".tmp");
  const overlayFilepath = path.join(tempDirectory, `${jobId}-${suffix}.png`);
  const overlayConfigFilepath = path.join(tempDirectory, `${jobId}-${suffix}.json`);

  await fs.mkdir(tempDirectory, { recursive: true });

  const normalizedHook = hookText.replace(/\s+/g, " ").trim();
  const isCoverLayout =
    layoutTemplate === "left_cover_center_screenshot" ||
    layoutTemplate === "left_cover_offset_screenshot";

  const defaultFontSize =
    normalizedHook.length > 160
      ? isCoverLayout
        ? 36
        : 42
      : normalizedHook.length > 120
        ? isCoverLayout
          ? 40
          : 46
        : normalizedHook.length > 90
          ? isCoverLayout
            ? 44
            : 50
          : isCoverLayout
            ? 50
            : 58;
  const defaultOverlayHeight =
    normalizedHook.length > 160
      ? 440
      : normalizedHook.length > 120
        ? 380
        : normalizedHook.length > 90
          ? 330
          : 260;
  const overlayWidth = customBox?.width ?? 820;
  const overlayHeight = customBox?.height ?? defaultOverlayHeight;
  const fitBox = customBox ?? { width: overlayWidth, height: overlayHeight };
  const fit = fitTextForBox(normalizedHook, fitBox, defaultFontSize, 18);

  await fs.writeFile(
    overlayConfigFilepath,
    JSON.stringify({
      fontCandidates: hookFontCandidates(),
      fontSize: String(fit.fontSize),
      fontWeight: 600,
      height: overlayHeight,
      outputFilepath: overlayFilepath,
      shadowPreset: "subtle",
      text: fit.text,
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

  const sourceRenderOptions = parseRenderOptions(job.render_options_json);
  const preparedScreenshot = await prepareScreenshotForRender({
    campaignId: job.campaign_id,
    jobId: job.id,
    screenshotFilepath: job.screenshot_filepath,
  });
  const screenshotDimensions = await getMediaDimensions(preparedScreenshot.filepath);
  const renderOptions = renderOptionsForScreenshotOrientation(
    sourceRenderOptions,
    screenshotDimensions,
  );
  const layoutTemplate = renderOptions.layoutTemplate ?? "booktok_text_screenshot";
  const studioTemplate = layoutStudioTemplate(renderOptions);
  const customTemplate = customCanvasTemplate(renderOptions);
  const customHookBox = customElementBox(customTemplate, "hook");
  const customCoverBox = customElementBox(customTemplate, "cover");
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
  const backgroundDuration = await getMediaDurationSeconds(job.background_filepath).catch(
    () => null,
  );
  const backgroundIsStillImage = isStillImageFile(job.background_filepath);
  const playbackSpeed = clampNumber(renderOptions.playbackSpeed, 0.95, 1.05, 1);
  const audioStartOffset = Math.max(0, job.audio_start_offset_seconds ?? 0);
  const availableAudioDuration =
    audioDuration === null ? null : Math.max(0.5, audioDuration - audioStartOffset);
  const requestedMainRenderDuration = isFullBackgroundMultiHook
    ? rawRequestedRenderDuration
    : clampNumber(
        rawRequestedRenderDuration,
        minRenderDurationSeconds,
        studioTemplate ? 30 : maxRenderDurationSeconds,
        getRandomRenderDurationSeconds(),
      );
  const studioTimelineDurations = studioVideoTimelineDurations(
    studioTemplate,
    requestedMainRenderDuration,
    renderOptions,
  );
  const requestedRenderDuration = studioTemplate
    ? studioTimelineDurations.totalDuration
    : requestedMainRenderDuration;
  const audioLimitedRenderDuration =
    availableAudioDuration === null
      ? requestedRenderDuration
      : Math.min(requestedRenderDuration, availableAudioDuration);
  let renderDuration = audioLimitedRenderDuration;
  let studioMainStartSeconds = studioTemplate ? studioTimelineDurations.introDuration : 0;
  let studioMainDuration = studioTemplate ? studioTimelineDurations.mainDuration : renderDuration;
  let studioOutroDuration = studioTemplate ? studioTimelineDurations.outroDuration : 0;
  let shouldLoopBackgroundVideo = false;

  if (backgroundDuration !== null) {
    const requestedBackgroundStart = Math.max(0, renderOptions.backgroundStartTime ?? 0);
    const requiredInputDuration = renderDuration * playbackSpeed;
    const latestBackgroundStart = backgroundIsStillImage
      ? requestedBackgroundStart
      : Math.max(0, backgroundDuration - requiredInputDuration);
    renderOptions.backgroundStartTime = Math.min(
      requestedBackgroundStart,
      latestBackgroundStart,
    );
    const availableInputDuration = Math.max(
      0,
      backgroundDuration - renderOptions.backgroundStartTime,
    );

    if (availableInputDuration + 0.05 < requiredInputDuration) {
      shouldLoopBackgroundVideo = !backgroundIsStillImage;
    }
    renderOptions.backgroundEndTime = renderOptions.backgroundStartTime + renderDuration;
  }

  if (studioTemplate) {
    const totalRequested = Math.max(0.1, studioTimelineDurations.totalDuration);
    const scale = renderDuration / totalRequested;
    studioMainStartSeconds = studioTimelineDurations.introDuration * scale;
    studioMainDuration = studioTimelineDurations.mainDuration * scale;
    studioOutroDuration = studioTimelineDurations.outroDuration * scale;
  }

  if (
    isFullBackgroundMultiHook &&
    availableAudioDuration !== null &&
    availableAudioDuration < renderDuration
  ) {
    throw new Error(
      `Audio segment is too short for timed multi-hook render. Required ${renderDuration.toFixed(2)}s, available ${availableAudioDuration.toFixed(2)}s after start offset.`,
    );
  }

  const hasThumbnailFile = await fileExists(job.thumbnail_filepath);
  const hasCoverOverlay =
    (isCoverLayout || Boolean(customCoverBox) || layoutStudioHasElement(studioTemplate, "cover")) &&
    hasThumbnailFile;
  const renderDurationSeconds = String(renderDuration);

  const outputFilename = `${job.id}.mp4`;
  const outputDirectory = path.join(paths.rendersDirectory, job.campaign_id);
  const outputFilepath = path.join(outputDirectory, outputFilename);

  await fs.mkdir(outputDirectory, { recursive: true });
  markRenderJobRunning(job.id);

  const hookOverlay = studioTemplate || isFullBackgroundMultiHook || (customTemplate && !customHookBox)
    ? null
    : await createHookOverlayImage(
        job.campaign_id,
        job.id,
        job.hook_text,
        "hook",
        layoutTemplate,
        customHookBox,
      );
  const timedHookOverlays = isFullBackgroundMultiHook
    ? await Promise.all(
        multiHookTexts.map((hookText, index) =>
          createHookOverlayImage(
            job.campaign_id,
            job.id,
            hookText,
            `hook-${index}`,
            layoutTemplate,
          ),
        ),
      )
    : [];
  const postCopyOverlays = await createPostCopyOverlays({
    campaignId: job.campaign_id,
    jobId: job.id,
    renderOptions,
  });
  const studioTextOverlays = await createLayoutStudioTextOverlays({
    campaignId: job.campaign_id,
    hookText: job.hook_text,
    jobId: job.id,
    renderOptions,
    screenshotDimensions,
  });
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

  const args = ["-y"];

  if (
    typeof renderOptions.backgroundStartTime === "number" &&
    renderOptions.backgroundStartTime > 0
  ) {
    args.push("-ss", String(renderOptions.backgroundStartTime));
  }

  if (backgroundIsStillImage) {
    args.push("-loop", "1");
  } else if (shouldLoopBackgroundVideo) {
    args.push("-stream_loop", "-1");
  }

  args.push("-i", job.background_filepath);
  args.push(
    "-loop",
    "1",
    "-i",
    preparedScreenshot.filepath,
  );

  let nextInputIndex = 2;

  const hookOverlayInputIndex = hookOverlay ? nextInputIndex : null;

  if (hookOverlay) {
    args.push("-loop", "1", "-i", hookOverlay.filepath);
    nextInputIndex += 1;
  }

  const timedHookOverlayInputs: HookOverlayInput[] = [];

  if (timedHookOverlays.length > 0) {
    timedHookOverlays.forEach((overlay, index) => {
      args.push("-loop", "1", "-i", overlay.filepath);
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
    args.push("-loop", "1", "-i", postCopyOverlays.metadataOverlay.filepath);
    nextInputIndex += 1;
  }

  const keywordsOverlayInputIndex = postCopyOverlays.keywordsOverlay
    ? nextInputIndex
    : null;

  if (postCopyOverlays.keywordsOverlay) {
    args.push("-loop", "1", "-i", postCopyOverlays.keywordsOverlay.filepath);
    nextInputIndex += 1;
  }

  const coverInputIndex = hasCoverOverlay ? nextInputIndex : null;

  if (hasCoverOverlay && job.thumbnail_filepath) {
    args.push(
      "-loop",
      "1",
      "-i",
      job.thumbnail_filepath,
    );
    nextInputIndex += 1;
  }

  const introFilepath =
    studioTemplate && await fileExists(renderOptions.layoutStudioAssets?.introFilepath ?? null)
      ? renderOptions.layoutStudioAssets?.introFilepath ?? null
      : null;
  const introInputIndex = introFilepath ? nextInputIndex : null;

  if (introFilepath) {
    args.push("-loop", "1", "-i", introFilepath);
    nextInputIndex += 1;
  }

  const outroFilepath =
    studioTemplate && await fileExists(renderOptions.layoutStudioAssets?.outroFilepath ?? null)
      ? renderOptions.layoutStudioAssets?.outroFilepath ?? null
      : null;
  const outroInputIndex = outroFilepath ? nextInputIndex : null;

  if (outroFilepath) {
    args.push("-loop", "1", "-i", outroFilepath);
    nextInputIndex += 1;
  }

  const studioTextOverlayInputs: StudioTextOverlayInput[] = [];

  if (studioTextOverlays.length > 0) {
    studioTextOverlays.forEach((overlay) => {
      args.push("-loop", "1", "-i", overlay.filepath);
      studioTextOverlayInputs.push({
        element: overlay.element,
        height: overlay.height,
        inputIndex: nextInputIndex,
        width: overlay.width,
      });
      nextInputIndex += 1;
    });
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
    hookOverlayInputIndex,
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
    studioTextOverlays: studioTextOverlayInputs,
    studioTimeline: studioTemplate
      ? {
          mainStartSeconds: studioMainStartSeconds,
          mainEndSeconds: studioMainStartSeconds + studioMainDuration,
          introOverlay:
            introInputIndex !== null && introFilepath && studioMainStartSeconds > 0
              ? {
                  inputIndex: introInputIndex,
                  height: canvasHeight,
                  width: canvasWidth,
                  startSeconds: 0,
                  endSeconds: studioMainStartSeconds,
                }
              : null,
          outroOverlay:
            outroInputIndex !== null && outroFilepath && studioOutroDuration > 0
              ? {
                  inputIndex: outroInputIndex,
                  height: canvasHeight,
                  width: canvasWidth,
                  startSeconds: studioMainStartSeconds + studioMainDuration,
                  endSeconds: renderDuration,
                }
              : null,
        }
      : undefined,
    outputLabel: "vout",
  });

  const filterComplex = mainFilterComplex;

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
      "-b:a",
      outputAudioBitrate,
      "-ar",
      outputAudioSampleRate,
      "-ac",
      "2",
      "-shortest",
    );
  }

  args.push(
    "-r",
    String(outputFps),
    "-fps_mode",
    "cfr",
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-profile:v",
    "high",
    "-level:v",
    "4.1",
    "-b:v",
    outputVideoBitrate,
    "-maxrate",
    outputVideoMaxrate,
    "-bufsize",
    outputVideoBufsize,
    "-pix_fmt",
    "yuv420p",
    "-colorspace",
    "bt709",
    "-color_primaries",
    "bt709",
    "-color_trc",
    "bt709",
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
      thumbnail: null,
      output: outputFilepath,
      renderDurationSeconds,
      thumbnailIntroDuration: null,
      hookOverlay,
      timedHookOverlays,
      studioTextOverlays,
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

    const [outputStat, outputDuration] = await Promise.all([
      fs.stat(outputFilepath),
      getMediaDurationSeconds(outputFilepath).catch(() => null),
    ]);

    if (outputStat.size < 1024 || outputDuration === null || outputDuration < 0.5) {
      throw new Error(
        `Rendered output is invalid. Size ${outputStat.size} bytes, duration ${
          outputDuration === null ? "unknown" : `${outputDuration.toFixed(2)}s`
        }.`,
      );
    }

    markRenderJobDone({
      jobId: job.id,
      outputFilename,
      outputFilepath,
    });

    return {
      effectiveLayoutTemplate: renderOptions.layoutTemplate,
      effectiveLayoutTemplateId: renderOptions.layoutTemplateId,
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
      [
        ...timedHookOverlays.map((overlay) => overlay.filepath),
        ...studioTextOverlays.map((overlay) => overlay.filepath),
      ].map((filepath) => fs.rm(filepath, { force: true })),
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
