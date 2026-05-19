import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";
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
  updateCampaignDriveFolder,
} from "../src/lib/db";
import { renderJob } from "../src/lib/ffmpeg";
import {
  createCampaignDriveFolderForBook,
  downloadDriveFile,
  ensureCampaignDriveOutputFolders,
  uploadRenderJobVideoToDrive,
} from "../src/lib/google";
import { env } from "../src/lib/env";
import { getGoogleServiceAccountAuth } from "../src/lib/google-auth";
import { paths } from "../src/lib/paths";
import { slugifyCampaignName, slugifyName } from "../src/lib/slugs";

const api = anyApi;
type Id<TableName extends string> = string & { __tableName?: TableName };

const once = process.argv.includes("--once");
const pollMs = Number(process.env.AUTHORLOOM_WORKER_POLL_MS ?? 15_000);
const healthPort = process.env.PORT ? Number(process.env.PORT) : null;
const workerId =
  process.env.AUTHORLOOM_WORKER_ID?.trim() ||
  `authorloom-factory-${process.pid}`;
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
  Number(process.env.AUTHORLOOM_SCALER_MAX_INSTANCES ?? 30),
);

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

type RenderAssetRef = {
  assetId: string;
  type: string;
  filename?: string | null;
  driveFileId?: string | null;
  driveUrl?: string | null;
  previewUrl?: string | null;
  renderSourceUrl?: string | null;
  renderSourceMimeType?: string | null;
  audioUrl?: string | null;
  text?: string | null;
};

type RenderInstruction = {
  videoOutputId: Id<"videoOutputs">;
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
  };
  renderOptions?: {
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
    multiHookTexts?: string[] | null;
  };
  postCopy?: {
    caption?: string | null;
    hashtags?: string[];
    keywords?: string[];
    keywordOrder?: string[];
    keywordCategories?: string[];
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
  if (activeJobs <= 20) return 2;
  if (activeJobs <= 80) return 4;
  if (activeJobs <= 200) return 6;
  if (activeJobs <= 400) return 8;
  if (activeJobs <= 600) return 10;
  if (activeJobs <= 800) return 12;
  if (activeJobs <= 1_000) return 14;
  if (activeJobs <= 2_000) return 17;
  if (activeJobs <= 5_000) return 20;
  return 30;
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
      scaling?: { minInstanceCount?: number | string };
      template?: { scaling?: { maxInstanceCount?: number | string } };
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
    "scaling.minInstanceCount",
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
        scaling: { minInstanceCount: input.minInstances },
        template: { scaling: { maxInstanceCount: input.maxInstances } },
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
  const currentMin = Number(service.scaling?.minInstanceCount ?? 0);
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
  if (!video.assets?.screenshot?.driveFileId) {
    errors.push(`${prefix}.assets.screenshot.driveFileId is required.`);
  }
  if (!video.assets?.background?.driveFileId) {
    errors.push(`${prefix}.assets.background.driveFileId is required.`);
  }
  if (!video.assets?.hook?.text?.trim()) {
    errors.push(`${prefix}.assets.hook.text is required.`);
  }
  const audioSourceUrl = video.assets.audio?.audioUrl ?? video.assets.audio?.previewUrl ?? null;
  if ((video.audioAssetId || video.audioTrackId) && !video.assets.audio?.driveFileId && !audioSourceUrl) {
    errors.push(
      `${prefix}.assets.audio.driveFileId or assets.audio.previewUrl is required when an audio asset is set.`,
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

function isHeicFilename(value: string | null | undefined) {
  return [".heic", ".heif"].includes(path.extname(value ?? "").toLowerCase());
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

    return decodeURIComponent(parsed.pathname.slice(markerIndex + marker.length));
  } catch {
    return null;
  }
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

  const url = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(
    bucketName,
  )}/o/${encodeURIComponent(objectName)}?alt=media`;
  const auth = getGoogleServiceAccountAuth({ impersonateWorkspace: false });
  const headers = await auth.getRequestHeaders(url);
  const response = await fetch(url, { headers: headers as HeadersInit });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Could not download Cloud Storage render source ${objectName}: ${response.status} ${response.statusText} ${body.slice(
        0,
        300,
      )}`,
    );
  }

  await fs.writeFile(filepath, Buffer.from(await response.arrayBuffer()));
}

async function ensureSourceFileDownloaded(input: {
  driveFileId?: string | null;
  sourceUrl?: string | null;
  filename?: string | null;
  directory: string;
  fallbackFilename: string;
}) {
  if (!input.driveFileId && !input.sourceUrl) {
    throw new Error(`${input.fallbackFilename} is missing a Drive file ID or source URL.`);
  }

  await fs.mkdir(input.directory, { recursive: true });
  const filename = safeFilename(input.filename, input.fallbackFilename);
  const filepath = path.join(input.directory, filename);

  try {
    await fs.access(filepath);
    console.log(`Source asset already cached: ${filepath}`);
    return filepath;
  } catch {
    if (input.driveFileId) {
      console.log(`Downloading source asset ${input.driveFileId} -> ${filepath}`);
      await downloadDriveFile(input.driveFileId, filepath);
    } else if (input.sourceUrl) {
      console.log(`Downloading source asset ${input.sourceUrl} -> ${filepath}`);
      const previewObjectName = getPreviewObjectNameFromUrl(input.sourceUrl);

      if (previewObjectName) {
        await downloadPreviewObjectFromStorage(previewObjectName, filepath);
      } else {
        const response = await fetch(input.sourceUrl, {
          headers: sourceRequestHeaders(input.sourceUrl),
        });
        if (!response.ok) {
          const body = await response.text().catch(() => "");
          throw new Error(
            `Could not download source asset from ${input.sourceUrl}: ${response.status} ${response.statusText} ${body.slice(
              0,
              300,
            )}`,
          );
        }
        const buffer = Buffer.from(await response.arrayBuffer());
        await fs.writeFile(filepath, buffer);
      }
    }
    console.log(`Source asset downloaded: ${filepath}`);
    return filepath;
  }
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
  const duration = input.video.renderOptions?.durationSeconds ?? null;
  const audioStartOffset =
    input.video.renderOptions?.audioStartOffsetSeconds ?? null;
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
      ...(input.video.renderOptions ?? {}),
      postCopy: input.video.postCopy ?? null,
      creativeSignature: input.video.creativeSignature ?? null,
      diversityScore: input.video.diversityScore ?? null,
      safeAreaWarnings: input.video.safeAreaWarnings ?? [],
      variationParameters: input.video.variationParameters ?? null,
    }),
    captionBlocks.join("\n\n"),
  );
}

async function prepareLocalRenderJob(input: {
  workerInput: RenderCampaignInput;
  video: RenderInstruction;
  localBookId: string;
  localCampaignId: string;
  localBatchId: string;
}) {
  const screenshotRenderSourceUrl = resolveSourceUrl(
    input.video.assets.screenshot.renderSourceUrl,
  );
  const screenshotPreviewUrl =
    screenshotRenderSourceUrl ??
    (isHeicFilename(input.video.assets.screenshot.filename)
      ? resolveSourceUrl(input.video.assets.screenshot.previewUrl)
      : null);
  const screenshotFile = await ensureSourceFileDownloaded({
    driveFileId: screenshotPreviewUrl
      ? null
      : input.video.assets.screenshot.driveFileId,
    sourceUrl: screenshotPreviewUrl,
    filename: screenshotPreviewUrl
      ? `${input.video.screenshotAssetId}.jpg`
      : input.video.assets.screenshot.filename,
    directory: path.join(paths.screenshotsDirectory, input.localBookId),
    fallbackFilename: `${input.video.screenshotAssetId}.jpg`,
  });
  const backgroundFile = await ensureSourceFileDownloaded({
    driveFileId: input.video.assets.background.driveFileId,
    filename: input.video.assets.background.filename,
    directory: path.join(paths.backgroundsDirectory, input.localBookId),
    fallbackFilename: `${input.video.backgroundAssetId}.mp4`,
  });
  const thumbnailFile = input.video.assets.thumbnail?.driveFileId
    ? await ensureSourceFileDownloaded({
        driveFileId: input.video.assets.thumbnail.driveFileId,
        filename: input.video.assets.thumbnail.filename,
        directory: path.join(paths.thumbnailsDirectory, input.localBookId),
        fallbackFilename: `${input.video.thumbnailAssetId}.jpg`,
      })
    : null;
  const audioAsset = input.video.assets.audio ?? null;
  const audioSourceUrl = audioAsset?.audioUrl ?? audioAsset?.previewUrl ?? null;
  const audioFile = audioAsset?.driveFileId || audioSourceUrl
    ? await ensureSourceFileDownloaded({
        driveFileId: audioAsset?.driveFileId,
        sourceUrl: audioSourceUrl,
        filename: audioAsset?.filename,
        directory: path.join(paths.audioDirectory, "authorloom"),
        fallbackFilename: `${input.video.audioTrackId ?? input.video.audioAssetId ?? "authorloom-audio"}.m4a`,
      })
    : null;
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
    video: input.video,
    campaignId: input.localCampaignId,
    batchId: input.localBatchId,
    backgroundId,
    screenshotId,
    hookId,
    audioId,
    thumbnailId,
  });
}

async function ensureLocalDriveOutputFolders(input: {
  localBookId: string;
  localCampaignId: string;
  campaignSlug: string;
}) {
  const campaign = getCampaign(input.localCampaignId);

  if (!campaign?.drive_campaign_folder_id) {
    const folder = await createCampaignDriveFolderForBook({
      bookId: input.localBookId,
      slug: input.campaignSlug,
    });
    updateCampaignDriveFolder({
      campaignId: input.localCampaignId,
      driveCampaignFolderId: folder.folderId,
      driveCampaignFolderUrl: folder.folderUrl,
    });
  }

  await ensureCampaignDriveOutputFolders(input.localCampaignId);
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
    await client.mutation(api.productionJobs.fail, {
      jobId: job.job.id,
      workerId,
      workerSecret: requiredWorkerSecret,
      error: `Render campaign payload failed validation: ${validationErrors
        .slice(0, 5)
        .join(" ")}`,
      errorCode: "INVALID_RENDER_PAYLOAD",
      errorDetails: {
        campaignId: job.campaign?.id ?? input.campaignId ?? null,
        validationErrors,
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
  const campaignSlug =
    input.campaign?.slug?.trim() ||
    (input.campaignId ? slugifyCampaignName(input.campaignId) : localCampaign.slug ?? localCampaign.id);

  await ensureLocalDriveOutputFolders({
    localBookId: localBook.id,
    localCampaignId: localCampaign.id,
    campaignSlug,
  });

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

      if (video.forceRerender || (existing.status !== "done" && !existing.drive_url)) {
        console.log(`Render started for ${video.videoOutputId}.`);
        await renderJob(video.videoOutputId);
        console.log(`Render completed for ${video.videoOutputId}.`);
      } else {
        console.log(`Render already complete locally for ${video.videoOutputId}.`);
      }

      console.log(`Uploading rendered video ${video.videoOutputId} to Drive.`);
      const upload = await uploadRenderJobVideoToDrive(video.videoOutputId);
      const uploadedVideo =
        upload.videos.find((item) => item.jobId === video.videoOutputId) ??
        null;

      if (!uploadedVideo?.driveUrl) {
        throw new Error(
          upload.errors.length > 0
            ? `Drive upload did not return a video URL. ${upload.errors.join(" ")}`
            : "Drive upload did not return a video URL.",
        );
      }

      const finishedAt = new Date().toISOString();

      results.push({
        videoOutputId: video.videoOutputId,
        fingerprint: video.fingerprint,
        status: "done" as const,
        driveFileId: uploadedVideo.driveFileId ?? null,
        driveUrl: uploadedVideo.driveUrl,
        outputFilename: uploadedVideo.outputFilename ?? null,
        durationSeconds: null,
        startedAt,
        finishedAt,
        metadata: {
          localRenderJobId: video.videoOutputId,
          localCampaignId: localCampaign.id,
          localBatchId: localBatch.id,
        },
      });
      console.log(
        `Output written for ${video.videoOutputId}: ${uploadedVideo.driveUrl}.`,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown render failure.";
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
      errors,
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
    const message =
      error instanceof Error ? error.message : "Unknown render campaign failure.";

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

function startHealthServer() {
  if (!healthPort || !Number.isFinite(healthPort)) {
    return;
  }

  const server = http.createServer(async (request, response) => {
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

  server.listen(healthPort, "0.0.0.0", () => {
    console.log(`Worker health server listening on port ${healthPort}.`);
  });
}

async function main() {
  startHealthServer();
  console.log(`Authorloom production worker started as ${workerId}.`);

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
