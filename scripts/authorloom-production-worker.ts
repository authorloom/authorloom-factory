import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { google } from "googleapis";

import {
  createAuthor,
  createBook,
  createCampaign,
  createRenderBatch,
  getCampaign,
  getDatabase,
  getRenderJobDetails,
  initializeDatabase,
  listAuthors,
  listBooksByAuthor,
  listCampaigns,
  listRenderBatchesByCampaign,
} from "../src/lib/db";
import { renderJob } from "../src/lib/ffmpeg";
import { env } from "../src/lib/env";
import { getGoogleServiceAccountAuth } from "../src/lib/google-auth";
import { paths } from "../src/lib/paths";
import { slugifyCampaignName, slugifyName } from "../src/lib/slugs";

const api = anyApi;
type Id<TableName extends string> = string & { __tableName?: TableName };

const once = process.argv.includes("--once");
const pollMs = Number(process.env.AUTHORLOOM_WORKER_POLL_MS ?? 15_000);
const workerMode = process.env.AUTHORLOOM_WORKER_MODE?.trim() ?? "poll";
const taskOnlyMode = workerMode === "tasks";
const healthPort = process.env.PORT ? Number(process.env.PORT) : null;
const workerId =
  process.env.AUTHORLOOM_WORKER_ID?.trim() ||
  `authorloom-factory-${process.env.K_REVISION ?? "local"}-${process.env.HOSTNAME ?? randomUUID()}`;
const workerSecret = process.env.AUTHORLOOM_WORKER_SECRET?.trim();
const convexUrl =
  process.env.AUTHORLOOM_CONVEX_URL?.trim() ||
  process.env.NEXT_PUBLIC_CONVEX_URL?.trim() ||
  process.env.CONVEX_URL?.trim();
const authorloomAppUrl =
  process.env.AUTHORLOOM_APP_URL?.trim() ||
  process.env.NEXT_PUBLIC_APP_URL?.trim() ||
  "https://app.authorloom.com";
const scalerSecret = process.env.AUTHORLOOM_SCALER_SECRET?.trim();
const scalerProjectId =
  process.env.AUTHORLOOM_SCALER_PROJECT_ID?.trim() ||
  process.env.GOOGLE_PROJECT_ID?.trim() ||
  process.env.GOOGLE_CLOUD_PROJECT?.trim() ||
  process.env.GCLOUD_PROJECT?.trim();
const scalerRegion =
  process.env.AUTHORLOOM_SCALER_REGION?.trim() ||
  process.env.GOOGLE_CLOUD_RUN_REGION?.trim() ||
  process.env.CLOUD_RUN_REGION?.trim();
const scalerService =
  process.env.AUTHORLOOM_SCALER_SERVICE?.trim() ||
  process.env.K_SERVICE?.trim();
const scalerMaxInstances = Math.max(
  1,
  Number(process.env.AUTHORLOOM_SCALER_MAX_INSTANCES ?? 28),
);
const scalerTargetJobsPerInstance = Math.max(
  1,
  Number(process.env.AUTHORLOOM_SCALER_TARGET_JOBS_PER_INSTANCE ?? 2),
);
const taskSecret = process.env.AUTHORLOOM_TASK_SECRET?.trim();
let healthServer: http.Server | null = null;

if (!convexUrl) {
  throw new Error(
    "Set AUTHORLOOM_CONVEX_URL or NEXT_PUBLIC_CONVEX_URL for the Authorloom worker.",
  );
}

if (!workerSecret) {
  throw new Error("Set AUTHORLOOM_WORKER_SECRET for the Authorloom worker.");
}

const client = new ConvexHttpClient(convexUrl);
const requiredWorkerSecret = workerSecret;
let lastTickAt: string | null = null;
let lastClaimedJobId: string | null = null;
const convexErrorMessageLimit = 1_200;
const convexErrorListLimit = 50;
const sourceDownloadAttempts = 3;

type ClaimedJob = {
  job: {
    id: Id<"productionJobs">;
    type: string;
  };
  campaign?: {
    id: Id<"campaigns">;
  } | null;
  campaignId?: Id<"campaigns"> | null;
  input?: unknown;
};

type RenderTaskRequest = {
  productionJobId?: string;
  idempotencyKey?: string;
};

function compactText(value: string, limit = convexErrorMessageLimit) {
  const normalized = value.replace(/\s+/g, " ").trim();

  if (normalized.length <= limit) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, limit - 12)).trimEnd()}... [truncated]`;
}

function compactErrorMessage(error: unknown) {
  return compactText(
    error instanceof Error ? error.message : "Unknown render failure.",
  );
}

function compactErrorList(errors: string[]) {
  return errors.slice(0, convexErrorListLimit).map((error) => compactText(error));
}

function shouldRetryStatus(status: number) {
  return (
    status === 408 ||
    status === 409 ||
    status === 425 ||
    status === 429 ||
    status >= 500
  );
}

function retryDelayMs(attempt: number) {
  return Math.min(4_000, 500 * 2 ** Math.max(0, attempt - 1));
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetries(
  url: string,
  init: RequestInit,
  context: string,
) {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= sourceDownloadAttempts; attempt += 1) {
    try {
      const response = await fetch(url, init);

      if (
        response.ok ||
        !shouldRetryStatus(response.status) ||
        attempt === sourceDownloadAttempts
      ) {
        return response;
      }

      const body = await response.text().catch(() => "");
      lastError = new Error(
        `${context}: ${response.status} ${response.statusText} ${body.slice(0, 300)}`,
      );
      console.warn(
        `${context} attempt ${attempt}/${sourceDownloadAttempts} returned ${response.status}; retrying.`,
      );
    } catch (error) {
      lastError = error;

      if (attempt === sourceDownloadAttempts) {
        throw error;
      }

      console.warn(
        `${context} attempt ${attempt}/${sourceDownloadAttempts} failed: ${compactErrorMessage(error)}; retrying.`,
      );
    }

    await sleep(retryDelayMs(attempt));
  }

  throw lastError instanceof Error ? lastError : new Error(`${context} failed.`);
}

type RenderAssetRef = {
  assetId: string;
  type: string;
  filename?: string | null;
  driveFileId?: string | null;
  driveUrl?: string | null;
  previewUrl?: string | null;
  renderSourceUrl?: string | null;
  renderSourceMimeType?: string | null;
  sourceMediaId?: string | null;
  previewMediaId?: string | null;
  thumbnailMediaId?: string | null;
  renderSourceMediaId?: string | null;
  audioUrl?: string | null;
  text?: string | null;
};

type RenderInstruction = {
  videoOutputId: Id<"videoOutputs">;
  postType?: "video_post" | "scenes_video_post" | "tiktok_slides_post" | "instagram_carousel_post" | null;
  forceRerender?: boolean | null;
  fingerprint: string;
  campaignId?: string | null;
  batchId?: string | null;
  channelId?: string | null;
  bookId: string;
  layoutId: string;
  screenshotAssetId: string;
  hookAssetId: string;
  backgroundAssetId: string;
  audioAssetId?: string | null;
  audioTrackId?: string | null;
  thumbnailAssetId?: string | null;
  assets: {
    screenshot: RenderAssetRef;
    hook: RenderAssetRef;
    background: RenderAssetRef;
    audio?: RenderAssetRef | null;
    thumbnail?: RenderAssetRef | null;
    cta?: RenderAssetRef | null;
    tropes?: RenderAssetRef[] | null;
    intro?: RenderAssetRef | null;
    outro?: RenderAssetRef | null;
  };
  renderOptions?: {
    postType?: "video_post" | "scenes_video_post" | "tiktok_slides_post" | "instagram_carousel_post" | null;
    durationSeconds?: number | null;
    audioStartOffsetSeconds?: number | null;
    thumbnailIntroSeconds?: number | null;
    backgroundStartTime?: number | null;
    backgroundEndTime?: number | null;
    playbackSpeed?: number | null;
    screenshotPlacement?: string | null;
    screenshotScale?: number | null;
    zoomLevel?: number | null;
    cropVariant?: string | null;
    layoutTemplate?: string | null;
    layoutTemplateId?: string | null;
    layoutTemplateJson?: unknown;
    layoutStudioAssets?: unknown;
    timelineVideoPost?: unknown;
    multiHookTexts?: string[] | null;
    postCopy?: {
      caption?: string | null;
      hashtags?: string[];
      keywords?: string[];
      keywordOrder?: string[];
      keywordCategories?: string[];
      ctaText?: string | null;
      tropes?: string[];
      renderedBookTitleLine?: string | null;
      metadataTemplateId?: string | null;
    };
    sceneVideoPost?: unknown;
  };
  postCopy?: {
    caption?: string | null;
    hashtags?: string[];
    keywords?: string[];
    keywordOrder?: string[];
    keywordCategories?: string[];
    ctaText?: string | null;
    tropes?: string[];
    renderedBookTitleLine?: string | null;
    metadataTemplateId?: string | null;
  };
  creativeSignature?: string;
  diversityScore?: number;
  diversityReasonCodes?: string[];
  safeAreaWarnings?: unknown[];
  readinessWarnings?: string[];
  variationParameters?: unknown;
  outputFilename?: string | null;
};

type RenderCampaignInput = {
  version?: string;
  productionJobId?: string | null;
  campaignId?: string;
  author?: {
    id?: string;
    name?: string;
    slug?: string | null;
    driveFolderId?: string | null;
    driveFolderUrl?: string | null;
  } | null;
  book?: {
    id?: string;
    title?: string;
    slug?: string | null;
    driveFolderId?: string | null;
    driveFolderUrl?: string | null;
  } | null;
  campaign?: {
    id?: string;
    name?: string;
    slug?: string | null;
  } | null;
  channel?: {
    id?: string;
    platform?: string;
    exportLabel?: string;
    handle?: string | null;
  } | null;
  layout?: {
    layoutId?: string;
    name?: string;
  };
  videos?: RenderInstruction[];
};

type QueueStatsResult = {
  success: boolean;
  message?: string;
  active?: number;
  counts?: {
    queued: number;
    claimed: number;
    running: number;
    waiting: number;
    failed: number;
  };
  checkedAt?: number;
};

function renderInstructions(input: unknown): RenderInstruction[] {
  if (!input || typeof input !== "object") {
    return [];
  }

  const maybeVideos = (input as { videos?: unknown }).videos;
  return Array.isArray(maybeVideos) ? (maybeVideos as RenderInstruction[]) : [];
}

function renderCampaignInput(input: unknown): RenderCampaignInput {
  return input && typeof input === "object" ? (input as RenderCampaignInput) : {};
}

function targetInstancesForQueueDepth(activeJobs: number) {
  if (activeJobs <= 0) return 1;
  return Math.min(
    scalerMaxInstances,
    Math.max(1, Math.ceil(activeJobs / scalerTargetJobsPerInstance)),
  );
}

async function cloudRunAccessToken() {
  const auth = new google.auth.GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  const accessToken = typeof token === "string" ? token : token?.token;

  if (!accessToken) {
    throw new Error("Could not obtain Google Cloud access token for scaler.");
  }

  return accessToken;
}

async function getCloudRunService(accessToken: string) {
  if (!scalerProjectId || !scalerRegion || !scalerService) {
    throw new Error(
      "Scaler requires AUTHORLOOM_SCALER_PROJECT_ID/GOOGLE_PROJECT_ID, AUTHORLOOM_SCALER_REGION, and AUTHORLOOM_SCALER_SERVICE/K_SERVICE.",
    );
  }

  const serviceName = `projects/${scalerProjectId}/locations/${scalerRegion}/services/${scalerService}`;
  const response = await fetch(`https://run.googleapis.com/v2/${serviceName}`, {
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Could not read Cloud Run service ${serviceName}: ${response.status} ${await response.text()}`,
    );
  }

  return {
    serviceName,
    service: (await response.json()) as {
      template?: {
        scaling?: {
          minInstanceCount?: number | string;
          maxInstanceCount?: number | string;
        };
      };
    },
  };
}

async function patchCloudRunScaling(input: {
  serviceName: string;
  accessToken: string;
  minInstances: number;
  maxInstances: number;
}) {
  const updateMask = [
    "template.scaling.minInstanceCount",
    "template.scaling.maxInstanceCount",
  ].join(",");
  const response = await fetch(
    `https://run.googleapis.com/v2/${input.serviceName}?updateMask=${encodeURIComponent(updateMask)}`,
    {
      method: "PATCH",
      headers: {
        authorization: `Bearer ${input.accessToken}`,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        template: {
          scaling: {
            minInstanceCount: input.minInstances,
            maxInstanceCount: input.maxInstances,
          },
        },
      }),
    },
  );

  if (!response.ok) {
    throw new Error(
      `Could not update Cloud Run scaling for ${input.serviceName}: ${response.status} ${await response.text()}`,
    );
  }
}

async function runScaleCheck() {
  const stats = (await client.query(api.productionJobs.workerQueueStats, {
    workerSecret: requiredWorkerSecret,
    types: ["render_campaign_videos"],
  })) as QueueStatsResult;

  if (!stats.success) {
    throw new Error(stats.message ?? "Could not read Authorloom queue stats.");
  }

  const activeJobs = stats.active ?? 0;
  const targetMinInstances = Math.min(
    scalerMaxInstances,
    targetInstancesForQueueDepth(activeJobs),
  );
  const targetMaxInstances = Math.max(scalerMaxInstances, targetMinInstances);
  const accessToken = await cloudRunAccessToken();
  const { serviceName, service } = await getCloudRunService(accessToken);
  const currentMin = Number(service.template?.scaling?.minInstanceCount ?? 0);
  const currentMax = Number(service.template?.scaling?.maxInstanceCount ?? 0);

  if (currentMin !== targetMinInstances || currentMax !== targetMaxInstances) {
    await patchCloudRunScaling({
      serviceName,
      accessToken,
      minInstances: targetMinInstances,
      maxInstances: targetMaxInstances,
    });
  }

  return {
    ok: true,
    activeJobs,
    counts: stats.counts,
    targetMinInstances,
    targetMaxInstances,
    currentMin,
    currentMax,
    changed: currentMin !== targetMinInstances || currentMax !== targetMaxInstances,
  };
}

function validateRenderInstruction(input: {
  video: RenderInstruction;
  index: number;
  campaignId?: string | null;
}) {
  const errors: string[] = [];
  const prefix = `videos[${input.index}]`;
  const video = input.video;

  if (!video.videoOutputId) errors.push(`${prefix}.videoOutputId is required.`);
  if (!video.fingerprint) errors.push(`${prefix}.fingerprint is required.`);
  if (!video.campaignId && !input.campaignId) {
    errors.push(`${prefix}.campaignId is required.`);
  }
  if (!video.batchId) {
    console.warn(`${prefix}.batchId is missing; using the local campaign batch fallback.`);
  }
  if (!video.channelId) {
    console.warn(`${prefix}.channelId is missing; render will continue without channel metadata.`);
  }
  if (!video.bookId) errors.push(`${prefix}.bookId is required.`);
  if (!video.layoutId) errors.push(`${prefix}.layoutId is required.`);
  if (!video.screenshotAssetId) {
    errors.push(`${prefix}.screenshotAssetId is required.`);
  }
  if (!video.backgroundAssetId) {
    errors.push(`${prefix}.backgroundAssetId is required.`);
  }
  if (!video.hookAssetId) errors.push(`${prefix}.hookAssetId is required.`);
  const screenshotSourceUrl =
    video.assets?.screenshot?.renderSourceUrl ??
    video.assets?.screenshot?.previewUrl ??
    null;
  const backgroundSourceUrl =
    video.assets?.background?.renderSourceUrl ??
    video.assets?.background?.previewUrl ??
    null;

  if (!screenshotSourceUrl) {
    errors.push(
      `${prefix}.assets.screenshot.renderSourceUrl or previewUrl is required.`,
    );
  }
  if (!backgroundSourceUrl) {
    errors.push(
      `${prefix}.assets.background.renderSourceUrl or previewUrl is required.`,
    );
  }
  if (!video.assets?.hook?.text?.trim()) {
    errors.push(`${prefix}.assets.hook.text is required.`);
  }
  const audioSourceUrl =
    video.assets.audio?.audioUrl ??
    video.assets.audio?.renderSourceUrl ??
    video.assets.audio?.previewUrl ??
    null;
  if ((video.audioAssetId || video.audioTrackId) && !audioSourceUrl) {
    errors.push(
      `${prefix}.assets.audio.renderSourceUrl, audioUrl, or previewUrl is required when an audio asset is set.`,
    );
  }
  if (!video.outputFilename?.trim()) {
    console.warn(`${prefix}.outputFilename is missing; the factory upload step will use the local render filename.`);
  }

  const options = video.renderOptions;
  if (!options) {
    errors.push(`${prefix}.renderOptions is required.`);
    return errors;
  }

  if (!positiveNumber(options.durationSeconds)) {
    errors.push(`${prefix}.renderOptions.durationSeconds must be greater than 0.`);
  }
  if (!nonNegativeNumber(options.audioStartOffsetSeconds)) {
    errors.push(`${prefix}.renderOptions.audioStartOffsetSeconds must be 0 or greater.`);
  }
  if (!nonNegativeNumber(options.backgroundStartTime)) {
    errors.push(`${prefix}.renderOptions.backgroundStartTime must be 0 or greater.`);
  }
  if (!positiveNumber(options.backgroundEndTime)) {
    errors.push(`${prefix}.renderOptions.backgroundEndTime must be greater than 0.`);
  }
  if (
    typeof options.backgroundStartTime === "number" &&
    typeof options.backgroundEndTime === "number" &&
    options.backgroundEndTime <= options.backgroundStartTime
  ) {
    errors.push(`${prefix}.renderOptions.backgroundEndTime must be after backgroundStartTime.`);
  }
  if (!positiveNumber(options.playbackSpeed)) {
    errors.push(`${prefix}.renderOptions.playbackSpeed must be greater than 0.`);
  }
  if (!positiveNumber(options.screenshotScale)) {
    errors.push(`${prefix}.renderOptions.screenshotScale must be greater than 0.`);
  }
  if (!positiveNumber(options.zoomLevel)) {
    errors.push(`${prefix}.renderOptions.zoomLevel must be greater than 0.`);
  }
  if (!options.screenshotPlacement?.trim()) {
    errors.push(`${prefix}.renderOptions.screenshotPlacement is required.`);
  }
  if (!options.cropVariant?.trim()) {
    errors.push(`${prefix}.renderOptions.cropVariant is required.`);
  }
  if (options.layoutTemplate === "booktok_full_background_multi_hook") {
    const multiHookTexts = Array.isArray(options.multiHookTexts)
      ? options.multiHookTexts.filter((text) => Boolean(text?.trim()))
      : [];

    if (multiHookTexts.length === 0) {
      errors.push(`${prefix}.renderOptions.multiHookTexts is required for full-background multi-hook layouts.`);
    }
    if (
      typeof options.durationSeconds === "number" &&
      options.durationSeconds < multiHookTexts.length * 3
    ) {
      errors.push(
        `${prefix}.renderOptions.durationSeconds must be at least 3 seconds per hook for full-background multi-hook layouts.`,
      );
    }
  }

  return errors;
}

function positiveNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function nonNegativeNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function safeFilename(value: string | null | undefined, fallback: string) {
  const name = value?.trim() || fallback;
  return name.replace(/[/:\\?%*"<>|]/g, "-");
}

function resolveSourceUrl(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  try {
    return new URL(value, authorloomAppUrl).toString();
  } catch {
    return value;
  }
}

function sourceRequestHeaders(url: string) {
  const headers: Record<string, string> = {};

  try {
    const parsed = new URL(url);
    const appOrigin = new URL(authorloomAppUrl).origin;

    if (parsed.origin === appOrigin) {
      headers.Authorization = `Bearer ${requiredWorkerSecret}`;
    }
  } catch {
    // Leave non-standard URLs alone; fetch will surface the actual issue.
  }

  return headers;
}

function getPreviewBucketName() {
  return env.AUTHORLOOM_PREVIEW_BUCKET ?? env.GOOGLE_CLOUD_STORAGE_BUCKET ?? null;
}

function getPreviewObjectPrefix() {
  return (
    env.AUTHORLOOM_PREVIEW_OBJECT_PREFIX ??
    env.GOOGLE_CLOUD_STORAGE_PREFIX ??
    "authorloom-previews"
  )
    .trim()
    .replace(/^\/+|\/+$/g, "");
}

function previewObjectName(objectPath: string) {
  return [getPreviewObjectPrefix(), objectPath.replace(/^\/+/g, "")]
    .filter(Boolean)
    .join("/");
}

function previewPublicUrl(objectName: string) {
  const encodedObjectName = objectName
    .split("/")
    .map(encodeURIComponent)
    .join("/");

  return `${authorloomAppUrl.replace(/\/+$/g, "")}/api/previews/${encodedObjectName}`;
}

function authHeadersToRecord(headers: Headers | Record<string, string>) {
  return Object.fromEntries(new Headers(headers as HeadersInit).entries());
}

function getPreviewObjectNameFromUrl(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  try {
    const parsed = new URL(value, authorloomAppUrl);
    const marker = "/api/previews/";
    const markerIndex = parsed.pathname.indexOf(marker);

    if (markerIndex < 0) {
      return null;
    }

    const objectName = decodeURIComponent(parsed.pathname.slice(markerIndex + marker.length));
    const bucketName = getPreviewBucketName();

    if (bucketName && objectName.startsWith(`${bucketName}/`)) {
      return null;
    }

    return objectName;
  } catch {
    return null;
  }
}

function getStorageObjectNameFromUrl(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const bucketName = getPreviewBucketName();

  if (!bucketName) {
    return null;
  }

  try {
    const parsed = new URL(value);

    if (parsed.hostname === "storage.googleapis.com") {
      const parts = parsed.pathname.split("/").filter(Boolean);

      if (parts[0] === bucketName && parts.length > 1) {
        return decodeURIComponent(parts.slice(1).join("/"));
      }
    }

    if (
      parsed.hostname === `${bucketName}.storage.googleapis.com` &&
      parsed.pathname.length > 1
    ) {
      return decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
    }
  } catch {
    return null;
  }

  return null;
}

async function downloadPreviewObjectFromStorage(
  objectName: string,
  filepath: string,
) {
  const bucketName = getPreviewBucketName();

  if (!bucketName) {
    throw new Error(
      "AUTHORLOOM_PREVIEW_BUCKET or GOOGLE_CLOUD_STORAGE_BUCKET is required to read render source objects directly from Cloud Storage.",
    );
  }

  await downloadStorageObjectFromBucket(bucketName, objectName, filepath);
}

async function downloadStorageObjectFromBucket(
  bucketName: string,
  objectName: string,
  filepath: string,
) {
  const url = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(
    bucketName,
  )}/o/${encodeURIComponent(objectName)}?alt=media`;
  const auth = getGoogleServiceAccountAuth({ impersonateWorkspace: false });
  const headers = await auth.getRequestHeaders(url);
  const response = await fetchWithRetries(
    url,
    { headers: headers as HeadersInit },
    `Download Cloud Storage render source ${objectName}`,
  );

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Could not download Cloud Storage render source ${bucketName}/${objectName}: ${response.status} ${response.statusText} ${body.slice(
        0,
        300,
      )}`,
    );
  }

  await fs.writeFile(filepath, Buffer.from(await response.arrayBuffer()));
}

async function uploadRenderedPreviewToStorage(input: {
  filepath: string;
  campaignId?: string | null;
  videoOutputId: string;
  outputFilename?: string | null;
}) {
  const bucketName = getPreviewBucketName();

  if (!bucketName) {
    throw new Error(
      "AUTHORLOOM_PREVIEW_BUCKET or GOOGLE_CLOUD_STORAGE_BUCKET is not configured; rendered output cannot be staged to GCS.",
    );
  }

  const objectName = previewObjectName(
    [
      "rendered-videos",
      input.campaignId ?? "uncategorized",
      input.videoOutputId,
      safeFilename(input.outputFilename, `${input.videoOutputId}.mp4`),
    ].join("/"),
  );
  const mediaUrl = `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(
    bucketName,
  )}/o?uploadType=media&name=${encodeURIComponent(objectName)}`;
  const auth = getGoogleServiceAccountAuth({ impersonateWorkspace: false });
  const mediaHeaders = await auth.getRequestHeaders(mediaUrl);
  const buffer = await fs.readFile(input.filepath);
  const contentType =
    path.extname(input.filepath).toLowerCase() === ".zip"
      ? "application/zip"
      : "video/mp4";
  const mediaResponse = await fetch(mediaUrl, {
    method: "POST",
    headers: {
      ...authHeadersToRecord(mediaHeaders),
      "content-type": contentType,
      "content-length": String(buffer.length),
    },
    body: new Uint8Array(buffer),
  });

  if (!mediaResponse.ok && mediaResponse.status !== 409) {
    const body = await mediaResponse.text().catch(() => "");
    throw new Error(
      `Could not upload rendered preview ${objectName} to Cloud Storage: ${mediaResponse.status} ${body.slice(
        0,
        300,
      )}`,
    );
  }

  return {
    objectName,
    previewUrl: previewPublicUrl(objectName),
  };
}

async function ensureSourceFileDownloaded(input: {
  asset?: RenderAssetRef | null;
  sourceUrl?: string | null;
  filename?: string | null;
  directory: string;
  fallbackFilename: string;
}) {
  const mediaSource = input.asset ? await resolveMediaSource(input.asset) : null;

  if (!input.sourceUrl && !mediaSource) {
    throw new Error(`${input.fallbackFilename} is missing a GCS render source URL.`);
  }

  await fs.mkdir(input.directory, { recursive: true });
  const filename = safeFilename(
    input.filename ?? mediaSource?.filename,
    input.fallbackFilename,
  );
  const filepath = path.join(input.directory, filename);

  try {
    await fs.access(filepath);
    console.log(`Source asset already cached: ${filepath}`);
    return filepath;
  } catch {
    const sourceLabel = mediaSource
      ? `${mediaSource.bucketName}/${mediaSource.objectName}`
      : input.sourceUrl;

    console.log(`Downloading source asset ${sourceLabel} -> ${filepath}`);

    if (mediaSource) {
      await downloadStorageObjectFromBucket(
        mediaSource.bucketName,
        mediaSource.objectName,
        filepath,
      );
      console.log(`Source asset downloaded: ${filepath}`);
      return filepath;
    }

    const sourceUrl = input.sourceUrl;

    if (!sourceUrl) {
      throw new Error(`${input.fallbackFilename} is missing a GCS render source URL.`);
    }

    const previewObjectName =
      getPreviewObjectNameFromUrl(sourceUrl) ??
      getStorageObjectNameFromUrl(sourceUrl);

    if (previewObjectName) {
      await downloadPreviewObjectFromStorage(previewObjectName, filepath);
    } else {
      const response = await fetchWithRetries(
        sourceUrl,
        {
          headers: sourceRequestHeaders(sourceUrl),
        },
        `Download source asset ${sourceUrl}`,
      );
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(
          `Could not download source asset from ${sourceUrl}: ${response.status} ${response.statusText} ${body.slice(
            0,
            300,
          )}`,
        );
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      await fs.writeFile(filepath, buffer);
    }
    console.log(`Source asset downloaded: ${filepath}`);
    return filepath;
  }
}

function mediaIdForAsset(asset: RenderAssetRef) {
  if (asset.type === "background") {
    return (
      asset.renderSourceMediaId ??
      asset.sourceMediaId ??
      asset.previewMediaId ??
      asset.thumbnailMediaId ??
      null
    );
  }

  return (
    asset.renderSourceMediaId ??
    asset.sourceMediaId ??
    asset.previewMediaId ??
    asset.thumbnailMediaId ??
    null
  );
}

async function resolveMediaSource(asset: RenderAssetRef) {
  const mediaId = mediaIdForAsset(asset);

  if (!mediaId) {
    return null;
  }

  const result = await client.query(api.productionJobs.workerMediaSource, {
    workerSecret: requiredWorkerSecret,
    mediaId,
  }) as {
    success: boolean;
    message?: string;
    media?: {
      bucketName?: string | null;
      objectName?: string | null;
      filename?: string | null;
    } | null;
  };

  if (!result.success || !result.media?.bucketName || !result.media.objectName) {
    throw new Error(
      result.message ?? `Could not resolve media source ${mediaId} for production render.`,
    );
  }

  return {
    bucketName: result.media.bucketName,
    objectName: result.media.objectName,
    filename: result.media.filename ?? asset.filename ?? null,
  };
}

function ensureLocalAuthor(input: RenderCampaignInput) {
  const authorName = input.author?.name?.trim() || "Authorloom Author";
  const authorSlug = input.author?.slug?.trim() || slugifyName(authorName);
  const existing = listAuthors().find(
    (author) => author.slug === authorSlug || author.name === authorName,
  );

  if (existing) {
    return existing;
  }

  const authorId = createAuthor({ name: authorName });
  const author = listAuthors().find((item) => item.id === authorId);

  if (!author) {
    throw new Error("Could not create local Authorloom author.");
  }

  return author;
}

function ensureLocalBook(input: RenderCampaignInput, authorId: string) {
  const title = input.book?.title?.trim() || "Authorloom Book";
  const slug = input.book?.slug?.trim() || slugifyName(title);
  const existing = listBooksByAuthor(authorId).find(
    (book) => book.slug === slug || book.title === title,
  );

  if (existing) {
    return existing;
  }

  const bookId = createBook({
    authorId,
    slug,
    title,
    driveFolderId: input.book?.driveFolderId ?? null,
    driveFolderUrl: input.book?.driveFolderUrl ?? null,
  });
  const book = listBooksByAuthor(authorId).find((item) => item.id === bookId);

  if (!book) {
    throw new Error("Could not create local Authorloom book.");
  }

  return book;
}

function ensureLocalCampaign(input: RenderCampaignInput, bookId: string) {
  const name =
    input.campaign?.name?.trim() ||
    (input.campaignId ? `Authorloom ${input.campaignId}` : "Authorloom Batch");
  const slug =
    input.campaign?.slug?.trim() ||
    (input.campaignId ? slugifyCampaignName(input.campaignId) : slugifyCampaignName(name));
  const existing = listCampaigns().find(
    (campaign) => campaign.book_id === bookId && campaign.slug === slug,
  );

  if (existing) {
    return existing;
  }

  const campaignId = createCampaign({
    name,
    slug,
    bookId,
    layoutId: factoryLayoutId(input.layout?.layoutId),
  });
  const campaign = getCampaign(campaignId);

  if (!campaign) {
    throw new Error("Could not create local Authorloom campaign.");
  }

  return campaign;
}

function ensureLocalBatch(campaignId: string, input: RenderCampaignInput) {
  const name = `Authorloom production ${new Date().toISOString().slice(0, 10)}`;
  const existing = listRenderBatchesByCampaign(campaignId)[0];

  if (existing) {
    return existing;
  }

  const batchId = createRenderBatch({
    campaignId,
    name,
    layoutId: factoryLayoutId(input.layout?.layoutId),
    status: "draft",
  });
  const batch = listRenderBatchesByCampaign(campaignId).find(
    (item) => item.id === batchId,
  );

  if (!batch) {
    throw new Error("Could not create local Authorloom render batch.");
  }

  return batch;
}

function factoryLayoutId(layoutId: string | null | undefined) {
  switch (layoutId) {
    case "booktok_text_screenshot":
    case "left_cover_center_screenshot":
    case "left_cover_offset_screenshot":
    case "booktok_compact_screenshot":
    case "booktok_full_background_multi_hook":
    case undefined:
    case null:
      return "default_video_layout";
    default:
      return layoutId;
  }
}

function findLocalBookAsset(input: {
  table: string;
  idColumn?: string;
  bookId: string;
  googleFileId?: string | null;
}) {
  const db = getDatabase();
  initializeDatabase(db);

  if (!input.googleFileId) {
    return null;
  }

  return db
    .prepare(
      `
        SELECT id
        FROM ${input.table}
        WHERE book_id = ?
          AND google_file_id = ?
        LIMIT 1
      `,
    )
    .get(input.bookId, input.googleFileId) as { id: string } | undefined;
}

function ensureBookScreenshot(input: {
  bookId: string;
  asset: RenderAssetRef;
  filepath: string;
}) {
  const existing = findLocalBookAsset({
    table: "book_screenshots",
    bookId: input.bookId,
    googleFileId: input.asset.driveFileId,
  });

  if (existing) return existing.id;

  const db = getDatabase();
  initializeDatabase(db);
  const id = `al-${input.asset.assetId}`;

  db.prepare(
    `
      INSERT OR IGNORE INTO book_screenshots (
        id, book_id, google_file_id, source_url, filename, filepath, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, unixepoch())
    `,
  ).run(
    id,
    input.bookId,
    input.asset.driveFileId ?? null,
    input.asset.driveUrl ?? null,
    input.asset.filename ?? path.basename(input.filepath),
    input.filepath,
  );

  return id;
}

function ensureBookBackground(input: {
  bookId: string;
  asset: RenderAssetRef;
  filepath: string;
}) {
  const existing = findLocalBookAsset({
    table: "book_backgrounds",
    bookId: input.bookId,
    googleFileId: input.asset.driveFileId,
  });

  if (existing) return existing.id;

  const db = getDatabase();
  initializeDatabase(db);
  const id = `al-${input.asset.assetId}`;

  db.prepare(
    `
      INSERT OR IGNORE INTO book_backgrounds (
        id, book_id, google_file_id, filename, filepath, duration_seconds, created_at
      )
      VALUES (?, ?, ?, ?, ?, NULL, unixepoch())
    `,
  ).run(
    id,
    input.bookId,
    input.asset.driveFileId ?? null,
    input.asset.filename ?? path.basename(input.filepath),
    input.filepath,
  );

  return id;
}

function ensureBookThumbnail(input: {
  bookId: string;
  asset: RenderAssetRef;
  filepath: string;
}) {
  const existing = findLocalBookAsset({
    table: "book_thumbnails",
    bookId: input.bookId,
    googleFileId: input.asset.driveFileId,
  });

  if (existing) return existing.id;

  const db = getDatabase();
  initializeDatabase(db);
  const id = `al-${input.asset.assetId}`;

  db.prepare(
    `
      INSERT OR IGNORE INTO book_thumbnails (
        id, book_id, google_file_id, filename, filepath, drive_url, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, unixepoch())
    `,
  ).run(
    id,
    input.bookId,
    input.asset.driveFileId ?? null,
    input.asset.filename ?? path.basename(input.filepath),
    input.filepath,
    input.asset.driveUrl ?? null,
  );

  return id;
}

function ensureBookHook(input: {
  bookId: string;
  screenshotId: string;
  asset: RenderAssetRef;
}) {
  const db = getDatabase();
  initializeDatabase(db);
  const text = input.asset.text?.trim() || "Authorloom hook";
  const existing = db
    .prepare(
      `
        SELECT id
        FROM book_hooks
        WHERE book_id = ?
          AND screenshot_id = ?
          AND text = ?
        LIMIT 1
      `,
    )
    .get(input.bookId, input.screenshotId, text) as { id: string } | undefined;

  if (existing) return existing.id;

  const id = `al-${input.asset.assetId}`;
  db.prepare(
    `
      INSERT OR IGNORE INTO book_hooks (
        id, book_id, screenshot_id, text, source_row_number, created_at
      )
      VALUES (?, ?, ?, ?, NULL, unixepoch())
    `,
  ).run(id, input.bookId, input.screenshotId, text);

  return id;
}

function ensureAudioAsset(input: {
  campaignId: string;
  asset: RenderAssetRef;
  filepath: string;
}) {
  const db = getDatabase();
  initializeDatabase(db);
  const id = `al-${input.asset.assetId}`;
  const existing = db
    .prepare("SELECT id FROM audio_assets WHERE id = ? LIMIT 1")
    .get(id) as { id: string } | undefined;

  if (existing) return existing.id;

  db.prepare(
    `
      INSERT INTO audio_assets (
        id, campaign_id, title, source_url, music_id, filename, filepath,
        duration_seconds, notes
      )
      VALUES (?, ?, ?, ?, NULL, ?, ?, NULL, NULL)
    `,
  ).run(
    id,
    input.campaignId,
    input.asset.filename ?? "Authorloom audio",
    input.asset.driveUrl ?? null,
    input.asset.filename ?? path.basename(input.filepath),
    input.filepath,
  );

  return id;
}

function upsertRenderJob(input: {
  video: RenderInstruction;
  campaignId: string;
  batchId: string;
  backgroundId: string;
  screenshotId: string;
  hookId: string;
  audioId: string | null;
  thumbnailId: string | null;
}) {
  const db = getDatabase();
  initializeDatabase(db);
  const renderOptions = normalizeSceneRenderOptions(input.video.renderOptions, input.video.postType);
  const duration = renderOptions?.durationSeconds ?? null;
  const audioStartOffset =
    renderOptions?.audioStartOffsetSeconds ?? null;
  const captionBlocks = [
    input.video.postCopy?.caption?.trim(),
    ...(input.video.postCopy?.hashtags ?? []),
  ].filter(Boolean);

  if (input.video.forceRerender) {
    const existing = getRenderJobDetails(input.video.videoOutputId);

    if (existing?.output_filepath) {
      fs.rm(existing.output_filepath, { force: true }).catch(() => undefined);
    }

    const deleted = db.prepare("DELETE FROM render_jobs WHERE id = ?").run(
      input.video.videoOutputId,
    );
    console.log(
      `Force rerender requested for ${input.video.videoOutputId}; cleared ${deleted.changes} local cached render row${deleted.changes === 1 ? "" : "s"}.`,
    );
  }

  db.prepare(
    `
      DELETE FROM render_jobs
      WHERE batch_id = ?
        AND background_id = ?
        AND screenshot_id = ?
        AND hook_id = ?
        AND COALESCE(audio_id, '') = COALESCE(?, '')
        AND id != ?
    `,
  ).run(
    input.batchId,
    input.backgroundId,
    input.screenshotId,
    input.hookId,
    input.audioId,
    input.video.videoOutputId,
  );

  db.prepare(
    `
      INSERT OR REPLACE INTO render_jobs (
        id,
        campaign_id,
        batch_id,
        background_id,
        screenshot_id,
        hook_id,
        audio_id,
        thumbnail_id,
        thumbnail_drive_url,
        render_duration_seconds,
        audio_start_offset_seconds,
        render_options_json,
        background_source,
        screenshot_source,
        hook_source,
        caption,
        status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'book', 'book', 'book', ?, 'pending')
    `,
  ).run(
    input.video.videoOutputId,
    input.campaignId,
    input.batchId,
    input.backgroundId,
    input.screenshotId,
    input.hookId,
    input.audioId,
    input.thumbnailId,
    input.video.assets.thumbnail?.driveUrl ?? null,
    duration,
    audioStartOffset,
    JSON.stringify({
      ...(renderOptions ?? {}),
      postCopy: {
        ...((renderOptions?.postCopy && typeof renderOptions.postCopy === "object")
          ? renderOptions.postCopy
          : {}),
        ...((input.video.postCopy && typeof input.video.postCopy === "object")
          ? input.video.postCopy
          : {}),
        renderedBookTitleLine:
          renderOptions?.postCopy?.renderedBookTitleLine?.trim() ||
          input.video.postCopy?.renderedBookTitleLine?.trim() ||
          null,
      },
      creativeSignature: input.video.creativeSignature ?? null,
      diversityScore: input.video.diversityScore ?? null,
      safeAreaWarnings: input.video.safeAreaWarnings ?? [],
      variationParameters: input.video.variationParameters ?? null,
    }),
    captionBlocks.join("\n\n"),
  );
}

function normalizeSceneRenderOptions(
  renderOptions: RenderInstruction["renderOptions"],
  postType: RenderInstruction["postType"],
) {
  if (!renderOptions) return renderOptions;

  const sceneVideoPost =
    renderOptions.sceneVideoPost && typeof renderOptions.sceneVideoPost === "object"
      ? renderOptions.sceneVideoPost
      : null;

  if (!sceneVideoPost) {
    return {
      ...renderOptions,
      postType: postType ?? renderOptions.postType ?? null,
    };
  }

  const scenes = Array.isArray((sceneVideoPost as { scenes?: unknown }).scenes)
    ? (sceneVideoPost as { scenes: unknown[] }).scenes
    : [];
  const sceneHookTexts = scenes
    .map((scene) => {
      if (!scene || typeof scene !== "object") return null;
      const assets = (scene as { assets?: unknown }).assets;
      if (!assets || typeof assets !== "object") return null;
      const hook = (assets as { hook?: unknown }).hook;
      if (!hook || typeof hook !== "object") return null;
      const text =
        (hook as { text?: unknown; label?: unknown }).text ??
        (hook as { text?: unknown; label?: unknown }).label;
      return typeof text === "string" && text.trim() ? text.trim() : null;
    })
    .filter((text): text is string => Boolean(text));

  return {
    ...renderOptions,
    postType: postType ?? renderOptions.postType ?? "scenes_video_post",
    layoutTemplate: "booktok_full_background_multi_hook",
    multiHookTexts: sceneHookTexts.length > 0
      ? sceneHookTexts
      : renderOptions.multiHookTexts ?? null,
  };
}

async function prepareLocalRenderJob(input: {
  workerInput: RenderCampaignInput;
  video: RenderInstruction;
  localBookId: string;
  localCampaignId: string;
  localBatchId: string;
}) {
  const screenshotPreviewUrl =
    resolveSourceUrl(input.video.assets.screenshot.renderSourceUrl) ??
    resolveSourceUrl(input.video.assets.screenshot.previewUrl);
  const screenshotFile = await ensureSourceFileDownloaded({
    asset: input.video.assets.screenshot,
    sourceUrl: screenshotPreviewUrl,
    filename: screenshotPreviewUrl
      ? `${input.video.screenshotAssetId}.jpg`
      : input.video.assets.screenshot.filename,
    directory: path.join(paths.screenshotsDirectory, input.localBookId),
    fallbackFilename: `${input.video.screenshotAssetId}.jpg`,
  });
  const backgroundSourceUrl =
    resolveSourceUrl(input.video.assets.background.renderSourceUrl) ??
    resolveSourceUrl(input.video.assets.background.previewUrl);
  const backgroundFile = await ensureSourceFileDownloaded({
    asset: input.video.assets.background,
    sourceUrl: backgroundSourceUrl,
    filename: backgroundSourceUrl
      ? `${input.video.backgroundAssetId}${path.extname(input.video.assets.background.filename ?? "") || ".mp4"}`
      : input.video.assets.background.filename,
    directory: path.join(paths.backgroundsDirectory, input.localBookId),
    fallbackFilename: `${input.video.backgroundAssetId}.mp4`,
  });
  const thumbnailAsset = input.video.assets.thumbnail ?? null;
  const thumbnailSourceUrl = thumbnailAsset
    ? resolveSourceUrl(thumbnailAsset.renderSourceUrl) ??
      resolveSourceUrl(thumbnailAsset.previewUrl)
    : null;
  const thumbnailFile = thumbnailSourceUrl
    ? await ensureSourceFileDownloaded({
        asset: thumbnailAsset,
        sourceUrl: thumbnailSourceUrl,
        filename: thumbnailSourceUrl
          ? `${input.video.thumbnailAssetId ?? "thumbnail"}.jpg`
          : thumbnailAsset?.filename,
        directory: path.join(paths.thumbnailsDirectory, input.localBookId),
        fallbackFilename: `${input.video.thumbnailAssetId ?? "thumbnail"}.jpg`,
      })
    : null;
  const introAsset = input.video.assets.intro ?? null;
  const introSourceUrl = introAsset
    ? resolveSourceUrl(introAsset.renderSourceUrl) ??
      resolveSourceUrl(introAsset.previewUrl)
    : null;
  const introFile = introSourceUrl
    ? await ensureSourceFileDownloaded({
        asset: introAsset,
        sourceUrl: introSourceUrl,
        filename: introSourceUrl
          ? `${introAsset?.assetId ?? "intro"}${path.extname(introAsset?.filename ?? "") || ".jpg"}`
          : introAsset?.filename,
        directory: path.join(paths.thumbnailsDirectory, input.localBookId),
        fallbackFilename: `${introAsset?.assetId ?? "intro"}.jpg`,
      })
    : null;
  const outroAsset = input.video.assets.outro ?? null;
  const outroSourceUrl = outroAsset
    ? resolveSourceUrl(outroAsset.renderSourceUrl) ??
      resolveSourceUrl(outroAsset.previewUrl)
    : null;
  const outroFile = outroSourceUrl
    ? await ensureSourceFileDownloaded({
        asset: outroAsset,
        sourceUrl: outroSourceUrl,
        filename: outroSourceUrl
          ? `${outroAsset?.assetId ?? "outro"}${path.extname(outroAsset?.filename ?? "") || ".jpg"}`
          : outroAsset?.filename,
        directory: path.join(paths.thumbnailsDirectory, input.localBookId),
        fallbackFilename: `${outroAsset?.assetId ?? "outro"}.jpg`,
      })
    : null;
  const audioAsset = input.video.assets.audio ?? null;
  const audioSourceUrl =
    resolveSourceUrl(audioAsset?.audioUrl) ??
    resolveSourceUrl(audioAsset?.renderSourceUrl) ??
    resolveSourceUrl(audioAsset?.previewUrl) ??
    null;
  const audioFile = audioSourceUrl
    ? await ensureSourceFileDownloaded({
        asset: audioAsset,
        sourceUrl: audioSourceUrl,
        filename: audioAsset?.filename,
        directory: path.join(paths.audioDirectory, "authorloom"),
        fallbackFilename: `${input.video.audioTrackId ?? input.video.audioAssetId ?? "authorloom-audio"}.m4a`,
      })
    : null;
  const sceneVideoPost = await prepareSceneVideoPostAssets({
    sceneVideoPost: input.video.renderOptions?.sceneVideoPost,
    localBookId: input.localBookId,
  });
  const timelineVideoPost = await prepareTimelineVideoPostAssets({
    timelineVideoPost: input.video.renderOptions?.timelineVideoPost,
    localBookId: input.localBookId,
  });
  const screenshotId = ensureBookScreenshot({
    bookId: input.localBookId,
    asset: input.video.assets.screenshot,
    filepath: screenshotFile,
  });
  const backgroundId = ensureBookBackground({
    bookId: input.localBookId,
    asset: input.video.assets.background,
    filepath: backgroundFile,
  });
  const thumbnailId =
    thumbnailFile && input.video.assets.thumbnail
      ? ensureBookThumbnail({
          bookId: input.localBookId,
          asset: input.video.assets.thumbnail,
          filepath: thumbnailFile,
        })
      : null;
  const audioId =
    audioFile && input.video.assets.audio
      ? ensureAudioAsset({
          campaignId: input.localCampaignId,
          asset: input.video.assets.audio,
          filepath: audioFile,
        })
      : null;
  const hookId = ensureBookHook({
    bookId: input.localBookId,
    screenshotId,
    asset: input.video.assets.hook,
  });

  upsertRenderJob({
    video: {
      ...input.video,
      renderOptions: {
        ...(input.video.renderOptions ?? {}),
        postType: input.video.postType ?? null,
        sceneVideoPost,
        timelineVideoPost,
        layoutStudioAssets: {
          ...(
            input.video.renderOptions?.layoutStudioAssets &&
            typeof input.video.renderOptions.layoutStudioAssets === "object"
              ? input.video.renderOptions.layoutStudioAssets as Record<string, unknown>
              : {}
          ),
          introFilepath: introFile,
          outroFilepath: outroFile,
        },
      },
    },
    campaignId: input.localCampaignId,
    batchId: input.localBatchId,
    backgroundId,
    screenshotId,
    hookId,
    audioId,
    thumbnailId,
  });
}

async function prepareTimelineVideoPostAssets(input: {
  timelineVideoPost: unknown;
  localBookId: string;
}) {
  if (!input.timelineVideoPost || typeof input.timelineVideoPost !== "object") {
    return input.timelineVideoPost ?? null;
  }

  const timelineVideoPost = input.timelineVideoPost as Record<string, unknown>;
  const resolvedClips = Array.isArray(timelineVideoPost.resolvedClips)
    ? timelineVideoPost.resolvedClips
    : null;

  if (!resolvedClips) {
    return timelineVideoPost;
  }

  return {
    ...timelineVideoPost,
    resolvedClips: await Promise.all(
      resolvedClips.map(async (clip) => {
        if (!clip || typeof clip !== "object") return clip;
        const clipRecord = clip as Record<string, unknown>;
        const asset = clipRecord.asset && typeof clipRecord.asset === "object"
          ? clipRecord.asset as RenderAssetRef
          : null;

        if (!asset) return clipRecord;

        const sourceUrl =
          resolveSourceUrl(asset.renderSourceUrl) ??
          resolveSourceUrl(asset.previewUrl) ??
          resolveSourceUrl(asset.audioUrl) ??
          null;
        const isTextAsset = ["hook", "cta", "keyword", "trope", "metadata"].includes(asset.type);

        if (isTextAsset && !sourceUrl) {
          return {
            ...clipRecord,
            asset,
          };
        }

        const extension =
          path.extname(asset.filename ?? "") ||
          (asset.renderSourceMimeType?.includes("video") ? ".mp4" : ".jpg");
        const directory = ["background", "backgroundImage"].includes(asset.type)
          ? path.join(paths.backgroundsDirectory, input.localBookId)
          : ["cover", "coverImage", "thumbnail"].includes(asset.type)
            ? path.join(paths.thumbnailsDirectory, input.localBookId)
            : path.join(paths.screenshotsDirectory, input.localBookId);
        const filepath = await ensureSourceFileDownloaded({
          asset,
          sourceUrl,
          filename: sourceUrl ? `${asset.assetId}${extension}` : asset.filename,
          directory,
          fallbackFilename: `${asset.assetId}${extension}`,
        });

        return {
          ...clipRecord,
          asset: {
            ...asset,
            filepath,
          },
        };
      }),
    ),
  };
}

async function prepareSceneVideoPostAssets(input: {
  sceneVideoPost: unknown;
  localBookId: string;
}) {
  if (!input.sceneVideoPost || typeof input.sceneVideoPost !== "object") {
    return input.sceneVideoPost ?? null;
  }

  const sceneVideoPost = input.sceneVideoPost as Record<string, unknown>;
  const scenes = Array.isArray(sceneVideoPost.scenes) ? sceneVideoPost.scenes : null;

  if (!scenes) {
    return sceneVideoPost;
  }

  return {
    ...sceneVideoPost,
    scenes: await Promise.all(
      scenes.map(async (scene, sceneIndex) => {
        if (!scene || typeof scene !== "object") return scene;

        const sceneRecord = scene as Record<string, unknown>;
        const assets =
          sceneRecord.assets && typeof sceneRecord.assets === "object"
            ? (sceneRecord.assets as Record<string, unknown>)
            : null;

        if (!assets) return sceneRecord;

        return {
          ...sceneRecord,
          assets: {
            ...assets,
            background: await prepareSceneAssetRef({
              asset: assets.background,
              localBookId: input.localBookId,
              sceneIndex,
              slot: "background",
            }),
            image: await prepareSceneAssetRef({
              asset: assets.image,
              localBookId: input.localBookId,
              sceneIndex,
              slot: "image",
            }),
            screenshot: await prepareSceneAssetRef({
              asset: assets.screenshot,
              localBookId: input.localBookId,
              sceneIndex,
              slot: "screenshot",
            }),
            hook: assets.hook,
            cta: assets.cta,
            keywords: assets.keywords,
            tropes: assets.tropes,
          },
        };
      }),
    ),
  };
}

async function prepareSceneAssetRef(input: {
  asset: unknown;
  localBookId: string;
  sceneIndex: number;
  slot: string;
}) {
  if (!input.asset || typeof input.asset !== "object") {
    return input.asset ?? null;
  }

  const asset = input.asset as RenderAssetRef;
  const sourceUrl =
    resolveSourceUrl(asset.renderSourceUrl) ??
    resolveSourceUrl(asset.previewUrl);

  if (!sourceUrl && !mediaIdForAsset(asset)) {
    return asset;
  }

  const assetId = asset.assetId ?? `scene-${input.sceneIndex + 1}-${input.slot}`;
  const extension = path.extname(asset.filename ?? "") || fallbackExtensionForAsset(asset);
  const filepath = await ensureSourceFileDownloaded({
    asset,
    sourceUrl,
    filename: `${assetId}${extension}`,
    directory: path.join(paths.backgroundsDirectory, input.localBookId, "scenes"),
    fallbackFilename: `${assetId}${extension}`,
  });

  return {
    ...asset,
    filepath,
  };
}

function fallbackExtensionForAsset(asset: RenderAssetRef) {
  const mimeType = asset.renderSourceMimeType?.toLowerCase() ?? "";

  if (mimeType.includes("png")) return ".png";
  if (mimeType.includes("webp")) return ".webp";
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return ".jpg";
  if (mimeType.includes("mp4")) return ".mp4";
  if (mimeType.includes("quicktime") || mimeType.includes("mov")) return ".mov";
  if (mimeType.includes("x-m4v") || mimeType.includes("m4v")) return ".m4v";
  if (mimeType.includes("webm")) return ".webm";
  if (asset.type === "background") return ".mp4";
  return ".jpg";
}

async function processRenderCampaign(job: ClaimedJob) {
  const input = renderCampaignInput(job.input);
  const videos = renderInstructions(job.input);

  if (videos.length === 0) {
    await client.mutation(api.productionJobs.fail, {
      jobId: job.job.id,
      workerId,
      workerSecret: requiredWorkerSecret,
      error:
        "Campaign is paid, but no render instructions were attached yet. Complete campaign asset selection before factory rendering.",
      errorCode: "MISSING_RENDER_INSTRUCTIONS",
      errorDetails: { campaignId: job.campaign?.id ?? null },
      output: {
        summary: {
          rendered: 0,
          failed: 0,
        },
      },
    });
    return;
  }

  const validationErrors = videos.flatMap((video, index) =>
    validateRenderInstruction({
      video,
      index,
      campaignId: job.campaign?.id ?? input.campaignId,
    }),
  );

  if (validationErrors.length > 0) {
    const compactValidationErrors = compactErrorList(validationErrors);

    await client.mutation(api.productionJobs.fail, {
      jobId: job.job.id,
      workerId,
      workerSecret: requiredWorkerSecret,
      error: compactText(
        `Render campaign payload failed validation: ${compactValidationErrors
          .slice(0, 5)
          .join(" ")}`,
      ),
      errorCode: "INVALID_RENDER_PAYLOAD",
      errorDetails: {
        campaignId: job.campaign?.id ?? input.campaignId ?? null,
        validationErrors: compactValidationErrors,
      },
      output: {
        summary: {
          rendered: 0,
          failed: videos.length,
        },
      },
    });
    return;
  }

  const localAuthor = ensureLocalAuthor(input);
  const localBook = ensureLocalBook(input, localAuthor.id);
  const localCampaign = ensureLocalCampaign(input, localBook.id);
  const localBatch = ensureLocalBatch(localCampaign.id, input);

  const results = [];
  const errors: string[] = [];

  for (const video of videos) {
    const startedAt = new Date().toISOString();

    try {
      console.log(
        `Preparing render ${video.videoOutputId} (${video.outputFilename ?? "factory filename"}) with audio offset ${video.renderOptions?.audioStartOffsetSeconds ?? 0}s.`,
      );
      await prepareLocalRenderJob({
        workerInput: input,
        video,
        localBookId: localBook.id,
        localCampaignId: localCampaign.id,
        localBatchId: localBatch.id,
      });
      const existing = getRenderJobDetails(video.videoOutputId);

      if (!existing) {
        throw new Error("Prepared render job could not be loaded.");
      }

      let renderResult:
        | {
            effectiveLayoutTemplate?: string;
            effectiveLayoutTemplateId?: string;
          }
        | null = null;

      if (video.forceRerender || (existing.status !== "done" && !existing.drive_url)) {
        console.log(`Render started for ${video.videoOutputId}.`);
        renderResult = await renderJob(video.videoOutputId);
        console.log(`Render completed for ${video.videoOutputId}.`);
      } else {
        console.log(`Render already complete locally for ${video.videoOutputId}.`);
      }

      const renderedJob = getRenderJobDetails(video.videoOutputId);
      if (!renderedJob?.output_filepath) {
        throw new Error("Render completed but no local output file was recorded.");
      }

      const effectiveOutputFilename =
        renderedJob.output_filename ?? video.outputFilename ?? null;
      const stagedPreview = await uploadRenderedPreviewToStorage({
        filepath: renderedJob.output_filepath,
        campaignId: job.campaign?.id ?? input.campaignId ?? null,
        videoOutputId: video.videoOutputId,
        outputFilename: effectiveOutputFilename,
      });
      console.log(
        `Staged rendered output for ${video.videoOutputId}: ${stagedPreview.previewUrl}.`,
      );

      const finishedAt = new Date().toISOString();

      results.push({
        videoOutputId: video.videoOutputId,
        fingerprint: video.fingerprint,
        status: "done" as const,
        driveFileId: null,
        driveUrl: null,
        stagedPreviewObjectName: stagedPreview.objectName,
        stagedPreviewUrl: stagedPreview.previewUrl,
        outputFilename: effectiveOutputFilename,
        durationSeconds: null,
        startedAt,
        finishedAt,
        metadata: {
          effectiveLayoutTemplate: renderResult?.effectiveLayoutTemplate ?? null,
          effectiveLayoutTemplateId: renderResult?.effectiveLayoutTemplateId ?? null,
          localRenderJobId: video.videoOutputId,
          localCampaignId: localCampaign.id,
          localBatchId: localBatch.id,
        },
      });
      console.log(
        `Output written to GCS for ${video.videoOutputId}: ${stagedPreview.previewUrl}.`,
      );
    } catch (error) {
      const message = compactErrorMessage(error);
      const finishedAt = new Date().toISOString();

      errors.push(`${video.videoOutputId}: ${message}`);
      console.error(`Render failed for ${video.videoOutputId}: ${message}`);
      results.push({
        videoOutputId: video.videoOutputId,
        fingerprint: video.fingerprint,
        status: "failed" as const,
        error: message,
        startedAt,
        finishedAt,
      });
    }
  }

  const rendered = results.filter((result) => result.status === "done").length;
  const failed = results.filter((result) => result.status === "failed").length;

  const report = await client.mutation(api.productionJobs.reportRenderCampaignResult, {
    workerId,
    workerSecret: requiredWorkerSecret,
    result: {
      version: "render_campaign_result.v1",
      productionJobId: job.job.id,
      campaignId: job.campaign?.id ?? (input.campaignId as Id<"campaigns">),
      processedAt: new Date().toISOString(),
      summary: {
        requested: videos.length,
        rendered,
        skippedExisting: 0,
        failed,
      },
      videos: results,
      errors: compactErrorList(errors),
    },
  });
  const reportResult = report as { success?: boolean; message?: string };

  if (reportResult.success === false) {
    throw new Error(
      reportResult.message ?? "Convex rejected the render campaign result.",
    );
  }
  console.log(
    `Convex render result mutation succeeded for ${job.job.id}: ${rendered} rendered, ${failed} failed.`,
  );
}

async function processJob(job: ClaimedJob) {
  await client.mutation(api.productionJobs.heartbeat, {
    jobId: job.job.id,
    workerId,
    workerSecret: requiredWorkerSecret,
  });

  const heartbeat = setInterval(() => {
    void client
      .mutation(api.productionJobs.heartbeat, {
        jobId: job.job.id,
        workerId,
        workerSecret: requiredWorkerSecret,
      })
      .catch((error) => {
        const message =
          error instanceof Error ? error.message : "Unknown heartbeat failure.";
        console.warn(`Heartbeat failed for ${job.job.id}: ${message}`);
      });
  }, 30_000);

  try {
    if (job.job.type !== "render_campaign_videos") {
      await client.mutation(api.productionJobs.fail, {
        jobId: job.job.id,
        workerId,
        workerSecret: requiredWorkerSecret,
        error: `Unsupported Authorloom factory job type: ${job.job.type}`,
        errorCode: "UNSUPPORTED_JOB_TYPE",
        errorDetails: { jobType: job.job.type },
        output: {},
      });
      return;
    }

    await processRenderCampaign(job);
  } catch (error) {
    const message = compactErrorMessage(error);

    await client.mutation(api.productionJobs.fail, {
      jobId: job.job.id,
      workerId,
      workerSecret: requiredWorkerSecret,
      error: message,
      errorCode: "RENDER_CAMPAIGN_WORKER_FAILED",
      errorDetails: { message },
      output: {
        summary: {
          rendered: 0,
          failed: 0,
        },
      },
    });
    console.error(`Render campaign job ${job.job.id} failed: ${message}`);
  } finally {
    clearInterval(heartbeat);
  }
}

async function tick() {
  lastTickAt = new Date().toISOString();
  const claim = await client.mutation(api.productionJobs.claimNext, {
    workerId,
    workerSecret: requiredWorkerSecret,
    types: ["render_campaign_videos"],
  });

  const claimResult = claim as {
    success: boolean;
    message?: string;
    job?: ClaimedJob | null;
  };

  if (!claimResult.success) {
    throw new Error(claimResult.message ?? "Could not claim production job.");
  }

  if (!claimResult.job) {
    console.log("No queued Authorloom render jobs.");
    return;
  }

  console.log(
    `Claimed ${claimResult.job.job.type} job ${claimResult.job.job.id}.`,
  );
  lastClaimedJobId = claimResult.job.job.id;
  await processJob(claimResult.job);
}

async function readJsonBody(request: http.IncomingMessage) {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

async function handleRenderTask(
  request: http.IncomingMessage,
  response: http.ServerResponse,
) {
  if (request.method !== "POST") {
    response.writeHead(405, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: false, message: "Method not allowed." }));
    return;
  }

  const providedSecret =
    request.headers["x-authorloom-task-secret"]?.toString().trim() ?? "";

  if (!taskSecret || providedSecret !== taskSecret) {
    response.writeHead(401, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: false, message: "Unauthorized." }));
    return;
  }

  let body: RenderTaskRequest;

  try {
    const parsed = await readJsonBody(request);
    body = parsed && typeof parsed === "object" ? (parsed as RenderTaskRequest) : {};
  } catch (error) {
    response.writeHead(400, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        ok: false,
        message: error instanceof Error ? error.message : "Invalid JSON body.",
      }),
    );
    return;
  }

  const idempotencyKey = body.idempotencyKey?.trim();

  if (!idempotencyKey) {
    response.writeHead(400, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        ok: false,
        message: "idempotencyKey is required.",
      }),
    );
    return;
  }

  console.log(
    `Cloud Task received for ${body.productionJobId ?? "unknown job"} (${idempotencyKey}).`,
  );

  const claim = await client.mutation(api.productionJobs.claimNext, {
    workerId,
    workerSecret: requiredWorkerSecret,
    types: ["render_campaign_videos"],
    idempotencyKey,
  });
  const claimResult = claim as {
    success: boolean;
    message?: string;
    job?: ClaimedJob | null;
  };

  if (!claimResult.success) {
    throw new Error(claimResult.message ?? "Could not claim production job.");
  }

  if (!claimResult.job) {
    console.log(
      `No queued matching render job for Cloud Task ${body.productionJobId ?? idempotencyKey}; treating as already handled.`,
    );
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true, claimed: false }));
    return;
  }

  lastClaimedJobId = claimResult.job.job.id;
  await processJob(claimResult.job);

  response.writeHead(200, { "content-type": "application/json" });
  response.end(
    JSON.stringify({
      ok: true,
      claimed: true,
      productionJobId: claimResult.job.job.id,
    }),
  );
}

function startHealthServer() {
  if (!healthPort || !Number.isFinite(healthPort)) {
    return;
  }

  healthServer = http.createServer(async (request, response) => {
    if (request.url === "/healthz") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          ok: true,
          workerId,
          lastTickAt,
          lastClaimedJobId,
        }),
      );
      return;
    }

    const requestUrl = new URL(request.url ?? "/", "http://localhost");

    if (requestUrl.pathname === "/tasks/render") {
      try {
        await handleRenderTask(request, response);
      } catch (error) {
        console.error("Cloud Task render request failed.");
        console.error(error instanceof Error ? error.message : error);
        response.writeHead(500, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            ok: false,
            message:
              error instanceof Error
                ? error.message
                : "Cloud Task render request failed.",
          }),
        );
      }

      return;
    }

    if (requestUrl.pathname === "/scale-check") {
      const providedSecret =
        request.headers["x-authorloom-scaler-secret"]?.toString().trim() ||
        requestUrl.searchParams.get("secret")?.trim();

      if (!scalerSecret || providedSecret !== scalerSecret) {
        response.writeHead(401, { "content-type": "application/json" });
        response.end(JSON.stringify({ ok: false, message: "Unauthorized." }));
        return;
      }

      try {
        const result = await runScaleCheck();

        console.log(
          `Scale check: ${result.activeJobs} active jobs, target min ${result.targetMinInstances}, max ${result.targetMaxInstances}, changed=${result.changed}.`,
        );
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify(result));
      } catch (error) {
        console.error("Scale check failed.");
        console.error(error instanceof Error ? error.message : error);
        response.writeHead(500, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            ok: false,
            message: error instanceof Error ? error.message : "Scale check failed.",
          }),
        );
      }

      return;
    }

    response.writeHead(200, { "content-type": "text/plain" });
    response.end("Authorloom factory worker\n");
  });

  healthServer.listen(healthPort, "0.0.0.0", () => {
    console.log(`Worker health server listening on port ${healthPort}.`);
  });
}

async function main() {
  startHealthServer();
  console.log(`Authorloom production worker started as ${workerId}.`);

  if (taskOnlyMode) {
    console.log("Cloud Tasks mode enabled; background polling is disabled.");
    setInterval(() => {
      lastTickAt = new Date().toISOString();
    }, 60_000);
    await new Promise(() => {
      // Keep the Cloud Run HTTP server alive for Cloud Tasks requests.
    });
  }

  do {
    await tick();

    if (!once) {
      await new Promise((resolve) => setTimeout(resolve, pollMs));
    }
  } while (!once);
}

main().catch((error: unknown) => {
  console.error("Authorloom production worker failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
