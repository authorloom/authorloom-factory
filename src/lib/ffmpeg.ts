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
const layoutStudioTypographyScale = 1;
const outputFps = 30;
const outputVideoBitrate = "10M";
const outputVideoMaxrate = "12M";
const outputVideoBufsize = "20M";
const outputAudioBitrate = "192k";
const outputAudioSampleRate = "48000";
const outputColorSpace = "bt709";
const outputColorRange = "tv";
const ffmpegBinary = process.env.FFMPEG_PATH ?? process.env.AUTHORLOOM_FFMPEG_PATH ?? "ffmpeg";
const ffprobeBinary = process.env.FFPROBE_PATH ?? process.env.AUTHORLOOM_FFPROBE_PATH ?? "ffprobe";

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
  element?: LayoutStudioResolvedElement | null;
};

type SceneVisualOverlayInput = OverlayInput & {
  element?: LayoutStudioResolvedElement | null;
  filepath: string;
  width: number;
  startSeconds: number;
  endSeconds: number;
};

type MediaDimensions = {
  width: number;
  height: number;
};

type VideoColorMetadata = {
  pixelFormat?: string;
  colorRange?: string;
  colorSpace?: string;
  colorTransfer?: string;
  colorPrimaries?: string;
};

type Layout = {
  screenshotWidth: number;
  screenshotY: number;
  hookY: number;
  hookHeight: number;
  footerHeight: number;
};

type RenderOptions = {
  postType?: "video_post" | "scenes_video_post" | "tiktok_slides_post" | "instagram_carousel_post" | null;
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
  timelineVideoPost?: {
    resolvedClips?: Array<{
      clipId?: string | null;
      asset?: {
        assetId?: string | null;
        type?: string | null;
        filepath?: string | null;
        text?: string | null;
        filename?: string | null;
      } | null;
    }> | null;
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
  sceneVideoPost?: {
    scenes?: Array<{
      sceneId?: string | null;
      durationSeconds?: number | null;
      metadataTemplateId?: string | null;
      renderedMetadataLine?: string | null;
      assets?: {
        background?: {
          filepath?: string | null;
          type?: string | null;
        } | null;
        image?: {
          filepath?: string | null;
          type?: string | null;
        } | null;
        screenshot?: {
          filepath?: string | null;
          type?: string | null;
        } | null;
        hook?: {
          text?: string | null;
          label?: string | null;
        } | null;
        cta?: {
          text?: string | null;
          label?: string | null;
        } | null;
        keywords?: Array<{
          text?: string | null;
          label?: string | null;
        }> | null;
        tropes?: Array<{
          text?: string | null;
          label?: string | null;
        }> | null;
      } | null;
    }>;
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
    id?: string;
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
  compositionTimeline?: {
    durationSeconds?: number;
    clips?: Array<{
      id?: string;
      layerType?: string;
      elementId?: string;
      startSeconds?: number;
      durationSeconds?: number;
      transitionIn?: string;
      transitionOut?: string;
    }>;
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
  paddingX?: number;
  paddingY?: number;
  gap?: number;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  lineHeight?: number;
  textListStyle?: "inline" | "list";
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
  textShadow?: boolean;
  textShadowColor?: string;
  textShadowBlur?: number;
  textShadowDistance?: number;
  textWrap?: boolean;
  textWrapColor?: string;
  textWrapOpacity?: number;
  textWrapRadius?: number;
  textWrapPaddingX?: number;
  textWrapPaddingY?: number;
  outlineColor?: string;
  outlineWidth?: number;
  rule?: "none" | "stackAboveScreenshot";
  anchorEnabled?: boolean;
  anchorTargetId?: string;
  anchorSourcePoint?: LayoutStudioAnchorPoint;
  anchorTargetPoint?: LayoutStudioAnchorPoint;
};

type LayoutStudioAnchorPoint =
  | "top"
  | "bottom"
  | "left"
  | "right"
  | "topLeft"
  | "topRight"
  | "bottomLeft"
  | "bottomRight";

type LayoutStudioResolvedElement = LayoutStudioElement & {
  x: number;
  y: number;
  width: number;
  height: number;
};

type LayoutStudioMediaDimensionsByElementId = Map<string, MediaDimensions>;

type StudioTextOverlayInput = OverlayInput & {
  element: LayoutStudioResolvedElement;
  width: number;
  startSeconds?: number;
  endSeconds?: number;
};

type StudioTimelineOverlayInput = OverlayInput & {
  width: number;
  startSeconds: number;
  endSeconds: number;
};

type StudioMediaOverlayInput = OverlayInput & {
  element: LayoutStudioResolvedElement;
  width: number;
  startSeconds: number;
  endSeconds: number;
};

type StudioBackgroundOverlayInput = OverlayInput & {
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
    ffprobeBinary,
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
    ffprobeBinary,
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

async function getVideoColorMetadata(
  filepath: string,
): Promise<VideoColorMetadata | null> {
  const result = await runCommand(
    ffprobeBinary,
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=pix_fmt,color_range,color_space,color_transfer,color_primaries",
      "-of",
      "json",
      filepath,
    ],
    { all: true },
  );

  const parsed = JSON.parse(result.stdout || "{}") as {
    streams?: Array<{
      pix_fmt?: string;
      color_range?: string;
      color_space?: string;
      color_transfer?: string;
      color_primaries?: string;
    }>;
  };
  const stream = parsed.streams?.[0];

  if (!stream) {
    return null;
  }

  return {
    pixelFormat: stream.pix_fmt,
    colorRange: stream.color_range,
    colorSpace: stream.color_space,
    colorTransfer: stream.color_transfer,
    colorPrimaries: stream.color_primaries,
  };
}

function isHdrVideo(metadata: VideoColorMetadata | null | undefined) {
  const colorTransfer = metadata?.colorTransfer?.toLowerCase();
  const colorPrimaries = metadata?.colorPrimaries?.toLowerCase();
  const colorSpace = metadata?.colorSpace?.toLowerCase();
  const pixelFormat = metadata?.pixelFormat?.toLowerCase();

  return (
    colorTransfer === "arib-std-b67" ||
    colorTransfer === "smpte2084" ||
    colorPrimaries === "bt2020" ||
    colorSpace === "bt2020nc" ||
    colorSpace === "bt2020c" ||
    Boolean(pixelFormat?.includes("10") && (
      colorTransfer === "arib-std-b67" ||
      colorTransfer === "smpte2084" ||
      colorPrimaries?.includes("2020") ||
      colorSpace?.includes("2020")
    ))
  );
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

function pushMediaInput(
  args: string[],
  filepath: string,
  options: { loop?: boolean; loopStillImage?: boolean } = {},
) {
  if (options.loop && !isStillImageFile(filepath)) {
    args.push("-stream_loop", "-1");
  }
  if (options.loopStillImage && isStillImageFile(filepath)) {
    args.push("-f", "image2", "-loop", "1");
  }
  args.push("-i", filepath);
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
          { file: ffmpegBinary, args: ["-y", "-i", screenshotFilepath, outputFilepath] },
        ]
      : [
          { file: "heif-convert", args: [screenshotFilepath, outputFilepath] },
          { file: "magick", args: [screenshotFilepath, outputFilepath] },
          { file: "convert", args: [screenshotFilepath, outputFilepath] },
          { file: ffmpegBinary, args: ["-y", "-i", screenshotFilepath, outputFilepath] },
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
  backgroundColorMetadata,
  layout,
  options,
  screenshotDimensions,
  hookOverlayInputIndex,
  hookOverlays = [],
  sceneVisualOverlays = [],
  coverOverlay,
  studioBackgroundOverlays = [],
  studioMediaOverlays = [],
  metadataOverlay,
  keywordsOverlay,
  studioTextOverlays = [],
  mediaDimensionsByElementId,
  studioTimeline,
  outputLabel = "vout",
}: {
  backgroundColorMetadata?: VideoColorMetadata | null;
  layout: Layout;
  options?: RenderOptions;
  screenshotDimensions: MediaDimensions;
  hookOverlayInputIndex?: number | null;
  hookOverlays?: HookOverlayInput[];
  sceneVisualOverlays?: SceneVisualOverlayInput[];
  coverOverlay?: CoverOverlayInput | null;
  studioBackgroundOverlays?: StudioBackgroundOverlayInput[];
  studioMediaOverlays?: StudioMediaOverlayInput[];
  metadataOverlay?: OverlayInput | null;
  keywordsOverlay?: OverlayInput | null;
  studioTextOverlays?: StudioTextOverlayInput[];
  mediaDimensionsByElementId?: LayoutStudioMediaDimensionsByElementId;
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
  const isSceneVideoPost =
    effectiveOptions.postType === "scenes_video_post" ||
    Boolean(options?.sceneVideoPost) ||
    sceneVisualOverlays.length > 0;
  const isFullBackgroundLayout =
    layoutTemplate === "booktok_full_background_multi_hook" || isSceneVideoPost;
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
  const backgroundScaleFilter = isHdrVideo(backgroundColorMetadata)
    ? `zscale=t=linear:npl=100,format=gbrpf32le,tonemap=tonemap=hable:desat=0,` +
      `zscale=p=${outputColorSpace}:t=${outputColorSpace}:m=${outputColorSpace}:r=${outputColorRange},` +
      `format=yuv420p,` +
      `scale=${scaledCanvasWidth}:${scaledCanvasHeight}` +
      `:force_original_aspect_ratio=increase` +
      `:flags=lanczos` +
      `:in_range=${outputColorRange}` +
      `:out_range=${outputColorRange}` +
      `:out_color_matrix=${outputColorSpace}`
    : `scale=${scaledCanvasWidth}:${scaledCanvasHeight}` +
      `:force_original_aspect_ratio=increase` +
      `:flags=lanczos` +
      `:in_range=auto` +
      `:out_range=${outputColorRange}` +
      `:out_color_matrix=${outputColorSpace}`;

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
    `[0:v]setpts=${(1 / playbackSpeed).toFixed(5)}*PTS,${backgroundScaleFilter},crop=${canvasWidth}:${canvasHeight}:${cropX}:${cropY},setsar=1,format=yuv420p[bg_base]`,
  ];
  let backgroundLabel = "bg_base";

  studioBackgroundOverlays.forEach((overlay, index) => {
    const label = `studio_bg_${index}`;
    const afterLabel = `studio_bg_after_${index}`;
    baseFilters.push(
      `[${overlay.inputIndex}:v]setpts=${(1 / playbackSpeed).toFixed(5)}*PTS,${backgroundScaleFilter},crop=${canvasWidth}:${canvasHeight}:${cropX}:${cropY},setsar=1,format=yuv420p[${label}]`,
      `[${backgroundLabel}][${label}]overlay=x=0:y=0:enable='between(t,${overlay.startSeconds},${overlay.endSeconds})':eof_action=pass[${afterLabel}]`,
    );
    backgroundLabel = afterLabel;
  });

  baseFilters.push(`[${backgroundLabel}]null[bg]`);
  const customTemplate = customCanvasTemplate(effectiveOptions);
  const studioTemplate = isSceneVideoPost ? null : layoutStudioTemplate(effectiveOptions);

  if (studioTemplate) {
    return buildLayoutStudioFilterComplex({
      baseFilters,
      coverOverlay,
      outputLabel,
      screenshotDimensions,
      studioTemplate,
      studioTimeline,
      studioMediaOverlays,
      studioTextOverlays,
      mediaDimensionsByElementId,
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

    sceneVisualOverlays.forEach((overlay, index) => {
      const visualLabel = `scenevisual${index}`;
      const outputVisualLabel = `withscenevisual${index}`;
      const enable = `:enable='gte(t,${overlay.startSeconds})*lt(t,${overlay.endSeconds})'`;

      if (overlay.element) {
        const media = fitMediaIntoStudioElement(overlay.element, {
          width: overlay.width,
          height: overlay.height,
        });
        timedHookFilters.push(
          ...media.filters(`[${overlay.inputIndex}:v]setpts=PTS-STARTPTS,`, visualLabel),
          `[${timedHookInputLabel}][${visualLabel}]overlay=x=${studioOverlayX(overlay.element, media.x)}:y=${studioOverlayY(overlay.element, media.y)}${enable}:eof_action=pass[${outputVisualLabel}]`,
        );
      } else {
        timedHookFilters.push(
          `[${overlay.inputIndex}:v]setpts=PTS-STARTPTS,scale=${canvasWidth}:${canvasHeight}:force_original_aspect_ratio=increase:flags=lanczos,crop=${canvasWidth}:${canvasHeight}:(iw-ow)/2:(ih-oh)/2,setsar=1,format=rgba[${visualLabel}]`,
          `[${timedHookInputLabel}][${visualLabel}]overlay=x=0:y=0${enable}:eof_action=pass[${outputVisualLabel}]`,
        );
      }
      timedHookInputLabel = outputVisualLabel;
    });

    hookOverlays.forEach((overlay, index) => {
      const hookLabel = `hook${index}`;
      const outputHookLabel = `withhook${index}`;
      const enable =
        typeof overlay.startSeconds === "number" &&
        typeof overlay.endSeconds === "number"
          ? `:enable='between(t,${overlay.startSeconds},${overlay.endSeconds})'`
          : "";
      const hookX = overlay.element ? studioCenteredOverlayX(overlay.element) : "(W-w)/2";
      const hookYPosition = overlay.element
        ? studioCenteredOverlayY(overlay.element)
        : String(Math.round(nudgedHookY));

      timedHookFilters.push(
        ...studioOverlayInputFilters(
          `[${overlay.inputIndex}:v]setpts=PTS-STARTPTS,`,
          hookLabel,
          overlay.element ?? {},
        ),
        `[${timedHookInputLabel}][${hookLabel}]overlay=x=${hookX}:y=${hookYPosition}${enable}:eof_action=pass[${outputHookLabel}]`,
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
  studioMediaOverlays,
  studioTextOverlays,
  mediaDimensionsByElementId,
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
  studioMediaOverlays?: StudioMediaOverlayInput[];
  studioTextOverlays: StudioTextOverlayInput[];
  mediaDimensionsByElementId?: LayoutStudioMediaDimensionsByElementId;
}) {
  const elements = resolveLayoutStudioElements(
    studioTemplate,
    screenshotDimensions,
    mediaDimensionsByElementId,
  );
  const mediaOverlays = studioMediaOverlays ?? [];
  const textOverlaysByElementId = new Map<string, StudioTextOverlayInput[]>();
  for (const overlay of studioTextOverlays) {
    const key = studioElementKey(overlay.element);
    textOverlaysByElementId.set(key, [...(textOverlaysByElementId.get(key) ?? []), overlay]);
  }
  const mediaOverlaysByElementId = new Map<string, StudioMediaOverlayInput[]>();
  for (const overlay of mediaOverlays) {
    const key = studioElementKey(overlay.element);
    mediaOverlaysByElementId.set(key, [...(mediaOverlaysByElementId.get(key) ?? []), overlay]);
  }
  const filters = [...baseFilters];
  let currentLabel = "bg";
  let mediaIndex = 0;
  let textIndex = 0;
  const mainEnable = studioTimeline
    ? `:enable='between(t,${studioTimeline.mainStartSeconds},${studioTimeline.mainEndSeconds})'`
    : "";

  for (const element of elements) {
    const elementType = element.type;

    if (elementType === "screenshot" || elementType === "image" || elementType === "cover") {
      const timelineOverlays = mediaOverlaysByElementId.get(studioElementKey(element)) ?? [];
      if (timelineOverlays.length > 0) {
        for (const overlay of timelineOverlays) {
          const media = fitMediaIntoStudioElement(element, {
            width: overlay.width,
            height: overlay.height,
          });
          const enable = `:enable='between(t,${overlay.startSeconds},${overlay.endSeconds})'`;
          filters.push(
            ...media.filters(`[${overlay.inputIndex}:v]`, `studio_shot_${mediaIndex}`),
            `[${currentLabel}][studio_shot_${mediaIndex}]overlay=x=${studioOverlayX(element, media.x)}:y=${studioOverlayY(element, media.y)}${enable}:eof_action=pass[studio_after_${mediaIndex}]`,
          );
          currentLabel = `studio_after_${mediaIndex}`;
          mediaIndex += 1;
        }
        continue;
      }

      if (elementType === "cover" && coverOverlay) {
        const media = fitMediaIntoStudioElement(
          element,
          { width: coverOverlay.width, height: coverOverlay.height },
        );
        filters.push(
          ...media.filters(`[${coverOverlay.inputIndex}:v]`, `studio_cover_${mediaIndex}`),
          `[${currentLabel}][studio_cover_${mediaIndex}]overlay=x=${studioOverlayX(element, media.x)}:y=${studioOverlayY(element, media.y)}${mainEnable}:eof_action=pass[studio_after_${mediaIndex}]`,
        );
        currentLabel = `studio_after_${mediaIndex}`;
        mediaIndex += 1;
      }

      if (elementType !== "screenshot") continue;

      const media = fitMediaIntoStudioElement(element, screenshotDimensions);
      filters.push(
        ...media.filters("[1:v]", `studio_shot_${mediaIndex}`),
        `[${currentLabel}][studio_shot_${mediaIndex}]overlay=x=${studioOverlayX(element, media.x)}:y=${studioOverlayY(element, media.y)}${mainEnable}:eof_action=pass[studio_after_${mediaIndex}]`,
      );
      currentLabel = `studio_after_${mediaIndex}`;
      mediaIndex += 1;
      continue;
    }

    if (isLayoutStudioTextElement(element)) {
      const overlays = textOverlaysByElementId.get(studioElementKey(element)) ?? [];

      if (overlays.length === 0) continue;

      for (const overlay of overlays) {
        const enable =
          typeof overlay.startSeconds === "number" && typeof overlay.endSeconds === "number"
            ? `:enable='between(t,${overlay.startSeconds},${overlay.endSeconds})'`
            : mainEnable;
        filters.push(
          ...studioOverlayInputFilters(
            `[${overlay.inputIndex}:v]`,
            `studio_text_${textIndex}`,
            element,
          ),
          `[${currentLabel}][studio_text_${textIndex}]overlay=x=${studioCenteredOverlayX(element)}:y=${studioCenteredOverlayY(element)}${enable}:eof_action=pass[studio_text_after_${textIndex}]`,
        );
        currentLabel = `studio_text_after_${textIndex}`;
        textIndex += 1;
      }
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
    typeof template.canvas?.width === "number" &&
    Number.isFinite(template.canvas.width) &&
    template.canvas.width > 0 &&
    typeof template.canvas?.height === "number" &&
    Number.isFinite(template.canvas.height) &&
    template.canvas.height > 0
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

function layoutStudioTimelineClips(template: CanvasLayoutTemplate | null | undefined) {
  return Array.isArray(template?.compositionTimeline?.clips)
    ? template.compositionTimeline.clips
    : [];
}

function timelineClipEndSeconds(clip: { startSeconds?: number; durationSeconds?: number }) {
  const startSeconds = clampNumber(clip.startSeconds, 0, 3600, 0);
  const durationSeconds = clampNumber(clip.durationSeconds, 0.01, 3600, 0.01);
  return startSeconds + durationSeconds;
}

function resolvedTimelineClipById(options: RenderOptions) {
  const clips = options.timelineVideoPost?.resolvedClips ?? [];
  return new Map(
    clips
      .filter((clip) => clip?.clipId && clip.asset)
      .map((clip) => [clip.clipId as string, clip]),
  );
}

function isSlidePostRender(options: RenderOptions) {
  return (
    options.postType === "tiktok_slides_post" ||
    options.postType === "instagram_carousel_post"
  );
}

async function layoutStudioMediaDimensionsByElementId({
  coverFilepath,
  renderOptions,
  screenshotDimensions,
  studioTemplate,
}: {
  coverFilepath?: string | null;
  renderOptions: RenderOptions;
  screenshotDimensions: MediaDimensions;
  studioTemplate: CanvasLayoutTemplate | null;
}): Promise<LayoutStudioMediaDimensionsByElementId> {
  const dimensionsByElementId: LayoutStudioMediaDimensionsByElementId = new Map();
  if (!studioTemplate) return dimensionsByElementId;

  const elements = layoutStudioElements(studioTemplate)
    .map(resolveLayoutStudioElementBox)
    .filter((element): element is LayoutStudioResolvedElement => Boolean(element));
  const mediaElements = elements.filter((element) =>
    ["screenshot", "image", "cover"].includes(element.type ?? ""),
  );
  const mediaElementsByType = new Map<string, LayoutStudioResolvedElement[]>();
  for (const element of mediaElements) {
    const type = element.type ?? "";
    mediaElementsByType.set(type, [...(mediaElementsByType.get(type) ?? []), element]);
  }
  const assignElementDimensions = (
    element: LayoutStudioResolvedElement | null | undefined,
    dimensions: MediaDimensions | null | undefined,
  ) => {
    if (!element?.id || !dimensions) return;
    dimensionsByElementId.set(element.id, dimensions);
  };

  assignElementDimensions(
    mediaElements.find((element) => element.type === "screenshot"),
    screenshotDimensions,
  );

  if (coverFilepath && await fileExists(coverFilepath)) {
    const coverDimensions = await getMediaDimensions(coverFilepath).catch(() => null);
    assignElementDimensions(
      mediaElements.find((element) => element.type === "cover"),
      coverDimensions,
    );
  }

  const resolvedClips = resolvedTimelineClipById(renderOptions);
  const timelineClips = layoutStudioTimelineClips(studioTemplate);
  for (const clip of timelineClips) {
    const layerType = clip.layerType ?? "";
    if (!["screenshot", "image", "cover"].includes(layerType)) continue;

    const resolved = clip.id ? resolvedClips.get(clip.id) : null;
    const filepath = resolved?.asset?.filepath ?? null;
    if (!filepath || !(await fileExists(filepath))) continue;

    const element =
      (clip.elementId ? mediaElements.find((candidate) => candidate.id === clip.elementId) : null) ??
      (mediaElementsByType.get(layerType) ?? []).find((candidate) =>
        candidate.id ? !dimensionsByElementId.has(candidate.id) : false,
      ) ??
      (mediaElementsByType.get(layerType) ?? [])[0];
    const dimensions = await getMediaDimensions(filepath).catch(() => null);
    assignElementDimensions(element, dimensions);
  }

  return dimensionsByElementId;
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
  mediaDimensionsByElementId: LayoutStudioMediaDimensionsByElementId = new Map(),
): LayoutStudioResolvedElement[] {
  const rawElements = layoutStudioElements(template);
  const elements = rawElements
    .map(resolveLayoutStudioElementBox)
    .filter((element): element is LayoutStudioResolvedElement => Boolean(element));
  const screenshot = elements.find((element) => element.type === "screenshot");
  const hook = elements.find(
    (element) => element.type === "hook" && element.rule === "stackAboveScreenshot",
  );

  if (screenshot && hook) {
    const gap = hook.gap ?? 24;
    const screenshotBounds = fittedLayoutStudioMediaBounds(
      screenshot,
      layoutStudioMediaDimensionsForElement(
        screenshot,
        screenshotDimensions,
        mediaDimensionsByElementId,
      ),
    );
    hook.y = Math.round(screenshotBounds.y - hook.height - gap);
    hook.verticalAlign = "bottom";
  }

  for (const element of elements) {
    if (
      !element.anchorEnabled ||
      !["hook", "title", "keywords", "tropes", "cta"].includes(element.type ?? "") ||
      !element.anchorTargetId
    ) {
      continue;
    }

    const target = elements.find(
      (candidate) =>
        candidate.id === element.anchorTargetId &&
        ["screenshot", "image", "cover"].includes(candidate.type ?? ""),
    );
    if (!target) continue;

    const sourcePoint = element.anchorSourcePoint ?? "bottomLeft";
    const targetPoint = element.anchorTargetPoint ?? "bottomLeft";
    const currentSourcePoint = layoutStudioElementAnchorPoint(element, sourcePoint);
    const targetMediaPoint = layoutStudioTargetMediaAnchorPoint(
      target,
      targetPoint,
      layoutStudioMediaDimensionsForElement(
        target,
        screenshotDimensions,
        mediaDimensionsByElementId,
      ),
    );

    element.x = Math.round(element.x + targetMediaPoint.x - currentSourcePoint.x);
    element.y = Math.round(element.y + targetMediaPoint.y - currentSourcePoint.y);
  }

  return elements;
}

function layoutStudioMediaDimensionsForElement(
  element: LayoutStudioResolvedElement,
  screenshotDimensions: MediaDimensions,
  mediaDimensionsByElementId: LayoutStudioMediaDimensionsByElementId,
) {
  if (element.id && mediaDimensionsByElementId.has(element.id)) {
    return mediaDimensionsByElementId.get(element.id) ?? null;
  }

  return element.type === "screenshot" ? screenshotDimensions : null;
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

function fittedLayoutStudioMediaBounds(
  element: LayoutStudioResolvedElement,
  dimensions: MediaDimensions | null,
) {
  const padding = clampNumber(element.padding, 0, Math.min(element.width, element.height) / 2, 0);
  const paddingX = clampNumber(element.paddingX, 0, element.width / 2, padding);
  const paddingY = clampNumber(element.paddingY, 0, element.height / 2, padding);
  const contentX = element.x + paddingX;
  const contentY = element.y + paddingY;
  const contentWidth = Math.max(1, element.width - paddingX * 2);
  const contentHeight = Math.max(1, element.height - paddingY * 2);
  const aspect = dimensions && dimensions.width > 0 && dimensions.height > 0
    ? dimensions.width / dimensions.height
    : null;

  if (!aspect || element.fit === "cover") {
    return { x: contentX, y: contentY, width: contentWidth, height: contentHeight };
  }

  const contentAspect = contentWidth / contentHeight;
  const renderedWidth = aspect > contentAspect ? contentWidth : contentHeight * aspect;
  const renderedHeight = aspect > contentAspect ? contentWidth / aspect : contentHeight;
  const extraX = contentWidth - renderedWidth;
  const extraY = contentHeight - renderedHeight;
  const x =
    element.horizontalAlign === "left"
      ? contentX
      : element.horizontalAlign === "right"
        ? contentX + extraX
        : contentX + extraX / 2;
  const y =
    element.verticalAlign === "top"
      ? contentY
      : element.verticalAlign === "bottom"
        ? contentY + extraY
        : contentY + extraY / 2;

  return { x, y, width: renderedWidth, height: renderedHeight };
}

function layoutStudioAnchorPointOffset(
  width: number,
  height: number,
  point: LayoutStudioAnchorPoint,
) {
  if (point === "top") return { x: width / 2, y: 0 };
  if (point === "bottom") return { x: width / 2, y: height };
  if (point === "left") return { x: 0, y: height / 2 };
  if (point === "right") return { x: width, y: height / 2 };
  if (point === "topLeft") return { x: 0, y: 0 };
  if (point === "topRight") return { x: width, y: 0 };
  if (point === "bottomLeft") return { x: 0, y: height };
  return { x: width, y: height };
}

function layoutStudioRotatePointAroundCenter(
  point: { x: number; y: number },
  center: { x: number; y: number },
  rotation = 0,
) {
  if (!rotation) return point;
  const radians = rotation * (Math.PI / 180);
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = point.x - center.x;
  const dy = point.y - center.y;

  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  };
}

function layoutStudioElementAnchorPoint(
  element: LayoutStudioResolvedElement,
  point: LayoutStudioAnchorPoint,
) {
  const offset = layoutStudioAnchorPointOffset(element.width, element.height, point);
  return layoutStudioRotatePointAroundCenter(
    {
      x: element.x + offset.x,
      y: element.y + offset.y,
    },
    {
      x: element.x + element.width / 2,
      y: element.y + element.height / 2,
    },
    element.rotation ?? 0,
  );
}

function layoutStudioTargetMediaAnchorPoint(
  element: LayoutStudioResolvedElement,
  point: LayoutStudioAnchorPoint,
  dimensions: MediaDimensions | null,
) {
  const bounds = fittedLayoutStudioMediaBounds(element, dimensions);
  const offset = layoutStudioAnchorPointOffset(bounds.width, bounds.height, point);
  return layoutStudioRotatePointAroundCenter(
    {
      x: bounds.x + offset.x,
      y: bounds.y + offset.y,
    },
    {
      x: element.x + element.width / 2,
      y: element.y + element.height / 2,
    },
    element.rotation ?? 0,
  );
}

function fitMediaIntoStudioElement(
  element: LayoutStudioResolvedElement,
  dimensions: MediaDimensions,
) {
  const padding = clampNumber(element.padding, 0, Math.min(element.width, element.height) / 2, 0);
  const paddingX = clampNumber(element.paddingX, 0, element.width / 2, padding);
  const paddingY = clampNumber(element.paddingY, 0, element.height / 2, padding);
  const box = {
    x: element.x + paddingX,
    y: element.y + paddingY,
    width: Math.max(1, element.width - paddingX * 2),
    height: Math.max(1, element.height - paddingY * 2),
  };
  const rotation = rotationRadians(element.rotation);
  const fit = rotation ? "contain" : element.fit === "cover" ? "cover" : "contain";
  const scale = fit === "cover"
    ? Math.max(box.width / dimensions.width, box.height / dimensions.height)
    : rotation
      ? (() => {
          const radians = Number(rotation);
          const sin = Math.abs(Math.sin(radians));
          const cos = Math.abs(Math.cos(radians));
          const rotatedWidthFactor = dimensions.width * cos + dimensions.height * sin;
          const rotatedHeightFactor = dimensions.width * sin + dimensions.height * cos;
          return Math.min(
            box.width / Math.max(1, rotatedWidthFactor),
            box.height / Math.max(1, rotatedHeightFactor),
          );
        })()
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
      const finish = (filter: string, renderedWidth: number, renderedHeight: number) => {
        const rotation = rotationRadians(element.rotation);
        if (!rotation) return [`${filter}[${output}]`];
        const paddedOutput = `${output}_padded`;
        const rotationCanvas = Math.ceil(
          Math.sqrt(renderedWidth * renderedWidth + renderedHeight * renderedHeight),
        );

        return [
          `${filter}[${scaledOutput}]`,
          `[${scaledOutput}]pad=${rotationCanvas}:${rotationCanvas}:(ow-iw)/2:(oh-ih)/2:color=black@0[${paddedOutput}]`,
          `[${paddedOutput}]rotate=${rotation}:c=none:ow=iw:oh=ih[${output}]`,
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
          Math.round(box.width),
          Math.round(box.height),
        );
      }

      return finish(
        `${inputLabel}scale=${width}:${height}:force_original_aspect_ratio=decrease,setsar=1,format=rgba`,
        width,
        height,
      );
    },
  };
}

function wrapText(text: string, maxLineLength: number) {
  return text
    .split(/\n+/)
    .map((paragraph) => {
      const words = paragraph.replace(/[^\S\n]+/g, " ").trim().split(" ").filter(Boolean);
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
    })
    .filter(Boolean)
    .join("\n");
}

function normalizeTextForWrap(text: string) {
  return text
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
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
      emojiStyle: "noto",
      outputFilepath: overlayFilepath,
      shadowPreset,
      text,
      useNotoEmojiAssets: true,
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
  mediaDimensionsByElementId,
  renderOptions,
  screenshotDimensions,
  hookText,
}: {
  campaignId: string;
  jobId: string;
  mediaDimensionsByElementId?: LayoutStudioMediaDimensionsByElementId;
  renderOptions: RenderOptions;
  screenshotDimensions: MediaDimensions;
  hookText: string;
}): Promise<Array<HookOverlayResult & {
  element: LayoutStudioResolvedElement;
  startSeconds?: number;
  endSeconds?: number;
}>> {
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
    cta: postCopy?.ctaText?.trim() ?? "",
  };
  const elements = resolveLayoutStudioElements(
    studioTemplate,
    screenshotDimensions,
    mediaDimensionsByElementId,
  );
  const textElements = elements.filter(isLayoutStudioTextElement);
  const timelineClips = layoutStudioTimelineClips(studioTemplate);
  const resolvedClips = resolvedTimelineClipById(renderOptions);

  if (timelineClips.length > 0 && resolvedClips.size > 0) {
    const elementById = new Map(
      textElements
        .filter((element) => element.id)
        .map((element) => [element.id as string, element]),
    );
    const fallbackElementsByType = new Map<string, LayoutStudioResolvedElement[]>();
    for (const element of textElements) {
      const key = element.type ?? "";
      fallbackElementsByType.set(key, [...(fallbackElementsByType.get(key) ?? []), element]);
    }
    const timelineTextClips = timelineClips.filter((clip) =>
      ["hook", "title", "cta", "keywords", "tropes"].includes(clip.layerType ?? ""),
    );
    const overlays: Array<StudioTextOverlayInput & { filepath: string }> = [];

    for (const [index, clip] of timelineTextClips.entries()) {
      const resolved = clip.id ? resolvedClips.get(clip.id) : null;
      const layerType = clip.layerType ?? "";
      const element =
        (clip.elementId ? elementById.get(clip.elementId) : null) ??
        (fallbackElementsByType.get(layerType) ?? [])[0];

      if (!element) continue;

      const text =
        layerType === "title"
          ? textByType.title
          : layerType === "keywords"
            ? layoutStudioListText(keywords, element)
            : layerType === "tropes"
              ? layoutStudioListText(postCopy?.tropes, element)
              : (resolved?.asset?.text ?? textByType[layerType] ?? "").trim();
      if (!text) continue;

      const overlay = await createLayoutStudioTextOverlay({
        campaignId,
        element,
        index,
        jobId,
        text,
      });

      overlays.push({
        element,
        ...overlay,
        inputIndex: -1,
        startSeconds: clampNumber(clip.startSeconds, 0, 3600, 0),
        endSeconds: timelineClipEndSeconds(clip),
      });
    }

    return overlays;
  }

  return Promise.all(
    textElements.map(async (element, index) => {
      const text =
        element.type === "keywords"
          ? layoutStudioListText(keywords, element)
          : element.type === "tropes"
            ? layoutStudioListText(postCopy?.tropes, element)
            : (textByType[element.type ?? ""] ?? "").trim();
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
  const paddingX = clampNumber(
    (element.paddingX ?? element.padding ?? 0) * layoutStudioTypographyScale,
    0,
    element.width / 2,
    padding,
  );
  const paddingY = clampNumber(
    (element.paddingY ?? element.padding ?? 0) * layoutStudioTypographyScale,
    0,
    element.height / 2,
    padding,
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
  const maxWidth = Math.max(40, element.width - paddingX * 2 - textWrapPaddingX * 2);
  const maxHeight = Math.max(24, element.height - paddingY * 2 - textWrapPaddingY * 2);
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
  const textShadowPadding = element.textShadow
    ? ((element.textShadowBlur ?? 4) + Math.abs(element.textShadowDistance ?? 2)) * layoutStudioTypographyScale
    : 0;
  const rotationPadding = rotatedElementPadding(element);
  const overlayPadding = Math.ceil(Math.max(outlineWidth + 8, shadowPadding, textShadowPadding, rotationPadding));

  return createTextOverlayImage({
    campaignId,
    fontCandidates: fontCandidatesForStudioElement(element),
    fontSize: fit.fontSize,
    fontWeight: element.fontWeight ?? 700,
    height: Math.round(element.height + overlayPadding * 2),
    jobId,
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
      padding: `${paddingY}px ${paddingX}px`,
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
      textShadow: shadowCss(
        element.textShadow,
        element.textShadowColor,
        (element.textShadowBlur ?? 4) * layoutStudioTypographyScale,
        (element.textShadowDistance ?? 2) * layoutStudioTypographyScale,
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

function sceneVideoHookTimeline(options: RenderOptions) {
  const scenes = Array.isArray(options.sceneVideoPost?.scenes)
    ? options.sceneVideoPost?.scenes ?? []
    : [];
  let cursor = 0;

  return scenes
    .map((scene, index) => {
      const text =
        scene.assets?.hook?.text?.trim() ??
        scene.assets?.hook?.label?.trim() ??
        "";
      const duration = clampNumber(scene.durationSeconds ?? undefined, 0.1, 60, 4);
      const timing = {
        sceneId: scene.sceneId ?? null,
        sceneIndex: index,
        text,
        startSeconds: cursor,
        endSeconds: cursor + duration,
      };
      cursor += duration;
      return timing;
    })
    .filter((scene) => Boolean(scene.text));
}

function sceneAssetText(asset: { text?: string | null; label?: string | null } | null | undefined) {
  return asset?.text?.trim() || asset?.label?.trim() || "";
}

function sceneVideoTextTimeline(options: RenderOptions) {
  const scenes = Array.isArray(options.sceneVideoPost?.scenes)
    ? options.sceneVideoPost?.scenes ?? []
    : [];
  let cursor = 0;
  const entries: Array<{
    sceneId: string | null;
    sceneIndex: number;
    type: "hook" | "title" | "keywords" | "tropes" | "cta";
    text: string;
    startSeconds: number;
    endSeconds: number;
  }> = [];

  scenes.forEach((scene, sceneIndex) => {
    const duration = clampNumber(scene.durationSeconds ?? undefined, 0.1, 60, 4);
    const startSeconds = cursor;
    const endSeconds = cursor + duration;
    const keywords = (scene.assets?.keywords ?? [])
      .map((asset) => sceneAssetText(asset))
      .filter(Boolean)
      .join(" • ");
    const tropes = (scene.assets?.tropes ?? [])
      .map((asset) => sceneAssetText(asset))
      .filter(Boolean)
      .join(" • ");
    const textByType = {
      hook: sceneAssetText(scene.assets?.hook),
      title: scene.metadataTemplateId
        ? normaliseRenderedMetadataLine(scene.renderedMetadataLine?.trim() ?? "")
        : "",
      keywords,
      tropes,
      cta: sceneAssetText(scene.assets?.cta),
    };

    (["hook", "title", "keywords", "tropes", "cta"] as const).forEach((type) => {
      const text = textByType[type]?.trim();
      if (!text) return;
      entries.push({
        sceneId: scene.sceneId ?? null,
        sceneIndex,
        type,
        text,
        startSeconds,
        endSeconds,
      });
    });

    cursor = endSeconds;
  });

  return entries;
}

function sceneAssetFilepath(asset: { filepath?: string | null } | null | undefined) {
  return asset?.filepath?.trim() ?? "";
}

function sceneMediaForElement(
  scene: NonNullable<NonNullable<RenderOptions["sceneVideoPost"]>["scenes"]>[number],
  elementType: string | null | undefined,
) {
  if (elementType === "screenshot") return scene.assets?.screenshot ?? null;
  if (elementType === "image" || elementType === "cover") {
    return scene.assets?.image ?? scene.assets?.screenshot ?? null;
  }
  return null;
}

function isLayoutStudioMediaElement(element: LayoutStudioElement) {
  return ["screenshot", "image", "cover"].includes(element.type ?? "");
}

function sceneVideoVisualTimeline(options: RenderOptions) {
  const scenes = Array.isArray(options.sceneVideoPost?.scenes)
    ? options.sceneVideoPost?.scenes ?? []
    : [];
  const template = layoutStudioTemplate(options);
  let cursor = 0;
  const entries: Array<{
    element?: LayoutStudioResolvedElement | null;
    filepath: string;
    startSeconds: number;
    endSeconds: number;
  }> = [];

  scenes.forEach((scene, sceneIndex) => {
    const duration = clampNumber(scene.durationSeconds ?? undefined, 0.1, 60, 4);
    const startSeconds = cursor;
    const endSeconds = cursor + duration;
    const mediaElements = layoutStudioSceneElements(template, scene.sceneId, sceneIndex)
      .filter(isLayoutStudioMediaElement)
      .map(resolveLayoutStudioElementBox)
      .filter((element): element is LayoutStudioResolvedElement => Boolean(element));
    const backgroundFilepath = sceneAssetFilepath(scene.assets?.background);

    if (backgroundFilepath) {
      entries.push({
        element: null,
        filepath: backgroundFilepath,
        startSeconds: cursor,
        endSeconds,
      });
    }

    if (mediaElements.length > 0) {
      for (const element of mediaElements) {
        const filepath = sceneAssetFilepath(sceneMediaForElement(scene, element.type));
        if (!filepath) continue;
        entries.push({
          element,
          filepath,
          startSeconds,
          endSeconds,
        });
      }
    } else if (!backgroundFilepath) {
      const fallbackFilepath =
        sceneAssetFilepath(scene.assets?.image) ||
        sceneAssetFilepath(scene.assets?.screenshot);
      if (fallbackFilepath) {
        entries.push({
          element: null,
          filepath: fallbackFilepath,
          startSeconds,
          endSeconds,
        });
      }
    }

    cursor = endSeconds;
  });

  return entries;
}

function layoutStudioSceneElements(
  template: CanvasLayoutTemplate | null,
  sceneId: string | null | undefined,
  sceneIndex: number,
) {
  const scenes = Array.isArray(template?.scenes) ? template?.scenes ?? [] : [];
  const scene =
    (sceneId ? scenes.find((candidate) => candidate.id === sceneId) : null) ??
    scenes[sceneIndex] ??
    null;

  return Array.isArray(scene?.elements) ? scene.elements : [];
}

function layoutStudioTemplateForScene(
  template: CanvasLayoutTemplate | null,
  sceneId: string | null | undefined,
  sceneIndex: number,
) {
  if (!template) return null;
  const elements = layoutStudioSceneElements(template, sceneId, sceneIndex);
  if (!elements.length) return null;

  return {
    ...template,
    elements,
    scenes: undefined,
    compositionTimeline: undefined,
  };
}

function layoutStudioResolvedSceneElements(
  template: CanvasLayoutTemplate | null,
  sceneId: string | null | undefined,
  sceneIndex: number,
  screenshotDimensions: MediaDimensions,
  mediaDimensionsByElementId: LayoutStudioMediaDimensionsByElementId = new Map(),
) {
  const sceneTemplate = layoutStudioTemplateForScene(template, sceneId, sceneIndex);
  return sceneTemplate
    ? resolveLayoutStudioElements(
        sceneTemplate,
        screenshotDimensions,
        mediaDimensionsByElementId,
      )
    : [];
}

function resolveLayoutStudioSceneTextElement(
  template: CanvasLayoutTemplate | null,
  sceneId: string | null | undefined,
  sceneIndex: number,
  type: string,
) {
  const element = layoutStudioSceneElements(template, sceneId, sceneIndex).find(
    (candidate) => candidate.type === type,
  );
  return element ? resolveLayoutStudioElementBox(element) : null;
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

function sceneSlideTextForElement(
  scene: NonNullable<NonNullable<RenderOptions["sceneVideoPost"]>["scenes"]>[number],
  element: LayoutStudioElement,
) {
  if (element.type === "hook") return sceneAssetText(scene.assets?.hook);
  if (element.type === "title") {
    return scene.metadataTemplateId
      ? normaliseRenderedMetadataLine(scene.renderedMetadataLine?.trim() ?? "")
      : "";
  }
  if (element.type === "keywords") {
    return layoutStudioListText(
      (scene.assets?.keywords ?? [])
        .map((asset) => sceneAssetText(asset))
        .filter(Boolean),
      element,
    );
  }
  if (element.type === "tropes") {
    return layoutStudioListText(
      (scene.assets?.tropes ?? [])
        .map((asset) => sceneAssetText(asset))
        .filter(Boolean),
      element,
    );
  }
  if (element.type === "cta") return sceneAssetText(scene.assets?.cta);
  return "";
}

async function sceneMediaDimensionsByElementId(input: {
  elements: LayoutStudioResolvedElement[];
  scene: NonNullable<NonNullable<RenderOptions["sceneVideoPost"]>["scenes"]>[number];
  screenshotDimensions: MediaDimensions;
}) {
  const dimensionsByElementId: LayoutStudioMediaDimensionsByElementId = new Map();

  for (const element of input.elements) {
    if (!element.id || !isLayoutStudioMediaElement(element)) continue;
    const filepath =
      element.type === "screenshot"
        ? sceneAssetFilepath(input.scene.assets?.screenshot)
        : sceneAssetFilepath(sceneMediaForElement(input.scene, element.type));
    const dimensions = filepath
      ? await getMediaDimensions(filepath).catch(() => null)
      : element.type === "screenshot"
        ? input.screenshotDimensions
        : null;

    if (dimensions) {
      dimensionsByElementId.set(element.id, dimensions);
    }
  }

  return dimensionsByElementId;
}

async function renderSlideImage(input: {
  backgroundFilepath?: string | null;
  campaignId: string;
  dimensions?: MediaDimensions;
  jobId: string;
  jpegQuality?: number;
  outputFilepath: string;
  renderOptions: RenderOptions;
  scene: NonNullable<NonNullable<RenderOptions["sceneVideoPost"]>["scenes"]>[number];
  sceneIndex: number;
  screenshotFilepath?: string | null;
  screenshotDimensions: MediaDimensions;
  studioTemplate: CanvasLayoutTemplate;
}) {
  const outputWidth = input.dimensions?.width ?? canvasWidth;
  const outputHeight = input.dimensions?.height ?? canvasHeight;
  const rawSceneTemplate = layoutStudioTemplateForScene(
    input.studioTemplate,
    input.scene.sceneId,
    input.sceneIndex,
  );
  if (!rawSceneTemplate) {
    throw new Error(`Slide ${input.sceneIndex + 1} is missing Layout Studio scene elements.`);
  }

  const rawElements = layoutStudioSceneElements(
    input.studioTemplate,
    input.scene.sceneId,
    input.sceneIndex,
  )
    .map(resolveLayoutStudioElementBox)
    .filter((element): element is LayoutStudioResolvedElement => Boolean(element));
  const mediaDimensionsByElementId = await sceneMediaDimensionsByElementId({
    elements: rawElements,
    scene: input.scene,
    screenshotDimensions: input.screenshotDimensions,
  });
  const resolvedElements = layoutStudioResolvedSceneElements(
    input.studioTemplate,
    input.scene.sceneId,
    input.sceneIndex,
    input.screenshotDimensions,
    mediaDimensionsByElementId,
  );
  const elementByKey = new Map(
    resolvedElements.map((element) => [studioElementKey(element), element]),
  );
  const args = ["-y"];
  const sceneBackgroundFilepath =
    sceneAssetFilepath(input.scene.assets?.background) || input.backgroundFilepath || "";

  if (sceneBackgroundFilepath) {
    pushMediaInput(args, sceneBackgroundFilepath, { loopStillImage: true });
  } else {
    args.push("-f", "lavfi", "-i", `color=c=white:s=${outputWidth}x${outputHeight}:d=1`);
  }
  let nextInputIndex = 1;

  const studioMediaOverlayInputs: StudioMediaOverlayInput[] = [];
  for (const element of resolvedElements.filter(isLayoutStudioMediaElement)) {
    const filepath =
      element.type === "screenshot"
        ? sceneAssetFilepath(input.scene.assets?.screenshot) || input.screenshotFilepath || ""
        : sceneAssetFilepath(sceneMediaForElement(input.scene, element.type));
    if (!filepath || !(await fileExists(filepath))) continue;

    const dimensions = await getMediaDimensions(filepath).catch(() => ({
      width: canvasWidth,
      height: canvasHeight,
    }));

    pushMediaInput(args, filepath, { loopStillImage: true });
    studioMediaOverlayInputs.push({
      element,
      inputIndex: nextInputIndex,
      width: dimensions.width,
      height: dimensions.height,
      startSeconds: 0,
      endSeconds: 1,
    });
    nextInputIndex += 1;
  }

  const studioTextOverlayInputs: StudioTextOverlayInput[] = [];
  for (const [index, rawElement] of layoutStudioSceneElements(
    input.studioTemplate,
    input.scene.sceneId,
    input.sceneIndex,
  )
    .filter(isLayoutStudioTextElement)
    .entries()) {
    const resolvedElement = elementByKey.get(studioElementKey(rawElement));
    if (!resolvedElement) continue;

    const text = sceneSlideTextForElement(input.scene, resolvedElement).trim();
    if (!text) continue;

    const overlay = await createLayoutStudioTextOverlay({
      campaignId: input.campaignId,
      element: resolvedElement,
      index,
      jobId: `${input.jobId}-slide-${input.sceneIndex + 1}`,
      text,
    });

    pushMediaInput(args, overlay.filepath, { loop: true, loopStillImage: true });
    studioTextOverlayInputs.push({
      element: resolvedElement,
      height: overlay.height,
      inputIndex: nextInputIndex,
      startSeconds: 0,
      endSeconds: 1,
      width: overlay.width,
    });
    nextInputIndex += 1;
  }

  const composedOutputLabel = `slide_${input.sceneIndex}_composed`;
  const outputIsJpeg = [".jpg", ".jpeg"].includes(
    path.extname(input.outputFilepath).toLowerCase(),
  );
  const filterComplex = [
    buildLayoutStudioFilterComplex({
      baseFilters: [
        `[0:v]scale=${outputWidth}:${outputHeight}:force_original_aspect_ratio=increase,crop=${outputWidth}:${outputHeight}:(iw-ow)/2:(ih-oh)/2,setsar=1,format=rgba[bg]`,
      ],
      outputLabel: composedOutputLabel,
      screenshotDimensions: input.screenshotDimensions,
      studioMediaOverlays: studioMediaOverlayInputs,
      studioTemplate: rawSceneTemplate,
      studioTextOverlays: studioTextOverlayInputs,
      mediaDimensionsByElementId,
    }),
    `[${composedOutputLabel}]scale=${outputWidth}:${outputHeight}:flags=lanczos,setsar=1,format=${outputIsJpeg ? "yuv420p" : "rgba"}[vout]`,
  ].join(";");
  const jpegQscale = jpegQualityToFfmpegQscale(input.jpegQuality ?? 92);
  args.push("-filter_complex", filterComplex, "-frames:v", "1", "-map", "[vout]");
  if (outputIsJpeg) {
    args.push("-q:v", String(jpegQscale));
  }
  args.push(input.outputFilepath);

  await runCommand(ffmpegBinary, args, { all: true });
}

function jpegQualityToFfmpegQscale(quality: number) {
  const boundedQuality = clampNumber(quality, 1, 100, 92);
  return clampNumber(Math.round(31 - (boundedQuality / 100) * 29), 2, 31, 2);
}

export type GroupedImagePostRenderInput = {
  campaignId: string;
  parentOutputId: string;
  outputKind: "slides" | "carousel";
  jpegQuality?: number;
  dimensions: MediaDimensions;
  layout: {
    layoutId: string;
    name?: string;
    templateJson: unknown;
  };
  cards: Array<{
    index: number;
    sceneId?: string | null;
    assets?: unknown;
    elements?: unknown;
    renderOptions?: unknown;
  }>;
};

export type GroupedImagePostRenderResult = {
  index: number;
  status: "done" | "failed";
  filename: string;
  filepath?: string;
  width?: number;
  height?: number;
  sizeBytes?: number;
  errorMessage?: string;
};

function groupedImageTemplate(input: GroupedImagePostRenderInput) {
  const template =
    input.layout.templateJson && typeof input.layout.templateJson === "object"
      ? (input.layout.templateJson as CanvasLayoutTemplate)
      : null;

  if (!template || !isLayoutStudioTemplate(template)) {
    throw new Error("Grouped image render is missing a valid Layout Studio templateJson.");
  }

  const cardsWithElements = input.cards.filter((card) => Array.isArray(card.elements));
  if ((template.scenes?.length ?? 0) > 0 || cardsWithElements.length === 0) {
    return template;
  }

  return {
    ...template,
    scenes: input.cards.map((card) => ({
      id: card.sceneId ?? `card-${card.index}`,
      elements: Array.isArray(card.elements) ? card.elements as LayoutStudioElement[] : [],
    })),
  };
}

function groupedImageScene(
  card: GroupedImagePostRenderInput["cards"][number],
): NonNullable<NonNullable<RenderOptions["sceneVideoPost"]>["scenes"]>[number] {
  const renderOptions =
    card.renderOptions && typeof card.renderOptions === "object"
      ? (card.renderOptions as Record<string, unknown>)
      : {};
  const sourceScene =
    renderOptions.scene && typeof renderOptions.scene === "object"
      ? (renderOptions.scene as Record<string, unknown>)
      : {};

  return {
    ...sourceScene,
    sceneId: card.sceneId ?? (typeof sourceScene.sceneId === "string" ? sourceScene.sceneId : null),
    assets:
      card.assets && typeof card.assets === "object"
        ? (card.assets as NonNullable<NonNullable<RenderOptions["sceneVideoPost"]>["scenes"]>[number]["assets"])
        : (
            sourceScene.assets && typeof sourceScene.assets === "object"
              ? (sourceScene.assets as NonNullable<NonNullable<RenderOptions["sceneVideoPost"]>["scenes"]>[number]["assets"])
              : null
          ),
  };
}

export async function renderGroupedImagePostJob(
  input: GroupedImagePostRenderInput,
): Promise<GroupedImagePostRenderResult[]> {
  const template = groupedImageTemplate(input);
  const renderOptions: RenderOptions = {
    postType: input.outputKind === "slides" ? "tiktok_slides_post" : "instagram_carousel_post",
    layoutTemplateId: input.layout.layoutId,
    layoutTemplateJson: template,
    sceneVideoPost: {
      scenes: input.cards.map(groupedImageScene),
    },
  };
  const outputDirectory = path.join(
    paths.rendersDirectory,
    input.campaignId,
    input.parentOutputId,
    "grouped-images",
  );

  await fs.mkdir(outputDirectory, { recursive: true });

  const scenes = renderOptions.sceneVideoPost?.scenes ?? [];
  const fallbackMediaFilepath =
    scenes
      .map((scene) =>
        sceneAssetFilepath(scene.assets?.screenshot) ||
        sceneAssetFilepath(scene.assets?.image) ||
        sceneAssetFilepath(scene.assets?.background),
      )
      .find(Boolean) ?? null;
  const screenshotDimensions = fallbackMediaFilepath
    ? await getMediaDimensions(fallbackMediaFilepath).catch(() => input.dimensions)
    : input.dimensions;

  const results: GroupedImagePostRenderResult[] = [];

  for (const [sceneIndex, scene] of scenes.entries()) {
    const card = input.cards[sceneIndex];
    const index = card?.index ?? sceneIndex;
    const filename = `${String(sceneIndex + 1).padStart(2, "0")}.jpg`;
    const filepath = path.join(outputDirectory, filename);

    try {
      await fs.rm(filepath, { force: true });
      await renderSlideImage({
        backgroundFilepath: fallbackMediaFilepath,
        campaignId: input.campaignId,
        dimensions: input.dimensions,
        jobId: input.parentOutputId,
        jpegQuality: input.jpegQuality ?? 92,
        outputFilepath: filepath,
        renderOptions,
        scene,
        sceneIndex,
        screenshotFilepath: fallbackMediaFilepath,
        screenshotDimensions,
        studioTemplate: template,
      });

      const stat = await fs.stat(filepath);
      if (stat.size < 1024) {
        throw new Error(`Rendered image ${sceneIndex + 1} is invalid (${stat.size} bytes).`);
      }

      results.push({
        index,
        status: "done",
        filename,
        filepath,
        width: input.dimensions.width,
        height: input.dimensions.height,
        sizeBytes: stat.size,
      });
    } catch (error) {
      results.push({
        index,
        status: "failed",
        filename,
        errorMessage: commandErrorMessage(error),
      });
    }
  }

  return results.sort((a, b) => a.index - b.index);
}

async function renderSlidePostJob(input: {
  job: NonNullable<ReturnType<typeof getRenderJobDetails>>;
  preparedScreenshotFilepath: string;
  renderOptions: RenderOptions;
  screenshotDimensions: MediaDimensions;
  studioTemplate: CanvasLayoutTemplate;
}) {
  const scenes = Array.isArray(input.renderOptions.sceneVideoPost?.scenes)
    ? input.renderOptions.sceneVideoPost?.scenes ?? []
    : [];

  if (scenes.length === 0) {
    throw new Error("Slide/carousel render is missing slide scene data.");
  }

  const outputFilename = `${input.job.id}-slides.zip`;
  const outputDirectory = path.join(paths.rendersDirectory, input.job.campaign_id, input.job.id);
  const slidesDirectory = path.join(outputDirectory, "slides");
  const outputFilepath = path.join(outputDirectory, outputFilename);
  const manifestFilepath = path.join(outputDirectory, "manifest.json");

  await fs.mkdir(slidesDirectory, { recursive: true });
  await fs.rm(outputFilepath, { force: true });
  markRenderJobRunning(input.job.id);

  try {
    const slides = [];

    for (const [index, scene] of scenes.entries()) {
      const filename = `slide-${String(index + 1).padStart(2, "0")}.png`;
      const filepath = path.join(slidesDirectory, filename);
      await renderSlideImage({
        backgroundFilepath: input.job.background_filepath,
        campaignId: input.job.campaign_id,
        jobId: input.job.id,
        outputFilepath: filepath,
        renderOptions: input.renderOptions,
        scene,
        sceneIndex: index,
        screenshotFilepath: input.preparedScreenshotFilepath,
        screenshotDimensions: input.screenshotDimensions,
        studioTemplate: input.studioTemplate,
      });

      const stat = await fs.stat(filepath);
      if (stat.size < 1024) {
        throw new Error(`Rendered slide ${index + 1} is invalid (${stat.size} bytes).`);
      }

      slides.push({
        filename,
        sceneId: scene.sceneId ?? null,
        order: index + 1,
      });
    }

    await fs.writeFile(
      manifestFilepath,
      JSON.stringify(
        {
          version: "authorloom.slide_post.v1",
          postType: input.renderOptions.postType,
          jobId: input.job.id,
          slideCount: slides.length,
          slides,
        },
        null,
        2,
      ),
    );

    await runCommand(
      "zip",
      ["-j", outputFilepath, manifestFilepath, ...slides.map((slide) => path.join(slidesDirectory, slide.filename))],
      { all: true },
    );

    const outputStat = await fs.stat(outputFilepath);
    if (outputStat.size < 1024) {
      throw new Error(`Rendered slide archive is invalid (${outputStat.size} bytes).`);
    }

    markRenderJobDone({
      jobId: input.job.id,
      outputFilename,
      outputFilepath,
    });

    return {
      effectiveLayoutTemplate: input.renderOptions.layoutTemplate,
      effectiveLayoutTemplateId: input.renderOptions.layoutTemplateId,
      outputFilename,
      outputFilepath,
    };
  } catch (error) {
    const message = commandErrorMessage(error);
    markRenderJobFailed(input.job.id, message);
    throw new Error(message);
  }
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
  const normalized = normalizeTextForWrap(text);

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
  const normalized = normalizeTextForWrap(text);

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

function layoutStudioListText(
  items: string[] | undefined,
  element: LayoutStudioElement,
) {
  const clean = (items ?? []).filter((item): item is string => Boolean(item?.trim()));
  if (!clean.length) return "";
  return element.textListStyle === "list"
    ? clean.map((item) => `• ${item}`).join("\n")
    : clean.join(" • ");
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
  if (studioTemplate && isSlidePostRender(renderOptions)) {
    return renderSlidePostJob({
      job,
      preparedScreenshotFilepath: preparedScreenshot.filepath,
      renderOptions,
      screenshotDimensions,
      studioTemplate,
    });
  }
  const customTemplate = customCanvasTemplate(renderOptions);
  const customHookBox = customElementBox(customTemplate, "hook");
  const customCoverBox = customElementBox(customTemplate, "cover");
  const isCoverLayout =
    layoutTemplate === "left_cover_center_screenshot" ||
    layoutTemplate === "left_cover_offset_screenshot";
  const sceneHookTimeline = sceneVideoHookTimeline(renderOptions);
  const sceneTextTimeline = sceneVideoTextTimeline(renderOptions);
  const sceneVisualTimeline = sceneVideoVisualTimeline(renderOptions);
  const multiHookTexts = sceneHookTimeline.length > 0
    ? sceneHookTimeline.map((scene) => scene.text)
    : Array.isArray(renderOptions.multiHookTexts)
    ? renderOptions.multiHookTexts.filter((text) => Boolean(text?.trim()))
    : [];
  const isFullBackgroundMultiHook =
    (renderOptions.layoutTemplate === "booktok_full_background_multi_hook" ||
      sceneHookTimeline.length > 0) &&
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
  const backgroundColorMetadata = backgroundIsStillImage
    ? null
    : await getVideoColorMetadata(job.background_filepath).catch((error) => {
        console.warn("Could not read background color metadata:", commandErrorMessage(error));
        return null;
      });
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
  const renderDuration = audioLimitedRenderDuration;
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
  const timedHookOverlayEntries = isFullBackgroundMultiHook
    ? (await Promise.all(
        sceneTextTimeline.map(async (textTiming, index) => {
          const sceneHookElement = resolveLayoutStudioSceneTextElement(
            renderOptions.layoutTemplateJson ?? null,
            textTiming.sceneId,
            textTiming.sceneIndex,
            textTiming.type,
          );

          if (sceneHookElement) {
            const overlay = await createLayoutStudioTextOverlay({
              campaignId: job.campaign_id,
              element: sceneHookElement,
              index,
              jobId: job.id,
              text: textTiming.text,
            });

            return {
              overlay: {
                ...overlay,
                element: sceneHookElement,
              },
              timing: textTiming,
            };
          }

          if (textTiming.type !== "hook") {
            return null;
          }

          const overlay = await createHookOverlayImage(
            job.campaign_id,
            job.id,
            textTiming.text,
            `${textTiming.type}-${index}`,
            layoutTemplate,
          );

          return {
            overlay,
            timing: textTiming,
          };
        }),
      )).filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    : [];
  const postCopyOverlays = await createPostCopyOverlays({
    campaignId: job.campaign_id,
    jobId: job.id,
    renderOptions,
  });
  const studioMediaDimensionsByElementId = await layoutStudioMediaDimensionsByElementId({
    coverFilepath: hasCoverOverlay ? job.thumbnail_filepath : null,
    renderOptions,
    screenshotDimensions,
    studioTemplate,
  });
  const studioTextOverlays = await createLayoutStudioTextOverlays({
    campaignId: job.campaign_id,
    hookText: job.hook_text,
    jobId: job.id,
    mediaDimensionsByElementId: studioMediaDimensionsByElementId,
    renderOptions,
    screenshotDimensions,
  });
  const footerHeight =
    (postCopyOverlays.metadataOverlay?.height ?? 0) +
    (postCopyOverlays.keywordsOverlay?.height ?? 0) +
    96;
  const timedHookHeight = Math.max(
    0,
    ...timedHookOverlayEntries.map((entry) => entry.overlay.height),
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
    !backgroundIsStillImage &&
    typeof renderOptions.backgroundStartTime === "number" &&
    renderOptions.backgroundStartTime > 0
  ) {
    args.push("-ss", String(renderOptions.backgroundStartTime));
  }

  pushMediaInput(args, job.background_filepath, {
    loop: backgroundIsStillImage || shouldLoopBackgroundVideo,
    loopStillImage: backgroundIsStillImage,
  });
  pushMediaInput(args, preparedScreenshot.filepath, {
    loop: true,
    loopStillImage: true,
  });

  let nextInputIndex = 2;

  const hookOverlayInputIndex = hookOverlay ? nextInputIndex : null;

  if (hookOverlay) {
    pushMediaInput(args, hookOverlay.filepath, {
      loop: true,
      loopStillImage: true,
    });
    nextInputIndex += 1;
  }

  const timedHookOverlayInputs: HookOverlayInput[] = [];

  if (timedHookOverlayEntries.length > 0) {
    timedHookOverlayEntries.forEach(({ overlay, timing }) => {
      pushMediaInput(args, overlay.filepath, {
        loop: true,
        loopStillImage: true,
      });
      timedHookOverlayInputs.push({
        element: "element" in overlay ? overlay.element : null,
        inputIndex: nextInputIndex,
        height: overlay.height,
        startSeconds: timing.startSeconds,
        endSeconds: timing.endSeconds,
      });
      nextInputIndex += 1;
    });
  }

  const metadataOverlayInputIndex = postCopyOverlays.metadataOverlay
    ? nextInputIndex
    : null;

  if (postCopyOverlays.metadataOverlay) {
    pushMediaInput(args, postCopyOverlays.metadataOverlay.filepath, {
      loop: true,
      loopStillImage: true,
    });
    nextInputIndex += 1;
  }

  const keywordsOverlayInputIndex = postCopyOverlays.keywordsOverlay
    ? nextInputIndex
    : null;

  if (postCopyOverlays.keywordsOverlay) {
    pushMediaInput(args, postCopyOverlays.keywordsOverlay.filepath, {
      loop: true,
      loopStillImage: true,
    });
    nextInputIndex += 1;
  }

  const coverInputIndex = hasCoverOverlay ? nextInputIndex : null;

  if (hasCoverOverlay && job.thumbnail_filepath) {
    pushMediaInput(args, job.thumbnail_filepath, {
      loop: true,
      loopStillImage: true,
    });
    nextInputIndex += 1;
  }

  const introFilepath =
    studioTemplate && await fileExists(renderOptions.layoutStudioAssets?.introFilepath ?? null)
      ? renderOptions.layoutStudioAssets?.introFilepath ?? null
      : null;
  const introInputIndex = introFilepath ? nextInputIndex : null;

  if (introFilepath) {
    pushMediaInput(args, introFilepath, {
      loop: true,
      loopStillImage: true,
    });
    nextInputIndex += 1;
  }

  const outroFilepath =
    studioTemplate && await fileExists(renderOptions.layoutStudioAssets?.outroFilepath ?? null)
      ? renderOptions.layoutStudioAssets?.outroFilepath ?? null
      : null;
  const outroInputIndex = outroFilepath ? nextInputIndex : null;

  if (outroFilepath) {
    pushMediaInput(args, outroFilepath, {
      loop: true,
      loopStillImage: true,
    });
    nextInputIndex += 1;
  }

  const studioTextOverlayInputs: StudioTextOverlayInput[] = [];

  if (studioTextOverlays.length > 0) {
    studioTextOverlays.forEach((overlay) => {
      pushMediaInput(args, overlay.filepath, {
        loop: true,
        loopStillImage: true,
      });
      studioTextOverlayInputs.push({
        element: overlay.element,
        height: overlay.height,
        inputIndex: nextInputIndex,
        startSeconds: overlay.startSeconds,
        endSeconds: overlay.endSeconds,
        width: overlay.width,
      });
      nextInputIndex += 1;
    });
  }

  const studioBackgroundOverlayInputs: StudioBackgroundOverlayInput[] = [];
  const studioMediaOverlayInputs: StudioMediaOverlayInput[] = [];

  if (studioTemplate) {
    const resolvedClips = resolvedTimelineClipById(renderOptions);
    const timelineClips = layoutStudioTimelineClips(studioTemplate);
    const elements = resolveLayoutStudioElements(
      studioTemplate,
      screenshotDimensions,
      studioMediaDimensionsByElementId,
    );
    const elementById = new Map(
      elements
        .filter((element) => element.id)
        .map((element) => [element.id as string, element]),
    );
    const fallbackElementsByType = new Map<string, LayoutStudioResolvedElement[]>();
    for (const element of elements) {
      if (!["screenshot", "image", "cover"].includes(element.type ?? "")) continue;
      const key = element.type ?? "";
      fallbackElementsByType.set(key, [...(fallbackElementsByType.get(key) ?? []), element]);
    }

    for (const clip of timelineClips) {
      const resolved = clip.id ? resolvedClips.get(clip.id) : null;
      const filepath = resolved?.asset?.filepath ?? null;
      if (!filepath || !(await fileExists(filepath))) continue;

      const startSeconds = clampNumber(clip.startSeconds, 0, 3600, 0);
      const endSeconds = timelineClipEndSeconds(clip);
      const layerType = clip.layerType ?? "";

      if (layerType === "background") {
        pushMediaInput(args, filepath, {
          loop: true,
          loopStillImage: true,
        });
        studioBackgroundOverlayInputs.push({
          inputIndex: nextInputIndex,
          height: canvasHeight,
          startSeconds,
          endSeconds,
        });
        nextInputIndex += 1;
        continue;
      }

      if (!["screenshot", "image", "cover"].includes(layerType)) continue;

      const element =
        (clip.elementId ? elementById.get(clip.elementId) : null) ??
        (fallbackElementsByType.get(layerType) ?? [])[0];
      if (!element) continue;
      const dimensions = await getMediaDimensions(filepath).catch(() => ({
        width: canvasWidth,
        height: canvasHeight,
      }));

      pushMediaInput(args, filepath, {
        loop: true,
        loopStillImage: true,
      });
      studioMediaOverlayInputs.push({
        element,
        inputIndex: nextInputIndex,
        width: dimensions.width,
        height: dimensions.height,
        startSeconds,
        endSeconds,
      });
      nextInputIndex += 1;
    }
  }

  const sceneVisualOverlayInputs: SceneVisualOverlayInput[] = [];

  for (const sceneVisual of sceneVisualTimeline) {
    if (!(await fileExists(sceneVisual.filepath))) continue;
    const dimensions = await getMediaDimensions(sceneVisual.filepath).catch(() => ({
      width: canvasWidth,
      height: canvasHeight,
    }));

    pushMediaInput(args, sceneVisual.filepath, {
      loop: true,
      loopStillImage: true,
    });
    sceneVisualOverlayInputs.push({
      element: sceneVisual.element ?? null,
      inputIndex: nextInputIndex,
      height: dimensions.height,
      filepath: sceneVisual.filepath,
      width: dimensions.width,
      startSeconds: sceneVisual.startSeconds,
      endSeconds: sceneVisual.endSeconds,
    });
    nextInputIndex += 1;
  }

  const audioInputIndex = job.audio_filepath ? nextInputIndex : null;

  if (job.audio_filepath) {
    if (job.audio_start_offset_seconds && job.audio_start_offset_seconds > 0) {
      args.push("-ss", String(job.audio_start_offset_seconds));
    }
    args.push("-i", job.audio_filepath);
  }

  const composedOutputLabel = "vcomposed";
  const mainFilterComplex = buildImageTextFilterComplex({
    backgroundColorMetadata,
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
    sceneVisualOverlays: sceneVisualOverlayInputs,
    studioBackgroundOverlays: studioBackgroundOverlayInputs,
    studioMediaOverlays: studioMediaOverlayInputs,
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
    mediaDimensionsByElementId: studioMediaDimensionsByElementId,
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
    outputLabel: composedOutputLabel,
  });

  const filterComplex = [
    mainFilterComplex,
    `[${composedOutputLabel}]scale=${canvasWidth}:${canvasHeight}:flags=lanczos:in_range=${outputColorRange}:out_range=${outputColorRange}:out_color_matrix=${outputColorSpace},setsar=1,format=yuv420p[vout]`,
  ].join(";");

  args.push(
    "-filter_complex_threads",
    "1",
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
    "-vsync",
    "cfr",
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-profile:v",
    "high",
    "-level:v",
    "4.1",
    "-x264-params",
    "keyint=60:min-keyint=60:scenecut=0:open-gop=0",
    "-b:v",
    outputVideoBitrate,
    "-maxrate",
    outputVideoMaxrate,
    "-bufsize",
    outputVideoBufsize,
    "-pix_fmt",
    "yuv420p",
    "-colorspace",
    outputColorSpace,
    "-color_primaries",
    outputColorSpace,
    "-color_trc",
    outputColorSpace,
    "-color_range",
    outputColorRange,
    "-movflags",
    "+faststart",
    outputFilepath,
  );

  try {
    console.log("Render job inputs:", {
      jobId: job.id,
      background: job.background_filepath,
      backgroundColorMetadata,
      toneMapBackground: isHdrVideo(backgroundColorMetadata),
      screenshot: preparedScreenshot.filepath,
      originalScreenshot: job.screenshot_filepath,
      screenshotDimensions,
      audio: job.audio_filepath,
      thumbnail: null,
      output: outputFilepath,
      renderDurationSeconds,
      thumbnailIntroDuration: null,
      hookOverlay,
      timedHookOverlays: timedHookOverlayEntries.map((entry) => entry.overlay),
      sceneVisualOverlayInputs,
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

    await runCommand(ffmpegBinary, args, { all: true });

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
        ...timedHookOverlayEntries.map((entry) => entry.overlay.filepath),
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
