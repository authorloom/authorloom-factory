import Database from "better-sqlite3";
import fs from "node:fs";
import { nanoid } from "nanoid";

import { buildRenderCaption } from "@/lib/captions";
import { paths } from "@/lib/paths";
import { slugifyCampaignName, slugifyName } from "@/lib/slugs";

export type RenderJobStatus = "pending" | "running" | "done" | "failed";
export type RenderBatchStatus =
  | "draft"
  | "pending"
  | "rendering"
  | "done"
  | "failed";
export type VideoUploadQueueStatus = "queued" | "running" | "done" | "failed";

export type Campaign = {
  id: string;
  name: string;
  slug: string | null;
  description: string | null;
  book_id: string | null;
  layout_id: string | null;
  goal: string | null;
  drive_folder_url: string | null;
  drive_folder_id: string | null;
  drive_campaign_folder_url: string | null;
  drive_campaign_folder_id: string | null;
  drive_final_videos_folder_id: string | null;
  drive_metricool_folder_id: string | null;
  metricool_sheet_id: string | null;
  metricool_sheet_url: string | null;
  metricool_sheet_updated_at: string | null;
  hooks_sheet_url: string | null;
  default_caption: string | null;
  created_at: string;
  updated_at: string;
};

export type VideoUploadQueueItem = {
  id: string;
  campaign_id: string;
  render_job_id: string;
  status: VideoUploadQueueStatus;
  attempts: number;
  error: string | null;
  created_at: string;
  updated_at: string;
};

export type VideoUploadQueueStats = {
  queued: number;
  running: number;
  done: number;
  failed: number;
  total: number;
};

export type Author = {
  id: string;
  name: string;
  slug: string;
  drive_folder_url: string | null;
  drive_folder_id: string | null;
  created_at: number;
};

export type Series = {
  id: string;
  author_id: string;
  name: string;
  created_at: number;
};

export type Book = {
  id: string;
  author_id: string;
  series_id: string | null;
  slug: string;
  title: string;
  description: string | null;
  cover_filepath: string | null;
  manuscript_filepath: string | null;
  drive_folder_url: string | null;
  drive_folder_id: string | null;
  hooks_sheet_url: string | null;
  hooks_sheet_id: string | null;
  captions_sheet_url: string | null;
  captions_sheet_id: string | null;
  hashtags_sheet_url: string | null;
  hashtags_sheet_id: string | null;
  created_at: number;
};

export type BookScreenshot = {
  id: string;
  book_id: string;
  google_file_id: string | null;
  source_url: string | null;
  filename: string;
  filepath: string;
  created_at: number;
};

export type BookHook = {
  id: string;
  book_id: string;
  screenshot_id: string;
  text: string;
  source_row_number: number | null;
  created_at: number;
};

export type BookBackground = {
  id: string;
  book_id: string;
  google_file_id: string | null;
  filename: string;
  filepath: string;
  duration_seconds: number | null;
  created_at: number;
};

export type BookThumbnail = {
  id: string;
  book_id: string;
  google_file_id: string | null;
  filename: string;
  filepath: string;
  drive_url: string | null;
  created_at: number;
};

export type BookTrope = {
  id: string;
  book_id: string;
  trope: string;
  created_at: number;
};

export type BookCaption = {
  id: string;
  book_id: string;
  text: string;
  source_row_number: number | null;
  created_at: number;
};

export type BookHashtag = {
  id: string;
  book_id: string;
  original_text: string | null;
  hashtag: string;
  source_row_number: number | null;
  created_at: number;
};

export type Layout = {
  id: string;
  name: string;
  type: string;
  description: string | null;
  created_at: number;
};

export type RenderBatch = {
  id: string;
  campaign_id: string;
  name: string;
  layout_id: string | null;
  caption: string | null;
  status: RenderBatchStatus;
  created_at: string;
  updated_at: string;
};

export type RenderBatchScreenshotSelection = {
  id: string;
  batch_id: string;
  screenshot_id: string;
  created_at: number;
};

export type RenderBatchHookSelection = {
  id: string;
  batch_id: string;
  hook_id: string;
  created_at: number;
};

export type RenderBatchBackgroundSelection = {
  id: string;
  batch_id: string;
  background_id: string;
  created_at: number;
};

export type RenderBatchAudioSelection = {
  id: string;
  batch_id: string;
  audio_id: string;
  render_duration_seconds: number | null;
  created_at: number;
};

export type RenderBatchCaptionSelection = {
  id: string;
  batch_id: string;
  caption_id: string;
  created_at: number;
};

export type RenderBatchHashtagSelection = {
  id: string;
  batch_id: string;
  hashtag_id: string;
  created_at: number;
};

export type RenderBatchThumbnailSelection = {
  id: string;
  batch_id: string;
  thumbnail_id: string;
  created_at: number;
};

export type CampaignScreenshotSelection = {
  id: string;
  campaign_id: string;
  screenshot_id: string;
  created_at: number;
};

export type CampaignBackgroundSelection = {
  id: string;
  campaign_id: string;
  background_id: string;
  created_at: number;
};

export type CampaignAudioSelection = {
  id: string;
  campaign_id: string;
  audio_id: string;
  created_at: number;
};

export type UpdateCampaignSelectionsInput = {
  campaignId: string;
  assetIds: string[];
};

export type UpdateCampaignDriveFolderInput = {
  campaignId: string;
  driveCampaignFolderUrl?: string | null;
  driveCampaignFolderId?: string | null;
};

export type UpdateCampaignDriveOutputFoldersInput = {
  campaignId: string;
  driveFinalVideosFolderId?: string | null;
  driveMetricoolFolderId?: string | null;
};

export type UpdateCampaignMetricoolSheetInput = {
  campaignId: string;
  metricoolSheetId?: string | null;
  metricoolSheetUrl?: string | null;
  metricoolSheetUpdatedAt?: string | null;
};

export type CreateCampaignInput = {
  name: string;
  slug?: string | null;
  description?: string | null;
  bookId?: string | null;
  layoutId?: string | null;
  goal?: string | null;
  driveFolderUrl?: string | null;
  driveCampaignFolderUrl?: string | null;
  driveCampaignFolderId?: string | null;
  hooksSheetUrl?: string | null;
};

export type CreateRenderBatchInput = {
  campaignId: string;
  name: string;
  layoutId?: string | null;
  caption?: string | null;
  status?: RenderBatchStatus;
};

export type UpdateRenderBatchInput = {
  campaignId: string;
  batchId: string;
  name?: string;
  layoutId?: string | null;
  caption?: string | null;
};

export type UpdateRenderBatchStatusInput = {
  campaignId: string;
  batchId: string;
  status: RenderBatchStatus;
};

export type UpdateRenderBatchSelectionsInput = {
  campaignId: string;
  batchId: string;
  assetIds: string[];
};

export type RenderBatchAudioDurationOverrideInput = {
  audioId: string;
  renderDurationSeconds?: number | null;
};

export type UpdateRenderBatchAudioSelectionsInput =
  UpdateRenderBatchSelectionsInput & {
    durationOverrides?: RenderBatchAudioDurationOverrideInput[];
  };

export type RenderBatchMatrixStats = {
  screenshotCount: number;
  hookCount: number;
  backgroundCount: number;
  audioCount: number;
  captionCount: number;
  hashtagCount: number;
  thumbnailCount: number;
  previewCount: number;
};

export type CreateAuthorInput = {
  name: string;
};

export type UpdateAuthorDriveFolderInput = {
  authorId: string;
  driveFolderUrl?: string | null;
  driveFolderId?: string | null;
};

export type CreateSeriesInput = {
  authorId: string;
  name: string;
};

export type CreateBookInput = {
  authorId: string;
  seriesId?: string | null;
  slug?: string | null;
  title: string;
  description?: string | null;
  coverFilepath?: string | null;
  manuscriptFilepath?: string | null;
  driveFolderUrl?: string | null;
  driveFolderId?: string | null;
  hooksSheetUrl?: string | null;
  hooksSheetId?: string | null;
  captionsSheetUrl?: string | null;
  captionsSheetId?: string | null;
  hashtagsSheetUrl?: string | null;
  hashtagsSheetId?: string | null;
};

export type UpdateBookDetailsInput = {
  bookId: string;
  title: string;
  seriesId?: string | null;
  description?: string | null;
  coverFilepath?: string | null;
  manuscriptFilepath?: string | null;
  driveFolderUrl?: string | null;
  driveFolderId?: string | null;
  hooksSheetUrl?: string | null;
  hooksSheetId?: string | null;
  captionsSheetUrl?: string | null;
  captionsSheetId?: string | null;
  hashtagsSheetUrl?: string | null;
  hashtagsSheetId?: string | null;
};

export type CreateBookTropesInput = {
  bookId: string;
  tropes: string[];
};

export type CreateBookScreenshotInput = {
  bookId: string;
  filename: string;
  filepath: string;
  googleFileId?: string | null;
  sourceUrl?: string | null;
};

export type CreateBookBackgroundInput = {
  bookId: string;
  filename: string;
  filepath: string;
  googleFileId?: string | null;
  durationSeconds?: number | null;
};

export type CreateBookThumbnailInput = {
  bookId: string;
  filename: string;
  filepath: string;
  googleFileId?: string | null;
  driveUrl?: string | null;
};

export type BackgroundAsset = {
  id: string;
  campaign_id: string;
  google_file_id: string | null;
  filename: string;
  filepath: string;
  duration_seconds: number | null;
  created_at: string;
};

export type ScreenshotAsset = {
  id: string;
  campaign_id: string;
  google_file_id: string | null;
  source_url: string | null;
  filename: string;
  filepath: string;
  created_at: string;
};

export type Hook = {
  id: string;
  campaign_id: string;
  screenshot_id: string;
  text: string;
  source_row_number: number | null;
  created_at: string;
};

export type AudioAsset = {
  id: string;
  campaign_id: string | null;
  title: string;
  source_url: string | null;
  music_id: string | null;
  filename: string;
  filepath: string;
  duration_seconds: number | null;
  notes: string | null;
  created_at: string;
  tags: string[];
};

export type AudioReferenceCounts = {
  renderJobCount: number;
  campaignSelectionCount: number;
};

export type RenderJob = {
  id: string;
  campaign_id: string;
  batch_id: string | null;
  background_id: string;
  screenshot_id: string;
  hook_id: string;
  audio_id: string | null;
  thumbnail_id: string | null;
  thumbnail_drive_url: string | null;
  render_duration_seconds: number | null;
  audio_start_offset_seconds: number | null;
  render_options_json: string | null;
  background_source: "campaign" | "book";
  screenshot_source: "campaign" | "book";
  hook_source: "campaign" | "book";
  caption: string;
  output_filename: string | null;
  output_filepath: string | null;
  drive_file_id: string | null;
  drive_url: string | null;
  status: RenderJobStatus;
  error: string | null;
  created_at: string;
  updated_at: string;
};

export type RenderJobListItem = RenderJob & {
  background_filename: string;
  background_filepath: string;
  screenshot_filename: string;
  screenshot_filepath: string;
  hook_text: string;
  batch_caption: string | null;
  audio_title: string | null;
  audio_filepath: string | null;
  thumbnail_filename: string | null;
  thumbnail_filepath: string | null;
};

export type RenderJobDetails = RenderJobListItem;

export type CompleteRenderJobInput = {
  jobId: string;
  outputFilename: string;
  outputFilepath: string;
};

export type UpdateRenderJobDriveFileInput = {
  jobId: string;
  driveFileId: string;
  driveUrl?: string | null;
};

export type CreateBackgroundAssetInput = {
  campaignId: string;
  filename: string;
  filepath: string;
  googleFileId?: string | null;
  durationSeconds?: number | null;
};

export type CreateScreenshotAssetInput = {
  campaignId: string;
  filename: string;
  filepath: string;
  googleFileId?: string | null;
  sourceUrl?: string | null;
};

export type CreateHooksInput = {
  campaignId: string;
  screenshotId: string;
  lines: string[];
};

export type CreateBookHooksInput = {
  bookId: string;
  screenshotId: string;
  lines: string[];
};

export type CreateBookHookInput = {
  bookId: string;
  screenshotId: string;
  text: string;
  sourceRowNumber?: number | null;
};

export type UpdateCampaignCaptionInput = {
  campaignId: string;
  defaultCaption: string;
};

export type CreateAudioAssetInput = {
  id?: string;
  campaignId?: string | null;
  title: string;
  sourceUrl?: string | null;
  musicId?: string | null;
  filename: string;
  filepath: string;
  durationSeconds?: number | null;
  notes?: string | null;
};

export type GenerateRenderJobsInput = {
  campaignId: string;
  audioId?: string | null;
};

export type GenerateRenderJobsResult = {
  previewCount: number;
  createdCount: number;
  skippedDuplicateCount: number;
};

export type GenerateRenderJobsOptions = {
  allowLargeBatch?: boolean;
};

export const renderJobStatuses = [
  "pending",
  "running",
  "done",
  "failed",
] as const satisfies readonly RenderJobStatus[];

export const renderBatchStatuses = [
  "draft",
  "pending",
  "rendering",
  "done",
  "failed",
] as const satisfies readonly RenderBatchStatus[];

let database: Database.Database | undefined;

function columnExists(db: Database.Database, tableName: string, columnName: string) {
  return db
    .prepare(`PRAGMA table_info(${tableName})`)
    .all()
    .some((column) => (column as { name: string }).name === columnName);
}

function addColumnIfMissing(
  db: Database.Database,
  tableName: string,
  columnName: string,
  definition: string,
) {
  if (!columnExists(db, tableName, columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

function renderJobsHasLegacyAssetForeignKeys(db: Database.Database) {
  return db
    .prepare("PRAGMA foreign_key_list(render_jobs)")
    .all()
    .some((foreignKey) =>
      ["background_assets", "screenshot_assets", "hooks"].includes(
        (foreignKey as { table: string }).table,
      ),
    );
}

function createRenderJobIndexes(db: Database.Database) {
  db.exec("DROP INDEX IF EXISTS idx_render_jobs_matrix;");
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_render_jobs_campaign_status
      ON render_jobs (campaign_id, status);

    CREATE INDEX IF NOT EXISTS idx_render_jobs_batch_id
      ON render_jobs (batch_id);

    CREATE INDEX IF NOT EXISTS idx_render_jobs_background_id
      ON render_jobs (background_id);

    CREATE INDEX IF NOT EXISTS idx_render_jobs_screenshot_id
      ON render_jobs (screenshot_id);

    CREATE INDEX IF NOT EXISTS idx_render_jobs_hook_id
      ON render_jobs (hook_id);

    CREATE INDEX IF NOT EXISTS idx_render_jobs_audio_id
      ON render_jobs (audio_id);

    CREATE INDEX IF NOT EXISTS idx_render_jobs_thumbnail_id
      ON render_jobs (thumbnail_id);

    CREATE INDEX IF NOT EXISTS idx_render_jobs_thumbnail_id
      ON render_jobs (thumbnail_id);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_render_jobs_legacy_matrix
      ON render_jobs (
        campaign_id,
        background_id,
        screenshot_id,
        hook_id,
        COALESCE(audio_id, '')
      )
      WHERE batch_id IS NULL;

    CREATE UNIQUE INDEX IF NOT EXISTS idx_render_jobs_batch_matrix
      ON render_jobs (
        batch_id,
        background_id,
        screenshot_id,
        hook_id,
        COALESCE(audio_id, '')
      )
      WHERE batch_id IS NOT NULL;
  `);
}

function rebuildRenderJobsForAssetSources(db: Database.Database) {
  if (!renderJobsHasLegacyAssetForeignKeys(db)) {
    return;
  }

  const previousForeignKeys = db.pragma("foreign_keys", {
    simple: true,
  }) as number;

  try {
    db.pragma("foreign_keys = OFF");
    db.exec(`
      CREATE TABLE IF NOT EXISTS render_jobs_new (
        id TEXT PRIMARY KEY,
        campaign_id TEXT NOT NULL,
        batch_id TEXT,
        background_id TEXT NOT NULL,
        screenshot_id TEXT NOT NULL,
        hook_id TEXT NOT NULL,
        audio_id TEXT,
        thumbnail_id TEXT,
        thumbnail_drive_url TEXT,
        render_duration_seconds REAL,
        audio_start_offset_seconds REAL,
        render_options_json TEXT,
        background_source TEXT NOT NULL DEFAULT 'campaign',
        screenshot_source TEXT NOT NULL DEFAULT 'campaign',
        hook_source TEXT NOT NULL DEFAULT 'campaign',
        caption TEXT NOT NULL,
        output_filename TEXT,
        output_filepath TEXT,
        drive_file_id TEXT,
        drive_url TEXT,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'done', 'failed')),
        error TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (campaign_id) REFERENCES campaigns (id) ON DELETE CASCADE,
        FOREIGN KEY (batch_id) REFERENCES render_batches (id) ON DELETE SET NULL,
        FOREIGN KEY (audio_id) REFERENCES audio_assets (id) ON DELETE SET NULL
      );

      INSERT INTO render_jobs_new (
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
        output_filename,
        output_filepath,
        drive_file_id,
        drive_url,
        status,
        error,
        created_at,
        updated_at
      )
      SELECT
        id,
        campaign_id,
        batch_id,
        background_id,
        screenshot_id,
        hook_id,
        audio_id,
        thumbnail_id,
        thumbnail_drive_url,
        NULL,
        NULL,
        NULL,
        COALESCE(background_source, 'campaign'),
        COALESCE(screenshot_source, 'campaign'),
        COALESCE(hook_source, 'campaign'),
        caption,
        output_filename,
        output_filepath,
        drive_file_id,
        drive_url,
        status,
        error,
        created_at,
        updated_at
      FROM render_jobs;

      DROP TABLE render_jobs;
      ALTER TABLE render_jobs_new RENAME TO render_jobs;
    `);
  } finally {
    db.pragma(`foreign_keys = ${previousForeignKeys ? "ON" : "OFF"}`);
  }

  createRenderJobIndexes(db);
}

export function getDatabase() {
  if (!database) {
    fs.mkdirSync(paths.dataDirectory, { recursive: true });
    database = new Database(paths.sqliteDatabaseFile);
    database.pragma("foreign_keys = ON");
  }

  return database;
}

export function initializeDatabase(db = getDatabase()) {
  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS authors (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT,
      drive_folder_url TEXT,
      drive_folder_id TEXT,
      created_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS series (
      id TEXT PRIMARY KEY,
      author_id TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at INTEGER,
      FOREIGN KEY (author_id) REFERENCES authors (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS books (
      id TEXT PRIMARY KEY,
      author_id TEXT NOT NULL,
      series_id TEXT,
      slug TEXT,
      title TEXT NOT NULL,
      description TEXT,
      cover_filepath TEXT,
      manuscript_filepath TEXT,
      drive_folder_url TEXT,
      drive_folder_id TEXT,
      hooks_sheet_url TEXT,
      hooks_sheet_id TEXT,
      captions_sheet_url TEXT,
      captions_sheet_id TEXT,
      hashtags_sheet_url TEXT,
      hashtags_sheet_id TEXT,
      created_at INTEGER,
      FOREIGN KEY (author_id) REFERENCES authors (id) ON DELETE CASCADE,
      FOREIGN KEY (series_id) REFERENCES series (id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS book_screenshots (
      id TEXT PRIMARY KEY,
      book_id TEXT NOT NULL,
      google_file_id TEXT,
      source_url TEXT,
      filename TEXT NOT NULL,
      filepath TEXT NOT NULL,
      created_at INTEGER,
      FOREIGN KEY (book_id) REFERENCES books (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS book_hooks (
      id TEXT PRIMARY KEY,
      book_id TEXT NOT NULL,
      screenshot_id TEXT NOT NULL,
      text TEXT NOT NULL,
      source_row_number INTEGER,
      created_at INTEGER,
      FOREIGN KEY (book_id) REFERENCES books (id) ON DELETE CASCADE,
      FOREIGN KEY (screenshot_id) REFERENCES book_screenshots (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS book_backgrounds (
      id TEXT PRIMARY KEY,
      book_id TEXT NOT NULL,
      google_file_id TEXT,
      filename TEXT NOT NULL,
      filepath TEXT NOT NULL,
      duration_seconds REAL,
      created_at INTEGER,
      FOREIGN KEY (book_id) REFERENCES books (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS book_thumbnails (
      id TEXT PRIMARY KEY,
      book_id TEXT NOT NULL,
      google_file_id TEXT,
      filename TEXT NOT NULL,
      filepath TEXT NOT NULL,
      drive_url TEXT,
      created_at INTEGER,
      FOREIGN KEY (book_id) REFERENCES books (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS book_tropes (
      id TEXT PRIMARY KEY,
      book_id TEXT NOT NULL,
      trope TEXT NOT NULL,
      created_at INTEGER,
      FOREIGN KEY (book_id) REFERENCES books (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS book_captions (
      id TEXT PRIMARY KEY,
      book_id TEXT NOT NULL,
      text TEXT NOT NULL,
      source_row_number INTEGER,
      created_at INTEGER,
      FOREIGN KEY (book_id) REFERENCES books (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS book_hashtags (
      id TEXT PRIMARY KEY,
      book_id TEXT NOT NULL,
      original_text TEXT,
      hashtag TEXT NOT NULL,
      source_row_number INTEGER,
      created_at INTEGER,
      FOREIGN KEY (book_id) REFERENCES books (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS layouts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      description TEXT,
      created_at INTEGER
    );

    INSERT OR IGNORE INTO layouts (
      id,
      name,
      type,
      description
    )
    VALUES (
      'default_video_layout',
      'Default Video Layout',
      'video',
      'Current vertical video layout using background, screenshot, hook text and audio'
    );

    CREATE TABLE IF NOT EXISTS campaigns (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT,
      description TEXT,
      book_id TEXT,
      layout_id TEXT,
      goal TEXT,
      drive_folder_url TEXT,
      drive_folder_id TEXT,
      drive_campaign_folder_url TEXT,
      drive_campaign_folder_id TEXT,
      drive_final_videos_folder_id TEXT,
      drive_metricool_folder_id TEXT,
      metricool_sheet_id TEXT,
      metricool_sheet_url TEXT,
      metricool_sheet_updated_at TEXT,
      hooks_sheet_url TEXT,
      default_caption TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (book_id) REFERENCES books (id) ON DELETE SET NULL,
      FOREIGN KEY (layout_id) REFERENCES layouts (id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS background_assets (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      google_file_id TEXT,
      filename TEXT NOT NULL,
      filepath TEXT NOT NULL,
      duration_seconds REAL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (campaign_id) REFERENCES campaigns (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS screenshot_assets (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      google_file_id TEXT,
      source_url TEXT,
      filename TEXT NOT NULL,
      filepath TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (campaign_id) REFERENCES campaigns (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS hooks (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      screenshot_id TEXT NOT NULL,
      text TEXT NOT NULL,
      source_row_number INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (campaign_id) REFERENCES campaigns (id) ON DELETE CASCADE,
      FOREIGN KEY (screenshot_id) REFERENCES screenshot_assets (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS audio_assets (
      id TEXT PRIMARY KEY,
      campaign_id TEXT,
      title TEXT NOT NULL,
      source_url TEXT,
      music_id TEXT,
      filename TEXT NOT NULL,
      filepath TEXT NOT NULL,
      duration_seconds REAL,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (campaign_id) REFERENCES campaigns (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS audio_tags (
      id TEXT PRIMARY KEY,
      audio_id TEXT NOT NULL,
      tag TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (audio_id) REFERENCES audio_assets (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS render_jobs (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      batch_id TEXT,
      background_id TEXT NOT NULL,
      screenshot_id TEXT NOT NULL,
      hook_id TEXT NOT NULL,
      audio_id TEXT,
      thumbnail_id TEXT,
      thumbnail_drive_url TEXT,
      render_duration_seconds REAL,
      audio_start_offset_seconds REAL,
      render_options_json TEXT,
      caption TEXT NOT NULL,
      output_filename TEXT,
      output_filepath TEXT,
      drive_file_id TEXT,
      drive_url TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'done', 'failed')),
      error TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (campaign_id) REFERENCES campaigns (id) ON DELETE CASCADE,
      FOREIGN KEY (batch_id) REFERENCES render_batches (id) ON DELETE SET NULL,
      FOREIGN KEY (background_id) REFERENCES background_assets (id) ON DELETE CASCADE,
      FOREIGN KEY (screenshot_id) REFERENCES screenshot_assets (id) ON DELETE CASCADE,
      FOREIGN KEY (hook_id) REFERENCES hooks (id) ON DELETE CASCADE,
      FOREIGN KEY (audio_id) REFERENCES audio_assets (id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS metricool_rows (
      id TEXT PRIMARY KEY,
      render_job_id TEXT NOT NULL,
      video_url TEXT NOT NULL,
      caption TEXT NOT NULL,
      exported_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (render_job_id) REFERENCES render_jobs (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS drive_video_upload_queue (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      render_job_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'done', 'failed')),
      attempts INTEGER NOT NULL DEFAULT 0,
      error TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (campaign_id) REFERENCES campaigns (id) ON DELETE CASCADE,
      FOREIGN KEY (render_job_id) REFERENCES render_jobs (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS campaign_screenshot_selections (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      screenshot_id TEXT NOT NULL,
      created_at INTEGER,
      FOREIGN KEY (campaign_id) REFERENCES campaigns (id) ON DELETE CASCADE,
      FOREIGN KEY (screenshot_id) REFERENCES book_screenshots (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS campaign_background_selections (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      background_id TEXT NOT NULL,
      created_at INTEGER,
      FOREIGN KEY (campaign_id) REFERENCES campaigns (id) ON DELETE CASCADE,
      FOREIGN KEY (background_id) REFERENCES book_backgrounds (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS campaign_audio_selections (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      audio_id TEXT NOT NULL,
      created_at INTEGER,
      FOREIGN KEY (campaign_id) REFERENCES campaigns (id) ON DELETE CASCADE,
      FOREIGN KEY (audio_id) REFERENCES audio_assets (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS render_batches (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      name TEXT NOT NULL,
      layout_id TEXT,
      caption TEXT,
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending', 'rendering', 'done', 'failed')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (campaign_id) REFERENCES campaigns (id) ON DELETE CASCADE,
      FOREIGN KEY (layout_id) REFERENCES layouts (id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS render_batch_screenshot_selections (
      id TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL,
      screenshot_id TEXT NOT NULL,
      created_at INTEGER,
      FOREIGN KEY (batch_id) REFERENCES render_batches (id) ON DELETE CASCADE,
      FOREIGN KEY (screenshot_id) REFERENCES book_screenshots (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS render_batch_hook_selections (
      id TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL,
      hook_id TEXT NOT NULL,
      created_at INTEGER,
      FOREIGN KEY (batch_id) REFERENCES render_batches (id) ON DELETE CASCADE,
      FOREIGN KEY (hook_id) REFERENCES book_hooks (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS render_batch_background_selections (
      id TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL,
      background_id TEXT NOT NULL,
      created_at INTEGER,
      FOREIGN KEY (batch_id) REFERENCES render_batches (id) ON DELETE CASCADE,
      FOREIGN KEY (background_id) REFERENCES book_backgrounds (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS render_batch_audio_selections (
      id TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL,
      audio_id TEXT NOT NULL,
      render_duration_seconds REAL,
      created_at INTEGER,
      FOREIGN KEY (batch_id) REFERENCES render_batches (id) ON DELETE CASCADE,
      FOREIGN KEY (audio_id) REFERENCES audio_assets (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS render_batch_caption_selections (
      id TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL,
      caption_id TEXT NOT NULL,
      created_at INTEGER,
      FOREIGN KEY (batch_id) REFERENCES render_batches (id) ON DELETE CASCADE,
      FOREIGN KEY (caption_id) REFERENCES book_captions (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS render_batch_hashtag_selections (
      id TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL,
      hashtag_id TEXT NOT NULL,
      created_at INTEGER,
      FOREIGN KEY (batch_id) REFERENCES render_batches (id) ON DELETE CASCADE,
      FOREIGN KEY (hashtag_id) REFERENCES book_hashtags (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS render_batch_thumbnail_selections (
      id TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL,
      thumbnail_id TEXT NOT NULL,
      created_at INTEGER,
      FOREIGN KEY (batch_id) REFERENCES render_batches (id) ON DELETE CASCADE,
      FOREIGN KEY (thumbnail_id) REFERENCES book_thumbnails (id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_campaigns_created_at
      ON campaigns (created_at);

    CREATE INDEX IF NOT EXISTS idx_authors_name
      ON authors (name);

    CREATE INDEX IF NOT EXISTS idx_series_author_id
      ON series (author_id);

    CREATE INDEX IF NOT EXISTS idx_series_author_name
      ON series (author_id, name);

    CREATE INDEX IF NOT EXISTS idx_books_author_id
      ON books (author_id);

    CREATE INDEX IF NOT EXISTS idx_books_series_id
      ON books (series_id);

    CREATE INDEX IF NOT EXISTS idx_books_title
      ON books (title);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_books_drive_folder_id
      ON books (drive_folder_id)
      WHERE drive_folder_id IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_book_screenshots_book_id
      ON book_screenshots (book_id);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_book_screenshots_google_file_id
      ON book_screenshots (book_id, google_file_id)
      WHERE google_file_id IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_book_hooks_book_id
      ON book_hooks (book_id);

    CREATE INDEX IF NOT EXISTS idx_book_hooks_screenshot_id
      ON book_hooks (screenshot_id);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_book_hooks_source_row
      ON book_hooks (book_id, source_row_number)
      WHERE source_row_number IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_book_backgrounds_book_id
      ON book_backgrounds (book_id);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_book_backgrounds_google_file_id
      ON book_backgrounds (book_id, google_file_id)
      WHERE google_file_id IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_book_thumbnails_book_id
      ON book_thumbnails (book_id);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_book_thumbnails_google_file_id
      ON book_thumbnails (book_id, google_file_id)
      WHERE google_file_id IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_book_tropes_book_id
      ON book_tropes (book_id);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_book_tropes_book_trope
      ON book_tropes (book_id, trope);

    CREATE INDEX IF NOT EXISTS idx_book_captions_book_id
      ON book_captions (book_id);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_book_captions_book_text
      ON book_captions (book_id, text);

    CREATE INDEX IF NOT EXISTS idx_book_hashtags_book_id
      ON book_hashtags (book_id);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_book_hashtags_book_hashtag
      ON book_hashtags (book_id, hashtag);

    CREATE INDEX IF NOT EXISTS idx_layouts_type
      ON layouts (type);

    CREATE INDEX IF NOT EXISTS idx_background_assets_campaign_id
      ON background_assets (campaign_id);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_background_assets_google_file_id
      ON background_assets (campaign_id, google_file_id)
      WHERE google_file_id IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_screenshot_assets_campaign_id
      ON screenshot_assets (campaign_id);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_screenshot_assets_google_file_id
      ON screenshot_assets (campaign_id, google_file_id)
      WHERE google_file_id IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_hooks_campaign_id
      ON hooks (campaign_id);

    CREATE INDEX IF NOT EXISTS idx_hooks_screenshot_id
      ON hooks (screenshot_id);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_hooks_source_row
      ON hooks (campaign_id, source_row_number)
      WHERE source_row_number IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_audio_assets_campaign_id
      ON audio_assets (campaign_id);

    CREATE INDEX IF NOT EXISTS idx_audio_tags_audio_id
      ON audio_tags (audio_id);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_audio_tags_audio_tag
      ON audio_tags (audio_id, tag);

    CREATE INDEX IF NOT EXISTS idx_render_jobs_campaign_status
      ON render_jobs (campaign_id, status);

    CREATE INDEX IF NOT EXISTS idx_render_jobs_background_id
      ON render_jobs (background_id);

    CREATE INDEX IF NOT EXISTS idx_render_jobs_screenshot_id
      ON render_jobs (screenshot_id);

    CREATE INDEX IF NOT EXISTS idx_render_jobs_hook_id
      ON render_jobs (hook_id);

    CREATE INDEX IF NOT EXISTS idx_render_jobs_audio_id
      ON render_jobs (audio_id);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_render_jobs_legacy_matrix
      ON render_jobs (
        campaign_id,
        background_id,
        screenshot_id,
        hook_id,
        COALESCE(audio_id, '')
      )
      WHERE batch_id IS NULL;

    CREATE UNIQUE INDEX IF NOT EXISTS idx_render_jobs_batch_matrix
      ON render_jobs (
        batch_id,
        background_id,
        screenshot_id,
        hook_id,
        COALESCE(audio_id, '')
      )
      WHERE batch_id IS NOT NULL;

    CREATE UNIQUE INDEX IF NOT EXISTS idx_metricool_rows_render_job_id
      ON metricool_rows (render_job_id);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_drive_video_upload_queue_render_job_id
      ON drive_video_upload_queue (render_job_id);

    CREATE INDEX IF NOT EXISTS idx_drive_video_upload_queue_campaign_status
      ON drive_video_upload_queue (campaign_id, status);

    CREATE INDEX IF NOT EXISTS idx_drive_video_upload_queue_status_created
      ON drive_video_upload_queue (status, datetime(created_at));

    CREATE INDEX IF NOT EXISTS idx_campaign_screenshot_selections_campaign_id
      ON campaign_screenshot_selections (campaign_id);

    CREATE INDEX IF NOT EXISTS idx_campaign_screenshot_selections_screenshot_id
      ON campaign_screenshot_selections (screenshot_id);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_campaign_screenshot_selections_unique
      ON campaign_screenshot_selections (campaign_id, screenshot_id);

    CREATE INDEX IF NOT EXISTS idx_campaign_background_selections_campaign_id
      ON campaign_background_selections (campaign_id);

    CREATE INDEX IF NOT EXISTS idx_campaign_background_selections_background_id
      ON campaign_background_selections (background_id);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_campaign_background_selections_unique
      ON campaign_background_selections (campaign_id, background_id);

    CREATE INDEX IF NOT EXISTS idx_campaign_audio_selections_campaign_id
      ON campaign_audio_selections (campaign_id);

    CREATE INDEX IF NOT EXISTS idx_campaign_audio_selections_audio_id
      ON campaign_audio_selections (audio_id);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_campaign_audio_selections_unique
      ON campaign_audio_selections (campaign_id, audio_id);

    CREATE INDEX IF NOT EXISTS idx_render_batches_campaign_id
      ON render_batches (campaign_id);

    CREATE INDEX IF NOT EXISTS idx_render_batches_layout_id
      ON render_batches (layout_id);

    CREATE INDEX IF NOT EXISTS idx_render_batches_status
      ON render_batches (status);

    CREATE INDEX IF NOT EXISTS idx_render_batch_screenshot_selections_batch_id
      ON render_batch_screenshot_selections (batch_id);

    CREATE INDEX IF NOT EXISTS idx_render_batch_screenshot_selections_screenshot_id
      ON render_batch_screenshot_selections (screenshot_id);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_render_batch_screenshot_selections_unique
      ON render_batch_screenshot_selections (batch_id, screenshot_id);

    CREATE INDEX IF NOT EXISTS idx_render_batch_hook_selections_batch_id
      ON render_batch_hook_selections (batch_id);

    CREATE INDEX IF NOT EXISTS idx_render_batch_hook_selections_hook_id
      ON render_batch_hook_selections (hook_id);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_render_batch_hook_selections_unique
      ON render_batch_hook_selections (batch_id, hook_id);

    CREATE INDEX IF NOT EXISTS idx_render_batch_background_selections_batch_id
      ON render_batch_background_selections (batch_id);

    CREATE INDEX IF NOT EXISTS idx_render_batch_background_selections_background_id
      ON render_batch_background_selections (background_id);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_render_batch_background_selections_unique
      ON render_batch_background_selections (batch_id, background_id);

    CREATE INDEX IF NOT EXISTS idx_render_batch_audio_selections_batch_id
      ON render_batch_audio_selections (batch_id);

    CREATE INDEX IF NOT EXISTS idx_render_batch_audio_selections_audio_id
      ON render_batch_audio_selections (audio_id);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_render_batch_audio_selections_unique
      ON render_batch_audio_selections (batch_id, audio_id);

    CREATE INDEX IF NOT EXISTS idx_render_batch_caption_selections_batch_id
      ON render_batch_caption_selections (batch_id);

    CREATE INDEX IF NOT EXISTS idx_render_batch_caption_selections_caption_id
      ON render_batch_caption_selections (caption_id);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_render_batch_caption_selections_unique
      ON render_batch_caption_selections (batch_id, caption_id);

    CREATE INDEX IF NOT EXISTS idx_render_batch_hashtag_selections_batch_id
      ON render_batch_hashtag_selections (batch_id);

    CREATE INDEX IF NOT EXISTS idx_render_batch_hashtag_selections_hashtag_id
      ON render_batch_hashtag_selections (hashtag_id);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_render_batch_hashtag_selections_unique
      ON render_batch_hashtag_selections (batch_id, hashtag_id);

    CREATE INDEX IF NOT EXISTS idx_render_batch_thumbnail_selections_batch_id
      ON render_batch_thumbnail_selections (batch_id);

    CREATE INDEX IF NOT EXISTS idx_render_batch_thumbnail_selections_thumbnail_id
      ON render_batch_thumbnail_selections (thumbnail_id);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_render_batch_thumbnail_selections_unique
      ON render_batch_thumbnail_selections (batch_id, thumbnail_id);
  `);

  addColumnIfMissing(db, "campaigns", "book_id", "TEXT");
  addColumnIfMissing(db, "campaigns", "slug", "TEXT");
  addColumnIfMissing(db, "campaigns", "layout_id", "TEXT");
  addColumnIfMissing(db, "campaigns", "goal", "TEXT");
  addColumnIfMissing(db, "campaigns", "drive_campaign_folder_url", "TEXT");
  addColumnIfMissing(db, "campaigns", "drive_campaign_folder_id", "TEXT");
  addColumnIfMissing(db, "campaigns", "drive_final_videos_folder_id", "TEXT");
  addColumnIfMissing(db, "campaigns", "drive_metricool_folder_id", "TEXT");
  addColumnIfMissing(db, "campaigns", "metricool_sheet_id", "TEXT");
  addColumnIfMissing(db, "campaigns", "metricool_sheet_url", "TEXT");
  addColumnIfMissing(db, "campaigns", "metricool_sheet_updated_at", "TEXT");
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_campaigns_book_slug_unique
      ON campaigns (book_id, slug)
      WHERE book_id IS NOT NULL AND slug IS NOT NULL;
  `);
  addColumnIfMissing(db, "books", "manuscript_filepath", "TEXT");
  addColumnIfMissing(db, "authors", "slug", "TEXT");
  addColumnIfMissing(db, "authors", "drive_folder_url", "TEXT");
  addColumnIfMissing(db, "authors", "drive_folder_id", "TEXT");
  addColumnIfMissing(db, "books", "slug", "TEXT");
  addColumnIfMissing(db, "books", "hooks_sheet_url", "TEXT");
  addColumnIfMissing(db, "books", "hooks_sheet_id", "TEXT");
  addColumnIfMissing(db, "books", "captions_sheet_url", "TEXT");
  addColumnIfMissing(db, "books", "captions_sheet_id", "TEXT");
  addColumnIfMissing(db, "books", "hashtags_sheet_url", "TEXT");
  addColumnIfMissing(db, "books", "hashtags_sheet_id", "TEXT");
  backfillAuthorAndBookSlugs(db);
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_authors_slug_unique
      ON authors (slug)
      WHERE slug IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_books_author_slug_unique
      ON books (author_id, slug)
      WHERE slug IS NOT NULL;
  `);
  addColumnIfMissing(db, "render_jobs", "batch_id", "TEXT");
  addColumnIfMissing(db, "render_jobs", "thumbnail_id", "TEXT");
  addColumnIfMissing(db, "render_jobs", "thumbnail_drive_url", "TEXT");
  addColumnIfMissing(db, "render_jobs", "render_duration_seconds", "REAL");
  addColumnIfMissing(db, "render_jobs", "audio_start_offset_seconds", "REAL");
  addColumnIfMissing(db, "render_jobs", "render_options_json", "TEXT");
  addColumnIfMissing(
    db,
    "render_batch_audio_selections",
    "render_duration_seconds",
    "REAL",
  );
  addColumnIfMissing(
    db,
    "render_jobs",
    "background_source",
    "TEXT NOT NULL DEFAULT 'campaign'",
  );
  addColumnIfMissing(
    db,
    "render_jobs",
    "screenshot_source",
    "TEXT NOT NULL DEFAULT 'campaign'",
  );
  addColumnIfMissing(
    db,
    "render_jobs",
    "hook_source",
    "TEXT NOT NULL DEFAULT 'campaign'",
  );
  rebuildRenderJobsForAssetSources(db);
  createRenderJobIndexes(db);
}

function normalizeOptionalText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeOptionalRawText(value: string) {
  return value.length > 0 ? value : null;
}

function normalizeRenderDurationSeconds(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return null;
  }

  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }

  return Math.min(60, Math.max(1, Math.round(value * 100) / 100));
}

function uniqueSlugForExistingRows(
  baseSlug: string,
  existingSlugs: Set<string>,
) {
  let slug = baseSlug || "untitled";
  let suffix = 2;

  while (existingSlugs.has(slug)) {
    slug = `${baseSlug || "untitled"}-${suffix}`;
    suffix += 1;
  }

  existingSlugs.add(slug);
  return slug;
}

function backfillAuthorAndBookSlugs(db: Database.Database) {
  const authors = db
    .prepare(
      `
        SELECT id, name, slug
        FROM authors
        ORDER BY created_at ASC, id ASC
      `,
    )
    .all() as Array<{ id: string; name: string; slug: string | null }>;
  const authorSlugs = new Set(
    authors
      .map((author) => author.slug)
      .filter((slug): slug is string => Boolean(slug)),
  );
  const updateAuthorSlug = db.prepare(
    "UPDATE authors SET slug = ? WHERE id = ?",
  );

  for (const author of authors) {
    if (author.slug) {
      continue;
    }

    updateAuthorSlug.run(
      uniqueSlugForExistingRows(slugifyName(author.name), authorSlugs),
      author.id,
    );
  }

  const books = db
    .prepare(
      `
        SELECT id, author_id, title, slug
        FROM books
        ORDER BY created_at ASC, id ASC
      `,
    )
    .all() as Array<{
      id: string;
      author_id: string;
      title: string;
      slug: string | null;
    }>;
  const bookSlugsByAuthor = new Map<string, Set<string>>();
  const updateBookSlug = db.prepare("UPDATE books SET slug = ? WHERE id = ?");

  for (const book of books) {
    const slugs = bookSlugsByAuthor.get(book.author_id) ?? new Set<string>();

    if (!bookSlugsByAuthor.has(book.author_id)) {
      bookSlugsByAuthor.set(book.author_id, slugs);
    }

    if (book.slug) {
      slugs.add(book.slug);
      continue;
    }

    updateBookSlug.run(
      uniqueSlugForExistingRows(slugifyName(book.title), slugs),
      book.id,
    );
  }
}

export function createAuthor(input: CreateAuthorInput) {
  const name = input.name.trim();

  if (!name) {
    throw new Error("Author name is required.");
  }

  const db = getDatabase();
  initializeDatabase(db);

  const id = nanoid();
  const slug = slugifyName(name);

  if (!slug) {
    throw new Error("Author slug could not be generated.");
  }

  const existingAuthor = db
    .prepare("SELECT id FROM authors WHERE slug = ?")
    .get(slug);

  if (existingAuthor) {
    throw new Error("An author with this slug already exists.");
  }

  db.prepare(
    `
      INSERT INTO authors (
        id,
        name,
        slug,
        created_at
      )
      VALUES (
        @id,
        @name,
        @slug,
        unixepoch()
      )
    `,
  ).run({
    id,
    name,
    slug,
  });

  return id;
}

export function listAuthors() {
  const db = getDatabase();
  initializeDatabase(db);

  return db
    .prepare(
      `
        SELECT
          id,
          name,
          slug,
          drive_folder_url,
          drive_folder_id,
          created_at
        FROM authors
        ORDER BY name ASC, created_at DESC
      `,
    )
    .all() as Author[];
}

export function getAuthor(authorId: string) {
  const db = getDatabase();
  initializeDatabase(db);

  const author = db
    .prepare(
      `
        SELECT
          id,
          name,
          slug,
          drive_folder_url,
          drive_folder_id,
          created_at
        FROM authors
        WHERE id = ?
      `,
    )
    .get(authorId) as Author | undefined;

  return author ?? null;
}

export function updateAuthorDriveFolder(input: UpdateAuthorDriveFolderInput) {
  const existingAuthor = getAuthor(input.authorId);

  if (!existingAuthor) {
    throw new Error("Author not found.");
  }

  const db = getDatabase();
  initializeDatabase(db);

  const result = db
    .prepare(
      `
        UPDATE authors
        SET drive_folder_url = ?,
            drive_folder_id = ?
        WHERE id = ?
      `,
    )
    .run(
      input.driveFolderUrl === undefined
        ? existingAuthor.drive_folder_url
        : normalizeOptionalText(input.driveFolderUrl),
      input.driveFolderId === undefined
        ? existingAuthor.drive_folder_id
        : normalizeOptionalText(input.driveFolderId),
      input.authorId,
    );

  return result.changes > 0;
}

export function createSeries(input: CreateSeriesInput) {
  const name = input.name.trim();

  if (!name) {
    throw new Error("Series name is required.");
  }

  const db = getDatabase();
  initializeDatabase(db);

  const author = getAuthor(input.authorId);

  if (!author) {
    throw new Error("Author not found.");
  }

  const id = nanoid();

  db.prepare(
    `
      INSERT INTO series (
        id,
        author_id,
        name,
        created_at
      )
      VALUES (
        @id,
        @authorId,
        @name,
        unixepoch()
      )
    `,
  ).run({
    id,
    authorId: input.authorId,
    name,
  });

  return id;
}

export function listSeries() {
  const db = getDatabase();
  initializeDatabase(db);

  return db
    .prepare(
      `
        SELECT
          id,
          author_id,
          name,
          created_at
        FROM series
        ORDER BY name ASC, created_at DESC
      `,
    )
    .all() as Series[];
}

export function listSeriesByAuthor(authorId: string) {
  const db = getDatabase();
  initializeDatabase(db);

  return db
    .prepare(
      `
        SELECT
          id,
          author_id,
          name,
          created_at
        FROM series
        WHERE author_id = ?
        ORDER BY name ASC, created_at DESC
      `,
    )
    .all(authorId) as Series[];
}

export function getSeries(seriesId: string) {
  const db = getDatabase();
  initializeDatabase(db);

  const series = db
    .prepare(
      `
        SELECT
          id,
          author_id,
          name,
          created_at
        FROM series
        WHERE id = ?
      `,
    )
    .get(seriesId) as Series | undefined;

  return series ?? null;
}

export function deleteSeriesIfEmpty(authorId: string, seriesId: string) {
  const db = getDatabase();
  initializeDatabase(db);

  const series = getSeries(seriesId);

  if (!series || series.author_id !== authorId) {
    throw new Error("Series not found for this author.");
  }

  const bookCount = db
    .prepare(
      `
        SELECT COUNT(*) AS count
        FROM books
        WHERE series_id = ?
      `,
    )
    .get(seriesId) as { count: number };

  if (bookCount.count > 0) {
    throw new Error("Move or delete books in this series before deleting it.");
  }

  const result = db.prepare("DELETE FROM series WHERE id = ?").run(seriesId);

  return result.changes > 0;
}

function validateBookRelations(authorId: string, seriesId: string | null) {
  const author = getAuthor(authorId);

  if (!author) {
    throw new Error("Author not found.");
  }

  if (seriesId) {
    const series = getSeries(seriesId);

    if (!series || series.author_id !== authorId) {
      throw new Error("Series not found for this author.");
    }
  }
}

export function createBook(input: CreateBookInput) {
  const title = input.title.trim();

  if (!title) {
    throw new Error("Book title is required.");
  }

  const db = getDatabase();
  initializeDatabase(db);

  const seriesId = normalizeOptionalText(input.seriesId);
  validateBookRelations(input.authorId, seriesId);
  const slug = normalizeOptionalText(input.slug) ?? slugifyName(title);

  if (!slug) {
    throw new Error("Book slug could not be generated.");
  }

  const existingBook = db
    .prepare(
      `
        SELECT id
        FROM books
        WHERE author_id = ?
          AND slug = ?
      `,
    )
    .get(input.authorId, slug);

  if (existingBook) {
    throw new Error("A book with this slug already exists for this author.");
  }

  const id = nanoid();

  db.prepare(
    `
      INSERT INTO books (
        id,
        author_id,
        series_id,
        slug,
        title,
        description,
        cover_filepath,
        manuscript_filepath,
        drive_folder_url,
        drive_folder_id,
        hooks_sheet_url,
        hooks_sheet_id,
        captions_sheet_url,
        captions_sheet_id,
        hashtags_sheet_url,
        hashtags_sheet_id,
        created_at
      )
      VALUES (
        @id,
        @authorId,
        @seriesId,
        @slug,
        @title,
        @description,
        @coverFilepath,
        @manuscriptFilepath,
        @driveFolderUrl,
        @driveFolderId,
        @hooksSheetUrl,
        @hooksSheetId,
        @captionsSheetUrl,
        @captionsSheetId,
        @hashtagsSheetUrl,
        @hashtagsSheetId,
        unixepoch()
      )
    `,
  ).run({
    id,
    authorId: input.authorId,
    seriesId,
    slug,
    title,
    description: normalizeOptionalText(input.description),
    coverFilepath: normalizeOptionalText(input.coverFilepath),
    manuscriptFilepath: normalizeOptionalText(input.manuscriptFilepath),
    driveFolderUrl: normalizeOptionalText(input.driveFolderUrl),
    driveFolderId: normalizeOptionalText(input.driveFolderId),
    hooksSheetUrl: normalizeOptionalText(input.hooksSheetUrl),
    hooksSheetId: normalizeOptionalText(input.hooksSheetId),
    captionsSheetUrl: normalizeOptionalText(input.captionsSheetUrl),
    captionsSheetId: normalizeOptionalText(input.captionsSheetId),
    hashtagsSheetUrl: normalizeOptionalText(input.hashtagsSheetUrl),
    hashtagsSheetId: normalizeOptionalText(input.hashtagsSheetId),
  });

  return id;
}

export function listBooks() {
  const db = getDatabase();
  initializeDatabase(db);

  return db
    .prepare(
      `
        SELECT
          id,
          author_id,
          series_id,
          slug,
          title,
          description,
          cover_filepath,
          manuscript_filepath,
          drive_folder_url,
          drive_folder_id,
          hooks_sheet_url,
          hooks_sheet_id,
          captions_sheet_url,
          captions_sheet_id,
          hashtags_sheet_url,
          hashtags_sheet_id,
          created_at
        FROM books
        ORDER BY title ASC, created_at DESC
      `,
    )
    .all() as Book[];
}

export function getBook(bookId: string) {
  const db = getDatabase();
  initializeDatabase(db);

  const book = db
    .prepare(
      `
        SELECT
          id,
          author_id,
          series_id,
          slug,
          title,
          description,
          cover_filepath,
          manuscript_filepath,
          drive_folder_url,
          drive_folder_id,
          hooks_sheet_url,
          hooks_sheet_id,
          captions_sheet_url,
          captions_sheet_id,
          hashtags_sheet_url,
          hashtags_sheet_id,
          created_at
        FROM books
        WHERE id = ?
      `,
    )
    .get(bookId) as Book | undefined;

  return book ?? null;
}

export function listBooksByAuthor(authorId: string) {
  const db = getDatabase();
  initializeDatabase(db);

  return db
    .prepare(
      `
        SELECT
          id,
          author_id,
          series_id,
          slug,
          title,
          description,
          cover_filepath,
          manuscript_filepath,
          drive_folder_url,
          drive_folder_id,
          hooks_sheet_url,
          hooks_sheet_id,
          captions_sheet_url,
          captions_sheet_id,
          hashtags_sheet_url,
          hashtags_sheet_id,
          created_at
        FROM books
        WHERE author_id = ?
        ORDER BY title ASC, created_at DESC
      `,
    )
    .all(authorId) as Book[];
}

export function listBooksBySeries(seriesId: string) {
  const db = getDatabase();
  initializeDatabase(db);

  return db
    .prepare(
      `
        SELECT
          id,
          author_id,
          series_id,
          slug,
          title,
          description,
          cover_filepath,
          manuscript_filepath,
          drive_folder_url,
          drive_folder_id,
          hooks_sheet_url,
          hooks_sheet_id,
          captions_sheet_url,
          captions_sheet_id,
          hashtags_sheet_url,
          hashtags_sheet_id,
          created_at
        FROM books
        WHERE series_id = ?
        ORDER BY title ASC, created_at DESC
      `,
    )
    .all(seriesId) as Book[];
}

export function updateBookDetails(input: UpdateBookDetailsInput) {
  const title = input.title.trim();

  if (!title) {
    throw new Error("Book title is required.");
  }

  const db = getDatabase();
  initializeDatabase(db);

  const existingBook = getBook(input.bookId);

  if (!existingBook) {
    throw new Error("Book not found.");
  }

  const seriesId =
    input.seriesId === undefined
      ? existingBook.series_id
      : normalizeOptionalText(input.seriesId);

  validateBookRelations(existingBook.author_id, seriesId);

  const result = db
    .prepare(
      `
        UPDATE books
        SET title = ?,
            series_id = ?,
            description = ?,
            cover_filepath = ?,
            manuscript_filepath = ?,
            drive_folder_url = ?,
            drive_folder_id = ?,
            hooks_sheet_url = ?,
            hooks_sheet_id = ?,
            captions_sheet_url = ?,
            captions_sheet_id = ?,
            hashtags_sheet_url = ?,
            hashtags_sheet_id = ?
        WHERE id = ?
      `,
    )
    .run(
      title,
      seriesId,
      normalizeOptionalText(input.description),
      input.coverFilepath === undefined
        ? existingBook.cover_filepath
        : normalizeOptionalText(input.coverFilepath),
      input.manuscriptFilepath === undefined
        ? existingBook.manuscript_filepath
        : normalizeOptionalText(input.manuscriptFilepath),
      input.driveFolderUrl === undefined
        ? existingBook.drive_folder_url
        : normalizeOptionalText(input.driveFolderUrl),
      input.driveFolderId === undefined
        ? existingBook.drive_folder_id
        : normalizeOptionalText(input.driveFolderId),
      input.hooksSheetUrl === undefined
        ? existingBook.hooks_sheet_url
        : normalizeOptionalText(input.hooksSheetUrl),
      input.hooksSheetId === undefined
        ? existingBook.hooks_sheet_id
        : normalizeOptionalText(input.hooksSheetId),
      input.captionsSheetUrl === undefined
        ? existingBook.captions_sheet_url
        : normalizeOptionalText(input.captionsSheetUrl),
      input.captionsSheetId === undefined
        ? existingBook.captions_sheet_id
        : normalizeOptionalText(input.captionsSheetId),
      input.hashtagsSheetUrl === undefined
        ? existingBook.hashtags_sheet_url
        : normalizeOptionalText(input.hashtagsSheetUrl),
      input.hashtagsSheetId === undefined
        ? existingBook.hashtags_sheet_id
        : normalizeOptionalText(input.hashtagsSheetId),
      input.bookId,
    );

  return result.changes > 0;
}

export function clearBookImportedAssets(bookId: string) {
  const db = getDatabase();
  initializeDatabase(db);

  const clear = db.transaction(() => {
    db.prepare(
      `
        DELETE FROM campaign_screenshot_selections
        WHERE screenshot_id IN (
          SELECT id FROM book_screenshots WHERE book_id = ?
        )
      `,
    ).run(bookId);

    db.prepare(
      `
        DELETE FROM campaign_background_selections
        WHERE background_id IN (
          SELECT id FROM book_backgrounds WHERE book_id = ?
        )
      `,
    ).run(bookId);

    db.prepare(
      `
        DELETE FROM render_batch_screenshot_selections
        WHERE screenshot_id IN (
          SELECT id FROM book_screenshots WHERE book_id = ?
        )
      `,
    ).run(bookId);

    db.prepare(
      `
        DELETE FROM render_batch_hook_selections
        WHERE hook_id IN (
          SELECT id FROM book_hooks WHERE book_id = ?
        )
      `,
    ).run(bookId);

    db.prepare(
      `
        DELETE FROM render_batch_background_selections
        WHERE background_id IN (
          SELECT id FROM book_backgrounds WHERE book_id = ?
        )
      `,
    ).run(bookId);

    db.prepare(
      `
        DELETE FROM render_batch_caption_selections
        WHERE caption_id IN (
          SELECT id FROM book_captions WHERE book_id = ?
        )
      `,
    ).run(bookId);

    db.prepare(
      `
        DELETE FROM render_batch_hashtag_selections
        WHERE hashtag_id IN (
          SELECT id FROM book_hashtags WHERE book_id = ?
        )
      `,
    ).run(bookId);

    db.prepare(
      `
        DELETE FROM render_batch_thumbnail_selections
        WHERE thumbnail_id IN (
          SELECT id FROM book_thumbnails WHERE book_id = ?
        )
      `,
    ).run(bookId);

    db.prepare("DELETE FROM book_hooks WHERE book_id = ?").run(bookId);
    db.prepare("DELETE FROM book_screenshots WHERE book_id = ?").run(bookId);
    db.prepare("DELETE FROM book_backgrounds WHERE book_id = ?").run(bookId);
    db.prepare("DELETE FROM book_thumbnails WHERE book_id = ?").run(bookId);
    db.prepare("DELETE FROM book_captions WHERE book_id = ?").run(bookId);
    db.prepare("DELETE FROM book_hashtags WHERE book_id = ?").run(bookId);
  });

  clear();
}

export function createBookTropes(input: CreateBookTropesInput) {
  const tropes = input.tropes
    .map((trope) => trope.trim())
    .filter((trope) => trope.length > 0);

  if (tropes.length === 0) {
    return 0;
  }

  const book = getBook(input.bookId);

  if (!book) {
    throw new Error("Book not found.");
  }

  const db = getDatabase();
  initializeDatabase(db);

  const insertTrope = db.prepare(
    `
      INSERT OR IGNORE INTO book_tropes (
        id,
        book_id,
        trope,
        created_at
      )
      VALUES (
        @id,
        @bookId,
        @trope,
        unixepoch()
      )
    `,
  );

  const insertMany = db.transaction((tropeValues: string[]) => {
    let createdCount = 0;

    for (const trope of tropeValues) {
      const result = insertTrope.run({
        id: nanoid(),
        bookId: input.bookId,
        trope,
      });

      createdCount += result.changes;
    }

    return createdCount;
  });

  return insertMany(tropes);
}

export function replaceBookTropes(input: CreateBookTropesInput) {
  const tropes = input.tropes
    .map((trope) => trope.trim())
    .filter((trope) => trope.length > 0);
  const book = getBook(input.bookId);

  if (!book) {
    throw new Error("Book not found.");
  }

  const db = getDatabase();
  initializeDatabase(db);

  const replaceMany = db.transaction((tropeValues: string[]) => {
    db.prepare("DELETE FROM book_tropes WHERE book_id = ?").run(input.bookId);

    if (tropeValues.length === 0) {
      return 0;
    }

    const insertTrope = db.prepare(
      `
        INSERT INTO book_tropes (
          id,
          book_id,
          trope,
          created_at
        )
        VALUES (
          @id,
          @bookId,
          @trope,
          unixepoch()
        )
      `,
    );

    for (const trope of tropeValues) {
      insertTrope.run({
        id: nanoid(),
        bookId: input.bookId,
        trope,
      });
    }

    return tropeValues.length;
  });

  return replaceMany(tropes);
}

export function listBookTropes(bookId: string) {
  const db = getDatabase();
  initializeDatabase(db);

  return db
    .prepare(
      `
        SELECT
          id,
          book_id,
          trope,
          created_at
        FROM book_tropes
        WHERE book_id = ?
        ORDER BY trope ASC, created_at DESC
      `,
    )
    .all(bookId) as BookTrope[];
}

export function createBookCaption(input: {
  bookId: string;
  text: string;
  sourceRowNumber?: number | null;
}) {
  const text = normalizeCaptionAssetText(input.text);

  if (!text) {
    return false;
  }

  const book = getBook(input.bookId);

  if (!book) {
    throw new Error("Book not found.");
  }

  const db = getDatabase();
  initializeDatabase(db);
  const result = db
    .prepare(
      `
        INSERT OR IGNORE INTO book_captions (
          id,
          book_id,
          text,
          source_row_number,
          created_at
        )
        VALUES (?, ?, ?, ?, unixepoch())
      `,
    )
    .run(nanoid(), input.bookId, text, input.sourceRowNumber ?? null);

  return result.changes > 0;
}

function normalizeCaptionAssetText(value: string | null | undefined) {
  const text = normalizeOptionalRawText(value ?? "") ?? "";

  return stripWrappingQuotes(text);
}

function stripWrappingQuotes(value: string) {
  const trimmed = value.trim();

  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1).trim();
  }

  return trimmed;
}

export function createBookHashtag(input: {
  bookId: string;
  originalText?: string | null;
  hashtag: string;
  sourceRowNumber?: number | null;
}) {
  const hashtag = input.hashtag.trim();

  if (!hashtag) {
    return false;
  }

  const book = getBook(input.bookId);

  if (!book) {
    throw new Error("Book not found.");
  }

  const db = getDatabase();
  initializeDatabase(db);
  const result = db
    .prepare(
      `
        INSERT OR IGNORE INTO book_hashtags (
          id,
          book_id,
          original_text,
          hashtag,
          source_row_number,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, unixepoch())
      `,
    )
    .run(
      nanoid(),
      input.bookId,
      normalizeOptionalRawText(input.originalText ?? ""),
      hashtag,
      input.sourceRowNumber ?? null,
    );

  return result.changes > 0;
}

export function deleteBookCaption(bookId: string, captionId: string) {
  const db = getDatabase();
  initializeDatabase(db);

  const result = db
    .prepare(
      `
        DELETE FROM book_captions
        WHERE book_id = ?
          AND id = ?
      `,
    )
    .run(bookId, captionId);

  return result.changes > 0;
}

export function deleteBookHashtag(bookId: string, hashtagId: string) {
  const db = getDatabase();
  initializeDatabase(db);

  const result = db
    .prepare(
      `
        DELETE FROM book_hashtags
        WHERE book_id = ?
          AND id = ?
      `,
    )
    .run(bookId, hashtagId);

  return result.changes > 0;
}

export function listBookCaptions(bookId: string) {
  const db = getDatabase();
  initializeDatabase(db);

  return db
    .prepare(
      `
        SELECT
          id,
          book_id,
          text,
          source_row_number,
          created_at
        FROM book_captions
        WHERE book_id = ?
        ORDER BY created_at ASC, rowid ASC
      `,
    )
    .all(bookId) as BookCaption[];
}

export function listBookHashtags(bookId: string) {
  const db = getDatabase();
  initializeDatabase(db);

  return db
    .prepare(
      `
        SELECT
          id,
          book_id,
          original_text,
          hashtag,
          source_row_number,
          created_at
        FROM book_hashtags
        WHERE book_id = ?
        ORDER BY hashtag ASC, created_at ASC
      `,
    )
    .all(bookId) as BookHashtag[];
}

export function createBookScreenshot(input: CreateBookScreenshotInput) {
  const book = getBook(input.bookId);

  if (!book) {
    throw new Error("Book not found.");
  }

  const db = getDatabase();
  initializeDatabase(db);

  const id = nanoid();

  db.prepare(
    `
      INSERT INTO book_screenshots (
        id,
        book_id,
        google_file_id,
        source_url,
        filename,
        filepath,
        created_at
      )
      VALUES (
        @id,
        @bookId,
        @googleFileId,
        @sourceUrl,
        @filename,
        @filepath,
        unixepoch()
      )
    `,
  ).run({
    id,
    bookId: input.bookId,
    googleFileId: normalizeOptionalText(input.googleFileId),
    sourceUrl: normalizeOptionalText(input.sourceUrl),
    filename: input.filename,
    filepath: input.filepath,
  });

  return id;
}

export function createBookBackground(input: CreateBookBackgroundInput) {
  const book = getBook(input.bookId);

  if (!book) {
    throw new Error("Book not found.");
  }

  const db = getDatabase();
  initializeDatabase(db);

  const id = nanoid();

  db.prepare(
    `
      INSERT INTO book_backgrounds (
        id,
        book_id,
        google_file_id,
        filename,
        filepath,
        duration_seconds,
        created_at
      )
      VALUES (
        @id,
        @bookId,
        @googleFileId,
        @filename,
        @filepath,
        @durationSeconds,
        unixepoch()
      )
    `,
  ).run({
    id,
    bookId: input.bookId,
    googleFileId: normalizeOptionalText(input.googleFileId),
    filename: input.filename,
    filepath: input.filepath,
    durationSeconds: input.durationSeconds ?? null,
  });

  return id;
}

export function createBookThumbnail(input: CreateBookThumbnailInput) {
  const book = getBook(input.bookId);

  if (!book) {
    throw new Error("Book not found.");
  }

  const db = getDatabase();
  initializeDatabase(db);

  const id = nanoid();

  db.prepare(
    `
      INSERT OR IGNORE INTO book_thumbnails (
        id,
        book_id,
        google_file_id,
        filename,
        filepath,
        drive_url,
        created_at
      )
      VALUES (
        @id,
        @bookId,
        @googleFileId,
        @filename,
        @filepath,
        @driveUrl,
        unixepoch()
      )
    `,
  ).run({
    id,
    bookId: input.bookId,
    googleFileId: normalizeOptionalText(input.googleFileId),
    filename: input.filename,
    filepath: input.filepath,
    driveUrl: normalizeOptionalText(input.driveUrl),
  });

  return id;
}

export function listBookScreenshots(bookId: string) {
  const db = getDatabase();
  initializeDatabase(db);

  return db
    .prepare(
      `
        SELECT
          id,
          book_id,
          google_file_id,
          source_url,
          filename,
          filepath,
          created_at
        FROM book_screenshots
        WHERE book_id = ?
        ORDER BY created_at DESC, filename ASC
      `,
    )
    .all(bookId) as BookScreenshot[];
}

export function getBookScreenshot(bookId: string, screenshotId: string) {
  const db = getDatabase();
  initializeDatabase(db);

  const screenshot = db
    .prepare(
      `
        SELECT
          id,
          book_id,
          google_file_id,
          source_url,
          filename,
          filepath,
          created_at
        FROM book_screenshots
        WHERE book_id = ?
          AND id = ?
      `,
    )
    .get(bookId, screenshotId) as BookScreenshot | undefined;

  return screenshot ?? null;
}

export function listBookBackgrounds(bookId: string) {
  const db = getDatabase();
  initializeDatabase(db);

  return db
    .prepare(
      `
        SELECT
          id,
          book_id,
          google_file_id,
          filename,
          filepath,
          duration_seconds,
          created_at
        FROM book_backgrounds
        WHERE book_id = ?
        ORDER BY created_at DESC, filename ASC
      `,
    )
    .all(bookId) as BookBackground[];
}

export function getBookBackground(bookId: string, backgroundId: string) {
  const db = getDatabase();
  initializeDatabase(db);

  const background = db
    .prepare(
      `
        SELECT
          id,
          book_id,
          google_file_id,
          filename,
          filepath,
          duration_seconds,
          created_at
        FROM book_backgrounds
        WHERE book_id = ?
          AND id = ?
      `,
    )
    .get(bookId, backgroundId) as BookBackground | undefined;

  return background ?? null;
}

export function listBookThumbnails(bookId: string) {
  const db = getDatabase();
  initializeDatabase(db);

  return db
    .prepare(
      `
        SELECT
          id,
          book_id,
          google_file_id,
          filename,
          filepath,
          drive_url,
          created_at
        FROM book_thumbnails
        WHERE book_id = ?
        ORDER BY created_at DESC, filename ASC
      `,
    )
    .all(bookId) as BookThumbnail[];
}

export function getBookThumbnail(bookId: string, thumbnailId: string) {
  const db = getDatabase();
  initializeDatabase(db);

  const thumbnail = db
    .prepare(
      `
        SELECT
          id,
          book_id,
          google_file_id,
          filename,
          filepath,
          drive_url,
          created_at
        FROM book_thumbnails
        WHERE book_id = ?
          AND id = ?
      `,
    )
    .get(bookId, thumbnailId) as BookThumbnail | undefined;

  return thumbnail ?? null;
}

export function listBookHooks(bookId: string) {
  const db = getDatabase();
  initializeDatabase(db);

  return db
    .prepare(
      `
        SELECT
          id,
          book_id,
          screenshot_id,
          text,
          source_row_number,
          created_at
        FROM book_hooks
        WHERE book_id = ?
        ORDER BY created_at ASC, rowid ASC
      `,
    )
    .all(bookId) as BookHook[];
}

export function getBookHookCountsByScreenshot(bookId: string) {
  const db = getDatabase();
  initializeDatabase(db);

  const rows = db
    .prepare(
      `
        SELECT screenshot_id, COUNT(*) AS count
        FROM book_hooks
        WHERE book_id = ?
        GROUP BY screenshot_id
      `,
    )
    .all(bookId) as Array<{ screenshot_id: string; count: number }>;

  return new Map(rows.map((row) => [row.screenshot_id, row.count]));
}

export function createBookHooksForScreenshot(input: CreateBookHooksInput) {
  const trimmedHooks = input.lines
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (trimmedHooks.length === 0) {
    return 0;
  }

  const db = getDatabase();
  initializeDatabase(db);

  const screenshot = db
    .prepare(
      `
        SELECT id
        FROM book_screenshots
        WHERE id = ?
          AND book_id = ?
      `,
    )
    .get(input.screenshotId, input.bookId);

  if (!screenshot) {
    throw new Error("Screenshot not found for this book.");
  }

  const insertHook = db.prepare(
    `
      INSERT INTO book_hooks (
        id,
        book_id,
        screenshot_id,
        text,
        created_at
      )
      VALUES (
        @id,
        @bookId,
        @screenshotId,
        @text,
        unixepoch()
      )
    `,
  );

  const insertMany = db.transaction((hookTexts: string[]) => {
    for (const text of hookTexts) {
      insertHook.run({
        id: nanoid(),
        bookId: input.bookId,
        screenshotId: input.screenshotId,
        text,
      });
    }
  });

  insertMany(trimmedHooks);

  return trimmedHooks.length;
}

export function createBookHookForScreenshot(input: CreateBookHookInput) {
  const text = input.text.trim();

  if (!text) {
    return false;
  }

  const db = getDatabase();
  initializeDatabase(db);

  const screenshot = db
    .prepare(
      `
        SELECT id
        FROM book_screenshots
        WHERE id = ?
          AND book_id = ?
      `,
    )
    .get(input.screenshotId, input.bookId);

  if (!screenshot) {
    throw new Error("Screenshot not found for this book.");
  }

  const existingHook = db
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
    .get(input.bookId, input.screenshotId, text);

  if (existingHook) {
    return false;
  }

  const result = db
    .prepare(
      `
        INSERT OR IGNORE INTO book_hooks (
          id,
          book_id,
          screenshot_id,
          text,
          source_row_number,
          created_at
        )
        VALUES (
          @id,
          @bookId,
          @screenshotId,
          @text,
          @sourceRowNumber,
          unixepoch()
        )
      `,
    )
    .run({
      id: nanoid(),
      bookId: input.bookId,
      screenshotId: input.screenshotId,
      text,
      sourceRowNumber: input.sourceRowNumber ?? null,
    });

  return result.changes > 0;
}

export function deleteBookHook(bookId: string, hookId: string) {
  const db = getDatabase();
  initializeDatabase(db);

  const result = db
    .prepare(
      `
        DELETE FROM book_hooks
        WHERE id = ?
          AND book_id = ?
      `,
    )
    .run(hookId, bookId);

  return result.changes > 0;
}

export function listLayouts() {
  const db = getDatabase();
  initializeDatabase(db);

  return db
    .prepare(
      `
        SELECT
          id,
          name,
          type,
          description,
          created_at
        FROM layouts
        ORDER BY type ASC, name ASC
      `,
    )
    .all() as Layout[];
}

export function getLayout(layoutId: string) {
  const db = getDatabase();
  initializeDatabase(db);

  const layout = db
    .prepare(
      `
        SELECT
          id,
          name,
          type,
          description,
          created_at
        FROM layouts
        WHERE id = ?
      `,
    )
    .get(layoutId) as Layout | undefined;

  return layout ?? null;
}

function uniqueIds(ids: string[]) {
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
}

function getCampaignForBatchValidation(db: Database.Database, campaignId: string) {
  const campaign = db
    .prepare(
      `
        SELECT
          id,
          book_id
        FROM campaigns
        WHERE id = ?
      `,
    )
    .get(campaignId) as { id: string; book_id: string | null } | undefined;

  if (!campaign) {
    throw new Error("Campaign not found.");
  }

  if (!campaign.book_id) {
    throw new Error("Campaign must be linked to a book.");
  }

  return campaign;
}

function validateLayoutId(db: Database.Database, layoutId: string | null) {
  if (!layoutId) {
    return;
  }

  const layout = db
    .prepare(
      `
        SELECT id
        FROM layouts
        WHERE id = ?
      `,
    )
    .get(layoutId);

  if (!layout) {
    throw new Error("Layout not found.");
  }
}

function getRenderBatchForCampaign(
  db: Database.Database,
  campaignId: string,
  batchId: string,
) {
  const batch = db
    .prepare(
      `
        SELECT
          id,
          campaign_id,
          name,
          layout_id,
          caption,
          status,
          created_at,
          updated_at
        FROM render_batches
        WHERE id = ?
          AND campaign_id = ?
      `,
    )
    .get(batchId, campaignId) as RenderBatch | undefined;

  if (!batch) {
    throw new Error("Render batch not found for this campaign.");
  }

  return batch;
}

function getRenderBatchSelectionContext(
  db: Database.Database,
  campaignId: string,
  batchId: string,
) {
  const campaign = getCampaignForBatchValidation(db, campaignId);
  const batch = getRenderBatchForCampaign(db, campaignId, batchId);

  return {
    batch,
    bookId: campaign.book_id as string,
  };
}

function syncRenderBatchSelections({
  batchId,
  assetIds,
  table,
  assetColumn,
}: {
  batchId: string;
  assetIds: string[];
  table:
    | "render_batch_screenshot_selections"
    | "render_batch_hook_selections"
    | "render_batch_background_selections"
    | "render_batch_audio_selections"
    | "render_batch_caption_selections"
    | "render_batch_hashtag_selections"
    | "render_batch_thumbnail_selections";
  assetColumn:
    | "screenshot_id"
    | "hook_id"
    | "background_id"
    | "audio_id"
    | "caption_id"
    | "hashtag_id"
    | "thumbnail_id";
}) {
  const db = getDatabase();
  initializeDatabase(db);

  const ids = uniqueIds(assetIds);
  const sync = db.transaction((selectedIds: string[]) => {
    if (selectedIds.length > 0) {
      const placeholders = selectedIds.map(() => "?").join(", ");
      db.prepare(
        `
          DELETE FROM ${table}
          WHERE batch_id = ?
            AND ${assetColumn} NOT IN (${placeholders})
        `,
      ).run(batchId, ...selectedIds);
    } else {
      db.prepare(
        `
          DELETE FROM ${table}
          WHERE batch_id = ?
        `,
      ).run(batchId);
    }

    const insertSelection = db.prepare(
      `
        INSERT OR IGNORE INTO ${table} (
          id,
          batch_id,
          ${assetColumn},
          created_at
        )
        VALUES (
          @id,
          @batchId,
          @assetId,
          unixepoch()
        )
      `,
    );

    for (const assetId of selectedIds) {
      insertSelection.run({
        id: nanoid(),
        batchId,
        assetId,
      });
    }
  });

  sync(ids);

  return ids.length;
}

function validateBookHookIdsForBatch({
  db,
  bookId,
  batchId,
  hookIds,
}: {
  db: Database.Database;
  bookId: string;
  batchId: string;
  hookIds: string[];
}) {
  if (hookIds.length === 0) {
    return;
  }

  const selectedScreenshots = db
    .prepare(
      `
        SELECT screenshot_id
        FROM render_batch_screenshot_selections
        WHERE batch_id = ?
      `,
    )
    .all(batchId) as Array<{ screenshot_id: string }>;
  const selectedScreenshotIds = selectedScreenshots.map(
    (selection) => selection.screenshot_id,
  );

  if (selectedScreenshotIds.length === 0) {
    throw new Error("Select screenshots before selecting hooks.");
  }

  const hookPlaceholders = hookIds.map(() => "?").join(", ");
  const screenshotPlaceholders = selectedScreenshotIds.map(() => "?").join(", ");
  const rows = db
    .prepare(
      `
        SELECT id
        FROM book_hooks
        WHERE book_id = ?
          AND screenshot_id IN (${screenshotPlaceholders})
          AND id IN (${hookPlaceholders})
      `,
    )
    .all(bookId, ...selectedScreenshotIds, ...hookIds) as Array<{ id: string }>;
  const validIds = new Set(rows.map((row) => row.id));

  if (hookIds.some((id) => !validIds.has(id))) {
    throw new Error("One or more selected hooks do not belong to selected screenshots.");
  }
}

function validateGlobalAudioAssetIds(db: Database.Database, audioIds: string[]) {
  if (audioIds.length === 0) {
    return;
  }

  const placeholders = audioIds.map(() => "?").join(", ");
  const rows = db
    .prepare(
      `
        SELECT id
        FROM audio_assets
        WHERE campaign_id IS NULL
          AND id IN (${placeholders})
      `,
    )
    .all(...audioIds) as Array<{ id: string }>;
  const validIds = new Set(rows.map((row) => row.id));

  if (audioIds.some((id) => !validIds.has(id))) {
    throw new Error("One or more selected audio assets are not global audio assets.");
  }
}

function validateBookCaptionIds({
  db,
  bookId,
  captionIds,
}: {
  db: Database.Database;
  bookId: string;
  captionIds: string[];
}) {
  validateBookAssetIds({
    db,
    table: "book_captions",
    idColumn: "id",
    bookId,
    assetIds: captionIds,
    errorMessage: "One or more selected captions do not belong to this book.",
  });
}

function validateBookHashtagIds({
  db,
  bookId,
  hashtagIds,
}: {
  db: Database.Database;
  bookId: string;
  hashtagIds: string[];
}) {
  validateBookAssetIds({
    db,
    table: "book_hashtags",
    idColumn: "id",
    bookId,
    assetIds: hashtagIds,
    errorMessage: "One or more selected hashtags do not belong to this book.",
  });
}

function validateBookThumbnailIds({
  db,
  bookId,
  thumbnailIds,
}: {
  db: Database.Database;
  bookId: string;
  thumbnailIds: string[];
}) {
  validateBookAssetIds({
    db,
    table: "book_thumbnails",
    idColumn: "id",
    bookId,
    assetIds: thumbnailIds,
    errorMessage: "One or more selected thumbnails do not belong to this book.",
  });
}

export function createRenderBatch(input: CreateRenderBatchInput) {
  const name = input.name.trim();

  if (!name) {
    throw new Error("Render batch name is required.");
  }

  const db = getDatabase();
  initializeDatabase(db);
  getCampaignForBatchValidation(db, input.campaignId);

  const layoutId = normalizeOptionalText(input.layoutId);
  validateLayoutId(db, layoutId);

  const status = input.status ?? "draft";

  if (!renderBatchStatuses.includes(status)) {
    throw new Error("Invalid render batch status.");
  }

  const id = nanoid();

  db.prepare(
    `
      INSERT INTO render_batches (
        id,
        campaign_id,
        name,
        layout_id,
        caption,
        status
      )
      VALUES (
        @id,
        @campaignId,
        @name,
        @layoutId,
        @caption,
        @status
      )
    `,
  ).run({
    id,
    campaignId: input.campaignId,
    name,
    layoutId,
    caption: normalizeOptionalRawText(input.caption ?? ""),
    status,
  });

  return id;
}

export function getRenderBatch(batchId: string) {
  const db = getDatabase();
  initializeDatabase(db);

  const batch = db
    .prepare(
      `
        SELECT
          id,
          campaign_id,
          name,
          layout_id,
          caption,
          status,
          created_at,
          updated_at
        FROM render_batches
        WHERE id = ?
      `,
    )
    .get(batchId) as RenderBatch | undefined;

  return batch ?? null;
}

export function listRenderBatchesByCampaign(campaignId: string) {
  const db = getDatabase();
  initializeDatabase(db);

  return db
    .prepare(
      `
        SELECT
          id,
          campaign_id,
          name,
          layout_id,
          caption,
          status,
          created_at,
          updated_at
        FROM render_batches
        WHERE campaign_id = ?
        ORDER BY datetime(created_at) DESC, name ASC
      `,
    )
    .all(campaignId) as RenderBatch[];
}

export function updateRenderBatch(input: UpdateRenderBatchInput) {
  const db = getDatabase();
  initializeDatabase(db);
  const existingBatch = getRenderBatchForCampaign(
    db,
    input.campaignId,
    input.batchId,
  );

  getCampaignForBatchValidation(db, input.campaignId);

  const name =
    input.name === undefined ? existingBatch.name : input.name.trim();

  if (!name) {
    throw new Error("Render batch name is required.");
  }

  const layoutId =
    input.layoutId === undefined
      ? existingBatch.layout_id
      : normalizeOptionalText(input.layoutId);
  validateLayoutId(db, layoutId);

  const caption =
    input.caption === undefined
      ? existingBatch.caption
      : normalizeOptionalRawText(input.caption ?? "");

  const result = db
    .prepare(
      `
        UPDATE render_batches
        SET name = ?,
            layout_id = ?,
            caption = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
          AND campaign_id = ?
      `,
    )
    .run(name, layoutId, caption, input.batchId, input.campaignId);

  return result.changes > 0;
}

export function updateRenderBatchStatus(input: UpdateRenderBatchStatusInput) {
  if (!renderBatchStatuses.includes(input.status)) {
    throw new Error("Invalid render batch status.");
  }

  const db = getDatabase();
  initializeDatabase(db);
  getRenderBatchForCampaign(db, input.campaignId, input.batchId);

  const result = db
    .prepare(
      `
        UPDATE render_batches
        SET status = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
          AND campaign_id = ?
      `,
    )
    .run(input.status, input.batchId, input.campaignId);

  return result.changes > 0;
}

export function deleteRenderBatchAndJobs(input: {
  campaignId: string;
  batchId: string;
}) {
  const db = getDatabase();
  initializeDatabase(db);
  const batch = getRenderBatchForCampaign(db, input.campaignId, input.batchId);
  const jobs = listRenderJobsByBatch(input.batchId).filter(
    (job) => job.campaign_id === input.campaignId,
  );

  const transaction = db.transaction(() => {
    db.prepare(
      `
        DELETE FROM metricool_rows
        WHERE render_job_id IN (
          SELECT id
          FROM render_jobs
          WHERE batch_id = ?
            AND campaign_id = ?
        )
      `,
    ).run(input.batchId, input.campaignId);

    db.prepare(
      `
        DELETE FROM render_jobs
        WHERE batch_id = ?
          AND campaign_id = ?
      `,
    ).run(input.batchId, input.campaignId);

    db.prepare(
      `
        DELETE FROM render_batches
        WHERE id = ?
          AND campaign_id = ?
      `,
    ).run(input.batchId, input.campaignId);

    db.prepare(
      `
        UPDATE campaigns
        SET metricool_sheet_updated_at = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
    ).run(input.campaignId);
  });

  transaction();

  return {
    batch,
    deletedRenderJobs: jobs.length,
  };
}

export function listRenderBatchScreenshotSelections(batchId: string) {
  const db = getDatabase();
  initializeDatabase(db);

  return db
    .prepare(
      `
        SELECT
          id,
          batch_id,
          screenshot_id,
          created_at
        FROM render_batch_screenshot_selections
        WHERE batch_id = ?
        ORDER BY created_at DESC
      `,
    )
    .all(batchId) as RenderBatchScreenshotSelection[];
}

export function listRenderBatchHookSelections(batchId: string) {
  const db = getDatabase();
  initializeDatabase(db);

  return db
    .prepare(
      `
        SELECT
          id,
          batch_id,
          hook_id,
          created_at
        FROM render_batch_hook_selections
        WHERE batch_id = ?
        ORDER BY created_at DESC
      `,
    )
    .all(batchId) as RenderBatchHookSelection[];
}

export function listRenderBatchBackgroundSelections(batchId: string) {
  const db = getDatabase();
  initializeDatabase(db);

  return db
    .prepare(
      `
        SELECT
          id,
          batch_id,
          background_id,
          created_at
        FROM render_batch_background_selections
        WHERE batch_id = ?
        ORDER BY created_at DESC
      `,
    )
    .all(batchId) as RenderBatchBackgroundSelection[];
}

export function listRenderBatchAudioSelections(batchId: string) {
  const db = getDatabase();
  initializeDatabase(db);

  return db
    .prepare(
      `
        SELECT
          id,
          batch_id,
          audio_id,
          render_duration_seconds,
          created_at
        FROM render_batch_audio_selections
        WHERE batch_id = ?
        ORDER BY created_at DESC
      `,
    )
    .all(batchId) as RenderBatchAudioSelection[];
}

export function listRenderBatchCaptionSelections(batchId: string) {
  const db = getDatabase();
  initializeDatabase(db);

  return db
    .prepare(
      `
        SELECT
          id,
          batch_id,
          caption_id,
          created_at
        FROM render_batch_caption_selections
        WHERE batch_id = ?
        ORDER BY created_at DESC
      `,
    )
    .all(batchId) as RenderBatchCaptionSelection[];
}

export function listRenderBatchHashtagSelections(batchId: string) {
  const db = getDatabase();
  initializeDatabase(db);

  return db
    .prepare(
      `
        SELECT
          id,
          batch_id,
          hashtag_id,
          created_at
        FROM render_batch_hashtag_selections
        WHERE batch_id = ?
        ORDER BY created_at DESC
      `,
    )
    .all(batchId) as RenderBatchHashtagSelection[];
}

export function listRenderBatchThumbnailSelections(batchId: string) {
  const db = getDatabase();
  initializeDatabase(db);

  return db
    .prepare(
      `
        SELECT
          id,
          batch_id,
          thumbnail_id,
          created_at
        FROM render_batch_thumbnail_selections
        WHERE batch_id = ?
        ORDER BY created_at DESC
      `,
    )
    .all(batchId) as RenderBatchThumbnailSelection[];
}

export function getRenderBatchMatrixStats(batchId: string): RenderBatchMatrixStats {
  const db = getDatabase();
  initializeDatabase(db);

  const screenshotCount = db
    .prepare(
      `
        SELECT COUNT(*) AS count
        FROM render_batch_screenshot_selections
        WHERE batch_id = ?
      `,
    )
    .get(batchId) as { count: number };
  const hookCount = db
    .prepare(
      `
        SELECT COUNT(*) AS count
        FROM render_batch_hook_selections
        WHERE batch_id = ?
      `,
    )
    .get(batchId) as { count: number };
  const backgroundCount = db
    .prepare(
      `
        SELECT COUNT(*) AS count
        FROM render_batch_background_selections
        WHERE batch_id = ?
      `,
    )
    .get(batchId) as { count: number };
  const audioCount = db
    .prepare(
      `
        SELECT COUNT(*) AS count
        FROM render_batch_audio_selections
        WHERE batch_id = ?
      `,
    )
    .get(batchId) as { count: number };
  const captionCount = db
    .prepare(
      `
        SELECT COUNT(*) AS count
        FROM render_batch_caption_selections
        WHERE batch_id = ?
      `,
    )
    .get(batchId) as { count: number };
  const hashtagCount = db
    .prepare(
      `
        SELECT COUNT(*) AS count
        FROM render_batch_hashtag_selections
        WHERE batch_id = ?
      `,
    )
    .get(batchId) as { count: number };
  const thumbnailCount = db
    .prepare(
      `
        SELECT COUNT(*) AS count
        FROM render_batch_thumbnail_selections
        WHERE batch_id = ?
      `,
    )
    .get(batchId) as { count: number };
  const audioMultiplier = Math.max(audioCount.count, 1);

  return {
    screenshotCount: screenshotCount.count,
    hookCount: hookCount.count,
    backgroundCount: backgroundCount.count,
    audioCount: audioCount.count,
    captionCount: captionCount.count,
    hashtagCount: hashtagCount.count,
    thumbnailCount: thumbnailCount.count,
    previewCount: backgroundCount.count * hookCount.count * audioMultiplier,
  };
}

function getRenderBatchWithCampaign(batchId: string) {
  const db = getDatabase();
  initializeDatabase(db);

  const row = db
    .prepare(
      `
        SELECT
          render_batches.id AS batch_id,
          render_batches.campaign_id,
          render_batches.name,
          render_batches.layout_id,
          render_batches.caption AS batch_caption,
          render_batches.status,
          render_batches.created_at,
          render_batches.updated_at,
          campaigns.book_id
        FROM render_batches
        JOIN campaigns
          ON campaigns.id = render_batches.campaign_id
        WHERE render_batches.id = ?
      `,
    )
    .get(batchId) as
    | {
        batch_id: string;
        campaign_id: string;
        name: string;
        layout_id: string | null;
        batch_caption: string | null;
        status: RenderBatchStatus;
        created_at: string;
        updated_at: string;
        book_id: string | null;
      }
    | undefined;

  if (!row) {
    throw new Error("Render batch not found.");
  }

  if (!row.book_id) {
    throw new Error("Render batch campaign is not linked to a book.");
  }

  return row;
}

function listSelectedBatchBackgrounds(batchId: string) {
  const db = getDatabase();
  initializeDatabase(db);

  return db
    .prepare(
      `
        SELECT
          book_backgrounds.id,
          book_backgrounds.book_id,
          book_backgrounds.google_file_id,
          book_backgrounds.filename,
          book_backgrounds.filepath,
          book_backgrounds.duration_seconds,
          book_backgrounds.created_at
        FROM render_batch_background_selections
        JOIN book_backgrounds
          ON book_backgrounds.id = render_batch_background_selections.background_id
        WHERE render_batch_background_selections.batch_id = ?
        ORDER BY render_batch_background_selections.created_at DESC
      `,
    )
    .all(batchId) as BookBackground[];
}

function listSelectedBatchHooks(batchId: string) {
  const db = getDatabase();
  initializeDatabase(db);

  return db
    .prepare(
      `
        SELECT
          book_hooks.id,
          book_hooks.book_id,
          book_hooks.screenshot_id,
          book_hooks.text,
          book_hooks.source_row_number,
          book_hooks.created_at
        FROM render_batch_hook_selections
        JOIN book_hooks
          ON book_hooks.id = render_batch_hook_selections.hook_id
        WHERE render_batch_hook_selections.batch_id = ?
        ORDER BY render_batch_hook_selections.created_at ASC
      `,
    )
    .all(batchId) as BookHook[];
}

function listSelectedBatchAudioAssets(batchId: string) {
  const db = getDatabase();
  initializeDatabase(db);

  return db
    .prepare(
      `
        SELECT
          audio_assets.id,
          audio_assets.campaign_id,
          audio_assets.title,
          audio_assets.source_url,
          audio_assets.music_id,
          audio_assets.filename,
          audio_assets.filepath,
          audio_assets.duration_seconds,
          audio_assets.notes,
          audio_assets.created_at,
          render_batch_audio_selections.render_duration_seconds
        FROM render_batch_audio_selections
        JOIN audio_assets
          ON audio_assets.id = render_batch_audio_selections.audio_id
        WHERE render_batch_audio_selections.batch_id = ?
        ORDER BY render_batch_audio_selections.created_at DESC
      `,
    )
    .all(batchId) as Array<AudioAsset & { render_duration_seconds: number | null }>;
}

function listSelectedBatchCaptions(batchId: string) {
  const db = getDatabase();
  initializeDatabase(db);

  return db
    .prepare(
      `
        SELECT
          book_captions.id,
          book_captions.book_id,
          book_captions.text,
          book_captions.source_row_number,
          book_captions.created_at
        FROM render_batch_caption_selections
        JOIN book_captions
          ON book_captions.id = render_batch_caption_selections.caption_id
        WHERE render_batch_caption_selections.batch_id = ?
        ORDER BY render_batch_caption_selections.created_at ASC
      `,
    )
    .all(batchId) as BookCaption[];
}

function listSelectedBatchHashtags(batchId: string) {
  const db = getDatabase();
  initializeDatabase(db);

  return db
    .prepare(
      `
        SELECT
          book_hashtags.id,
          book_hashtags.book_id,
          book_hashtags.original_text,
          book_hashtags.hashtag,
          book_hashtags.source_row_number,
          book_hashtags.created_at
        FROM render_batch_hashtag_selections
        JOIN book_hashtags
          ON book_hashtags.id = render_batch_hashtag_selections.hashtag_id
        WHERE render_batch_hashtag_selections.batch_id = ?
        ORDER BY render_batch_hashtag_selections.created_at ASC
      `,
    )
    .all(batchId) as BookHashtag[];
}

function listSelectedBatchThumbnails(batchId: string) {
  const db = getDatabase();
  initializeDatabase(db);

  return db
    .prepare(
      `
        SELECT
          book_thumbnails.id,
          book_thumbnails.book_id,
          book_thumbnails.google_file_id,
          book_thumbnails.filename,
          book_thumbnails.filepath,
          book_thumbnails.drive_url,
          book_thumbnails.created_at
        FROM render_batch_thumbnail_selections
        JOIN book_thumbnails
          ON book_thumbnails.id = render_batch_thumbnail_selections.thumbnail_id
        WHERE render_batch_thumbnail_selections.batch_id = ?
        ORDER BY render_batch_thumbnail_selections.created_at ASC
      `,
    )
    .all(batchId) as BookThumbnail[];
}

function buildBatchPostCaption({
  captionText,
  hashtags,
}: {
  captionText?: string | null;
  hashtags: BookHashtag[];
}) {
  const hashtagBlock = hashtags
    .map((hashtag) => hashtag.hashtag.trim())
    .filter(Boolean)
    .join(" ");
  const blocks = [
    normalizeCaptionAssetText(captionText ?? ""),
    hashtagBlock,
  ].filter((block): block is string => Boolean(block));

  return blocks.join("\n\n");
}

function pickRandomCaption(captions: BookCaption[]) {
  if (captions.length === 0) {
    return null;
  }

  return captions[Math.floor(Math.random() * captions.length)] ?? null;
}

function pickRandomThumbnail(thumbnails: BookThumbnail[]) {
  if (thumbnails.length === 0) {
    return null;
  }

  return thumbnails[Math.floor(Math.random() * thumbnails.length)] ?? null;
}

export function generateRenderJobsForBatch(
  batchId: string,
  options: GenerateRenderJobsOptions = {},
): GenerateRenderJobsResult {
  const db = getDatabase();
  initializeDatabase(db);

  const batch = getRenderBatchWithCampaign(batchId);
  const backgrounds = listSelectedBatchBackgrounds(batchId);
  const hooks = listSelectedBatchHooks(batchId);
  const audioAssets = listSelectedBatchAudioAssets(batchId);
  const captions = listSelectedBatchCaptions(batchId);
  const hashtags = listSelectedBatchHashtags(batchId);
  const thumbnails = listSelectedBatchThumbnails(batchId);
  const selectedAudioIds = audioAssets.map((audio) => audio.id);
  const audioRenderDurations = new Map(
    audioAssets.map((audio) => [audio.id, audio.render_duration_seconds]),
  );
  const audioIds = selectedAudioIds.length > 0 ? selectedAudioIds : [null];
  const previewCount = backgrounds.length * hooks.length * audioIds.length;

  if (previewCount === 0) {
    return {
      previewCount,
      createdCount: 0,
      skippedDuplicateCount: 0,
    };
  }

  if (previewCount > 1000 && !options.allowLargeBatch) {
    throw new Error(
      `This batch would create ${previewCount} render jobs. Tick the override checkbox to generate more than 1000 jobs, or reduce the selected backgrounds, hooks, or audio.`,
    );
  }

  const insertRenderJob = db.prepare(
    `
      INSERT OR IGNORE INTO render_jobs (
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
        background_source,
        screenshot_source,
        hook_source,
        caption,
        status
      )
      VALUES (
        @id,
        @campaignId,
        @batchId,
        @backgroundId,
        @screenshotId,
        @hookId,
        @audioId,
        @thumbnailId,
        @thumbnailDriveUrl,
        @renderDurationSeconds,
        'book',
        'book',
        'book',
        @caption,
        'pending'
      )
    `,
  );

  const insertMany = db.transaction(() => {
    let createdCount = 0;

    for (const background of backgrounds) {
      for (const hook of hooks) {
        for (const selectedAudioId of audioIds) {
          const selectedCaption = pickRandomCaption(captions);
          const selectedThumbnail = pickRandomThumbnail(thumbnails);
          const result = insertRenderJob.run({
            id: nanoid(),
            campaignId: batch.campaign_id,
            batchId,
            backgroundId: background.id,
            screenshotId: hook.screenshot_id,
            hookId: hook.id,
            audioId: selectedAudioId,
            thumbnailId: selectedThumbnail?.id ?? null,
            thumbnailDriveUrl: selectedThumbnail?.drive_url ?? null,
            renderDurationSeconds: selectedAudioId
              ? (audioRenderDurations.get(selectedAudioId) ?? null)
              : null,
            caption: buildBatchPostCaption({
              captionText: selectedCaption?.text,
              hashtags,
            }),
          });

          createdCount += result.changes;
        }
      }
    }

    return createdCount;
  });

  const createdCount = insertMany();

  return {
    previewCount,
    createdCount,
    skippedDuplicateCount: previewCount - createdCount,
  };
}

export function updateRenderBatchScreenshotSelections(
  input: UpdateRenderBatchSelectionsInput,
) {
  const db = getDatabase();
  initializeDatabase(db);
  const { bookId } = getRenderBatchSelectionContext(
    db,
    input.campaignId,
    input.batchId,
  );
  const assetIds = uniqueIds(input.assetIds);

  validateBookAssetIds({
    db,
    table: "book_screenshots",
    idColumn: "id",
    bookId,
    assetIds,
    errorMessage: "One or more selected screenshots do not belong to this book.",
  });

  const selectedCount = syncRenderBatchSelections({
    batchId: input.batchId,
    assetIds,
    table: "render_batch_screenshot_selections",
    assetColumn: "screenshot_id",
  });

  if (assetIds.length > 0) {
    const placeholders = assetIds.map(() => "?").join(", ");

    db.prepare(
      `
        DELETE FROM render_batch_hook_selections
        WHERE batch_id = ?
          AND hook_id NOT IN (
            SELECT id
            FROM book_hooks
            WHERE screenshot_id IN (${placeholders})
          )
      `,
    ).run(input.batchId, ...assetIds);
  } else {
    db.prepare(
      `
        DELETE FROM render_batch_hook_selections
        WHERE batch_id = ?
      `,
    ).run(input.batchId);
  }

  return selectedCount;
}

export function updateRenderBatchHookSelections(
  input: UpdateRenderBatchSelectionsInput,
) {
  const db = getDatabase();
  initializeDatabase(db);
  const { bookId } = getRenderBatchSelectionContext(
    db,
    input.campaignId,
    input.batchId,
  );
  const assetIds = uniqueIds(input.assetIds);

  validateBookHookIdsForBatch({
    db,
    bookId,
    batchId: input.batchId,
    hookIds: assetIds,
  });

  return syncRenderBatchSelections({
    batchId: input.batchId,
    assetIds,
    table: "render_batch_hook_selections",
    assetColumn: "hook_id",
  });
}

export function updateRenderBatchBackgroundSelections(
  input: UpdateRenderBatchSelectionsInput,
) {
  const db = getDatabase();
  initializeDatabase(db);
  const { bookId } = getRenderBatchSelectionContext(
    db,
    input.campaignId,
    input.batchId,
  );
  const assetIds = uniqueIds(input.assetIds);

  validateBookAssetIds({
    db,
    table: "book_backgrounds",
    idColumn: "id",
    bookId,
    assetIds,
    errorMessage: "One or more selected backgrounds do not belong to this book.",
  });

  return syncRenderBatchSelections({
    batchId: input.batchId,
    assetIds,
    table: "render_batch_background_selections",
    assetColumn: "background_id",
  });
}

export function updateRenderBatchAudioSelections(
  input: UpdateRenderBatchAudioSelectionsInput,
) {
  const db = getDatabase();
  initializeDatabase(db);
  getRenderBatchSelectionContext(db, input.campaignId, input.batchId);

  const assetIds = uniqueIds(input.assetIds);
  validateGlobalAudioAssetIds(db, assetIds);
  const durationOverrides = new Map(
    (input.durationOverrides ?? []).map((override) => [
      override.audioId,
      normalizeRenderDurationSeconds(override.renderDurationSeconds),
    ]),
  );

  const sync = db.transaction((selectedIds: string[]) => {
    if (selectedIds.length > 0) {
      const placeholders = selectedIds.map(() => "?").join(", ");
      db.prepare(
        `
          DELETE FROM render_batch_audio_selections
          WHERE batch_id = ?
            AND audio_id NOT IN (${placeholders})
        `,
      ).run(input.batchId, ...selectedIds);
    } else {
      db.prepare(
        `
          DELETE FROM render_batch_audio_selections
          WHERE batch_id = ?
        `,
      ).run(input.batchId);
    }

    const insertSelection = db.prepare(
      `
        INSERT OR IGNORE INTO render_batch_audio_selections (
          id,
          batch_id,
          audio_id,
          render_duration_seconds,
          created_at
        )
        VALUES (
          @id,
          @batchId,
          @audioId,
          @renderDurationSeconds,
          unixepoch()
        )
      `,
    );
    const updateSelection = db.prepare(
      `
        UPDATE render_batch_audio_selections
        SET render_duration_seconds = ?
        WHERE batch_id = ?
          AND audio_id = ?
      `,
    );

    for (const audioId of selectedIds) {
      const renderDurationSeconds = durationOverrides.get(audioId) ?? null;

      insertSelection.run({
        id: nanoid(),
        batchId: input.batchId,
        audioId,
        renderDurationSeconds,
      });
      updateSelection.run(renderDurationSeconds, input.batchId, audioId);
      db.prepare(
        `
          UPDATE render_jobs
          SET render_duration_seconds = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE batch_id = ?
            AND audio_id = ?
            AND status IN ('pending', 'failed')
        `,
      ).run(renderDurationSeconds, input.batchId, audioId);
    }
  });

  sync(assetIds);

  return assetIds.length;
}

export function updateRenderBatchCaptionSelections(
  input: UpdateRenderBatchSelectionsInput,
) {
  const db = getDatabase();
  initializeDatabase(db);
  const { bookId } = getRenderBatchSelectionContext(
    db,
    input.campaignId,
    input.batchId,
  );
  const assetIds = uniqueIds(input.assetIds);

  validateBookCaptionIds({ db, bookId, captionIds: assetIds });

  return syncRenderBatchSelections({
    batchId: input.batchId,
    assetIds,
    table: "render_batch_caption_selections",
    assetColumn: "caption_id",
  });
}

export function updateRenderBatchHashtagSelections(
  input: UpdateRenderBatchSelectionsInput,
) {
  const db = getDatabase();
  initializeDatabase(db);
  const { bookId } = getRenderBatchSelectionContext(
    db,
    input.campaignId,
    input.batchId,
  );
  const assetIds = uniqueIds(input.assetIds);

  validateBookHashtagIds({ db, bookId, hashtagIds: assetIds });

  return syncRenderBatchSelections({
    batchId: input.batchId,
    assetIds,
    table: "render_batch_hashtag_selections",
    assetColumn: "hashtag_id",
  });
}

export function updateRenderBatchThumbnailSelections(
  input: UpdateRenderBatchSelectionsInput,
) {
  const db = getDatabase();
  initializeDatabase(db);
  const { bookId } = getRenderBatchSelectionContext(
    db,
    input.campaignId,
    input.batchId,
  );
  const assetIds = uniqueIds(input.assetIds);

  validateBookThumbnailIds({ db, bookId, thumbnailIds: assetIds });

  return syncRenderBatchSelections({
    batchId: input.batchId,
    assetIds,
    table: "render_batch_thumbnail_selections",
    assetColumn: "thumbnail_id",
  });
}

function getCampaignBookId(db: Database.Database, campaignId: string) {
  const campaign = db
    .prepare(
      `
        SELECT book_id
        FROM campaigns
        WHERE id = ?
      `,
    )
    .get(campaignId) as { book_id: string | null } | undefined;

  if (!campaign) {
    throw new Error("Campaign not found.");
  }

  if (!campaign.book_id) {
    throw new Error("Campaign is not linked to a book.");
  }

  return campaign.book_id;
}

function validateBookAssetIds({
  db,
  table,
  idColumn,
  bookId,
  assetIds,
  errorMessage,
}: {
  db: Database.Database;
  table:
    | "book_screenshots"
    | "book_backgrounds"
    | "book_captions"
    | "book_hashtags"
    | "book_thumbnails";
  idColumn: "id";
  bookId: string;
  assetIds: string[];
  errorMessage: string;
}) {
  if (assetIds.length === 0) {
    return;
  }

  const placeholders = assetIds.map(() => "?").join(", ");
  const rows = db
    .prepare(
      `
        SELECT ${idColumn} AS id
        FROM ${table}
        WHERE book_id = ?
          AND ${idColumn} IN (${placeholders})
      `,
    )
    .all(bookId, ...assetIds) as Array<{ id: string }>;
  const validIds = new Set(rows.map((row) => row.id));

  if (assetIds.some((id) => !validIds.has(id))) {
    throw new Error(errorMessage);
  }
}

function syncCampaignSelections({
  campaignId,
  assetIds,
  table,
  assetColumn,
}: {
  campaignId: string;
  assetIds: string[];
  table:
    | "campaign_screenshot_selections"
    | "campaign_background_selections"
    | "campaign_audio_selections";
  assetColumn: "screenshot_id" | "background_id" | "audio_id";
}) {
  const db = getDatabase();
  initializeDatabase(db);

  const ids = uniqueIds(assetIds);
  const sync = db.transaction((selectedIds: string[]) => {
    if (selectedIds.length > 0) {
      const placeholders = selectedIds.map(() => "?").join(", ");
      db.prepare(
        `
          DELETE FROM ${table}
          WHERE campaign_id = ?
            AND ${assetColumn} NOT IN (${placeholders})
        `,
      ).run(campaignId, ...selectedIds);
    } else {
      db.prepare(
        `
          DELETE FROM ${table}
          WHERE campaign_id = ?
        `,
      ).run(campaignId);
    }

    const insertSelection = db.prepare(
      `
        INSERT OR IGNORE INTO ${table} (
          id,
          campaign_id,
          ${assetColumn},
          created_at
        )
        VALUES (
          @id,
          @campaignId,
          @assetId,
          unixepoch()
        )
      `,
    );

    for (const assetId of selectedIds) {
      insertSelection.run({
        id: nanoid(),
        campaignId,
        assetId,
      });
    }
  });

  sync(ids);

  return ids.length;
}

export function listCampaignScreenshotSelections(campaignId: string) {
  const db = getDatabase();
  initializeDatabase(db);

  return db
    .prepare(
      `
        SELECT
          id,
          campaign_id,
          screenshot_id,
          created_at
        FROM campaign_screenshot_selections
        WHERE campaign_id = ?
        ORDER BY created_at DESC
      `,
    )
    .all(campaignId) as CampaignScreenshotSelection[];
}

export function listCampaignBackgroundSelections(campaignId: string) {
  const db = getDatabase();
  initializeDatabase(db);

  return db
    .prepare(
      `
        SELECT
          id,
          campaign_id,
          background_id,
          created_at
        FROM campaign_background_selections
        WHERE campaign_id = ?
        ORDER BY created_at DESC
      `,
    )
    .all(campaignId) as CampaignBackgroundSelection[];
}

export function listCampaignAudioSelections(campaignId: string) {
  const db = getDatabase();
  initializeDatabase(db);

  return db
    .prepare(
      `
        SELECT
          id,
          campaign_id,
          audio_id,
          created_at
        FROM campaign_audio_selections
        WHERE campaign_id = ?
        ORDER BY created_at DESC
      `,
    )
    .all(campaignId) as CampaignAudioSelection[];
}

export function updateCampaignScreenshotSelections(
  input: UpdateCampaignSelectionsInput,
) {
  const db = getDatabase();
  initializeDatabase(db);
  const bookId = getCampaignBookId(db, input.campaignId);
  const assetIds = uniqueIds(input.assetIds);

  validateBookAssetIds({
    db,
    table: "book_screenshots",
    idColumn: "id",
    bookId,
    assetIds,
    errorMessage: "One or more selected screenshots do not belong to this book.",
  });

  return syncCampaignSelections({
    campaignId: input.campaignId,
    assetIds,
    table: "campaign_screenshot_selections",
    assetColumn: "screenshot_id",
  });
}

export function updateCampaignBackgroundSelections(
  input: UpdateCampaignSelectionsInput,
) {
  const db = getDatabase();
  initializeDatabase(db);
  const bookId = getCampaignBookId(db, input.campaignId);
  const assetIds = uniqueIds(input.assetIds);

  validateBookAssetIds({
    db,
    table: "book_backgrounds",
    idColumn: "id",
    bookId,
    assetIds,
    errorMessage: "One or more selected backgrounds do not belong to this book.",
  });

  return syncCampaignSelections({
    campaignId: input.campaignId,
    assetIds,
    table: "campaign_background_selections",
    assetColumn: "background_id",
  });
}

export function updateCampaignAudioSelections(
  input: UpdateCampaignSelectionsInput,
) {
  const db = getDatabase();
  initializeDatabase(db);
  getCampaignBookId(db, input.campaignId);

  const assetIds = uniqueIds(input.assetIds);

  if (assetIds.length > 0) {
    const placeholders = assetIds.map(() => "?").join(", ");
    const rows = db
      .prepare(
        `
          SELECT id
          FROM audio_assets
          WHERE id IN (${placeholders})
        `,
      )
      .all(...assetIds) as Array<{ id: string }>;
    const validIds = new Set(rows.map((row) => row.id));

    if (assetIds.some((id) => !validIds.has(id))) {
      throw new Error("One or more selected audio assets do not exist.");
    }
  }

  return syncCampaignSelections({
    campaignId: input.campaignId,
    assetIds,
    table: "campaign_audio_selections",
    assetColumn: "audio_id",
  });
}

export function createCampaign(input: CreateCampaignInput) {
  const name = input.name.trim();

  if (!name) {
    throw new Error("Campaign name is required.");
  }

  const db = getDatabase();
  initializeDatabase(db);

  const id = nanoid();
  const bookId = normalizeOptionalText(input.bookId);
  const slug = normalizeOptionalText(input.slug);
  const layoutId = normalizeOptionalText(input.layoutId) ?? "default_video_layout";

  if (bookId) {
    const book = db
      .prepare(
        `
          SELECT id
          FROM books
          WHERE id = ?
        `,
      )
      .get(bookId);

    if (!book) {
      throw new Error("Selected book was not found.");
    }
  }

  if (layoutId) {
    const layout = db
      .prepare(
        `
          SELECT id
          FROM layouts
          WHERE id = ?
        `,
      )
      .get(layoutId);

    if (!layout) {
      throw new Error("Selected layout was not found.");
    }
  }

  if (bookId && slug) {
    const existingCampaign = db
      .prepare(
        `
          SELECT id
          FROM campaigns
          WHERE book_id = ?
            AND slug = ?
          LIMIT 1
        `,
      )
      .get(bookId, slug);

    if (existingCampaign) {
      throw new Error("A campaign with this slug already exists for this book.");
    }
  }

  db.prepare(
    `
      INSERT INTO campaigns (
        id,
        name,
        slug,
        description,
        book_id,
        layout_id,
        goal,
        drive_folder_url,
        drive_campaign_folder_url,
        drive_campaign_folder_id,
        hooks_sheet_url
      )
      VALUES (
        @id,
        @name,
        @slug,
        @description,
        @bookId,
        @layoutId,
        @goal,
        @driveFolderUrl,
        @driveCampaignFolderUrl,
        @driveCampaignFolderId,
        @hooksSheetUrl
      )
    `,
  ).run({
    id,
    name,
    slug,
    description: normalizeOptionalText(input.description),
    bookId,
    layoutId,
    goal: normalizeOptionalText(input.goal),
    driveFolderUrl: normalizeOptionalText(input.driveFolderUrl),
    driveCampaignFolderUrl: normalizeOptionalText(input.driveCampaignFolderUrl),
    driveCampaignFolderId: normalizeOptionalText(input.driveCampaignFolderId),
    hooksSheetUrl: normalizeOptionalText(input.hooksSheetUrl),
  });

  return id;
}

export function campaignSlugExistsForBook(bookId: string, slug: string) {
  const db = getDatabase();
  initializeDatabase(db);

  const existingCampaigns = db
    .prepare(
      `
        SELECT id, name, slug
        FROM campaigns
        WHERE book_id = ?
      `,
    )
    .all(bookId) as Array<{ id: string; name: string; slug: string | null }>;

  return existingCampaigns.some(
    (campaign) =>
      campaign.slug === slug || slugifyCampaignName(campaign.name) === slug,
  );
}

export function listCampaigns() {
  const db = getDatabase();
  initializeDatabase(db);

  return db
    .prepare(
      `
        SELECT
          id,
          name,
          slug,
          description,
          book_id,
          layout_id,
          goal,
          drive_folder_url,
          drive_folder_id,
          drive_campaign_folder_url,
          drive_campaign_folder_id,
          drive_final_videos_folder_id,
          drive_metricool_folder_id,
          metricool_sheet_id,
          metricool_sheet_url,
          metricool_sheet_updated_at,
          hooks_sheet_url,
          default_caption,
          created_at,
          updated_at
        FROM campaigns
        ORDER BY datetime(created_at) DESC, name ASC
      `,
    )
    .all() as Campaign[];
}

export function getCampaign(campaignId: string) {
  const db = getDatabase();
  initializeDatabase(db);

  const campaign = db
    .prepare(
      `
        SELECT
          id,
          name,
          slug,
          description,
          book_id,
          layout_id,
          goal,
          drive_folder_url,
          drive_folder_id,
          drive_campaign_folder_url,
          drive_campaign_folder_id,
          drive_final_videos_folder_id,
          drive_metricool_folder_id,
          metricool_sheet_id,
          metricool_sheet_url,
          metricool_sheet_updated_at,
          hooks_sheet_url,
          default_caption,
          created_at,
          updated_at
        FROM campaigns
        WHERE id = ?
      `,
    )
    .get(campaignId) as Campaign | undefined;

  return campaign ?? null;
}

export function updateCampaignCaption(input: UpdateCampaignCaptionInput) {
  const db = getDatabase();
  initializeDatabase(db);

  const result = db
    .prepare(
      `
        UPDATE campaigns
        SET default_caption = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
    )
    .run(normalizeOptionalRawText(input.defaultCaption), input.campaignId);

  return result.changes > 0;
}

export function updateCampaignDriveFolder(input: UpdateCampaignDriveFolderInput) {
  const existingCampaign = getCampaign(input.campaignId);

  if (!existingCampaign) {
    throw new Error("Campaign not found.");
  }

  const db = getDatabase();
  initializeDatabase(db);

  const result = db
    .prepare(
      `
        UPDATE campaigns
        SET drive_campaign_folder_url = ?,
            drive_campaign_folder_id = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
    )
    .run(
      input.driveCampaignFolderUrl === undefined
        ? existingCampaign.drive_campaign_folder_url
        : normalizeOptionalText(input.driveCampaignFolderUrl),
      input.driveCampaignFolderId === undefined
        ? existingCampaign.drive_campaign_folder_id
        : normalizeOptionalText(input.driveCampaignFolderId),
      input.campaignId,
    );

  return result.changes > 0;
}

export function updateCampaignDriveOutputFolders(
  input: UpdateCampaignDriveOutputFoldersInput,
) {
  const existingCampaign = getCampaign(input.campaignId);

  if (!existingCampaign) {
    throw new Error("Campaign not found.");
  }

  const db = getDatabase();
  initializeDatabase(db);

  const result = db
    .prepare(
      `
        UPDATE campaigns
        SET drive_final_videos_folder_id = ?,
            drive_metricool_folder_id = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
    )
    .run(
      input.driveFinalVideosFolderId === undefined
        ? existingCampaign.drive_final_videos_folder_id
        : normalizeOptionalText(input.driveFinalVideosFolderId),
      input.driveMetricoolFolderId === undefined
        ? existingCampaign.drive_metricool_folder_id
        : normalizeOptionalText(input.driveMetricoolFolderId),
      input.campaignId,
    );

  return result.changes > 0;
}

export function updateCampaignMetricoolSheet(
  input: UpdateCampaignMetricoolSheetInput,
) {
  const existingCampaign = getCampaign(input.campaignId);

  if (!existingCampaign) {
    throw new Error("Campaign not found.");
  }

  const db = getDatabase();
  initializeDatabase(db);

  const result = db
    .prepare(
      `
        UPDATE campaigns
        SET metricool_sheet_id = ?,
            metricool_sheet_url = ?,
            metricool_sheet_updated_at = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
    )
    .run(
      input.metricoolSheetId === undefined
        ? existingCampaign.metricool_sheet_id
        : normalizeOptionalText(input.metricoolSheetId),
      input.metricoolSheetUrl === undefined
        ? existingCampaign.metricool_sheet_url
        : normalizeOptionalText(input.metricoolSheetUrl),
      input.metricoolSheetUpdatedAt === undefined
        ? existingCampaign.metricool_sheet_updated_at
        : normalizeOptionalText(input.metricoolSheetUpdatedAt),
      input.campaignId,
    );

  return result.changes > 0;
}

export function createBackgroundAsset(input: CreateBackgroundAssetInput) {
  const db = getDatabase();
  initializeDatabase(db);

  const id = nanoid();

  db.prepare(
    `
      INSERT INTO background_assets (
        id,
        campaign_id,
        google_file_id,
        filename,
        filepath,
        duration_seconds
      )
      VALUES (
        @id,
        @campaignId,
        @googleFileId,
        @filename,
        @filepath,
        @durationSeconds
      )
    `,
  ).run({
    id,
    campaignId: input.campaignId,
    googleFileId: normalizeOptionalText(input.googleFileId),
    filename: input.filename,
    filepath: input.filepath,
    durationSeconds: input.durationSeconds ?? null,
  });

  return id;
}

export function createScreenshotAsset(input: CreateScreenshotAssetInput) {
  const db = getDatabase();
  initializeDatabase(db);

  const id = nanoid();

  db.prepare(
    `
      INSERT INTO screenshot_assets (
        id,
        campaign_id,
        google_file_id,
        source_url,
        filename,
        filepath
      )
      VALUES (
        @id,
        @campaignId,
        @googleFileId,
        @sourceUrl,
        @filename,
        @filepath
      )
    `,
  ).run({
    id,
    campaignId: input.campaignId,
    googleFileId: normalizeOptionalText(input.googleFileId),
    sourceUrl: normalizeOptionalText(input.sourceUrl),
    filename: input.filename,
    filepath: input.filepath,
  });

  return id;
}

export function listBackgroundAssets(campaignId: string) {
  const db = getDatabase();
  initializeDatabase(db);

  return db
    .prepare(
      `
        SELECT
          id,
          campaign_id,
          google_file_id,
          filename,
          filepath,
          duration_seconds,
          created_at
        FROM background_assets
        WHERE campaign_id = ?
        ORDER BY datetime(created_at) DESC, filename ASC
      `,
    )
    .all(campaignId) as BackgroundAsset[];
}

export function listScreenshotAssets(campaignId: string) {
  const db = getDatabase();
  initializeDatabase(db);

  return db
    .prepare(
      `
        SELECT
          id,
          campaign_id,
          google_file_id,
          source_url,
          filename,
          filepath,
          created_at
        FROM screenshot_assets
        WHERE campaign_id = ?
        ORDER BY datetime(created_at) DESC, filename ASC
      `,
    )
    .all(campaignId) as ScreenshotAsset[];
}

export function listHooks(campaignId: string) {
  const db = getDatabase();
  initializeDatabase(db);

  return db
    .prepare(
      `
        SELECT
          id,
          campaign_id,
          screenshot_id,
          text,
          source_row_number,
          created_at
        FROM hooks
        WHERE campaign_id = ?
        ORDER BY datetime(created_at) ASC, rowid ASC
      `,
    )
    .all(campaignId) as Hook[];
}

export function getHookCountsByScreenshot(campaignId: string) {
  const db = getDatabase();
  initializeDatabase(db);

  const rows = db
    .prepare(
      `
        SELECT screenshot_id, COUNT(*) AS count
        FROM hooks
        WHERE campaign_id = ?
        GROUP BY screenshot_id
      `,
    )
    .all(campaignId) as Array<{ screenshot_id: string; count: number }>;

  return new Map(rows.map((row) => [row.screenshot_id, row.count]));
}

export function createHooksForScreenshot(input: CreateHooksInput) {
  const trimmedHooks = input.lines
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (trimmedHooks.length === 0) {
    return 0;
  }

  const db = getDatabase();
  initializeDatabase(db);

  const screenshot = db
    .prepare(
      `
        SELECT id
        FROM screenshot_assets
        WHERE id = ?
          AND campaign_id = ?
      `,
    )
    .get(input.screenshotId, input.campaignId);

  if (!screenshot) {
    throw new Error("Screenshot not found for this campaign.");
  }

  const insertHook = db.prepare(
    `
      INSERT INTO hooks (
        id,
        campaign_id,
        screenshot_id,
        text
      )
      VALUES (
        @id,
        @campaignId,
        @screenshotId,
        @text
      )
    `,
  );

  const insertMany = db.transaction((hookTexts: string[]) => {
    for (const text of hookTexts) {
      insertHook.run({
        id: nanoid(),
        campaignId: input.campaignId,
        screenshotId: input.screenshotId,
        text,
      });
    }
  });

  insertMany(trimmedHooks);

  return trimmedHooks.length;
}

export function deleteHook(campaignId: string, hookId: string) {
  const db = getDatabase();
  initializeDatabase(db);

  const result = db
    .prepare(
      `
        DELETE FROM hooks
        WHERE id = ?
          AND campaign_id = ?
      `,
    )
    .run(hookId, campaignId);

  return result.changes > 0;
}

export function createAudioAsset(input: CreateAudioAssetInput) {
  const db = getDatabase();
  initializeDatabase(db);

  const id = input.id ?? nanoid();
  const title = input.title.trim();

  if (!title) {
    throw new Error("Audio title is required.");
  }

  db.prepare(
    `
      INSERT INTO audio_assets (
        id,
        campaign_id,
        title,
        source_url,
        music_id,
        filename,
        filepath,
        duration_seconds,
        notes
      )
      VALUES (
        @id,
        @campaignId,
        @title,
        @sourceUrl,
        @musicId,
        @filename,
        @filepath,
        @durationSeconds,
        @notes
      )
    `,
  ).run({
    id,
    campaignId: input.campaignId ?? null,
    title,
    sourceUrl: normalizeOptionalText(input.sourceUrl),
    musicId: normalizeOptionalText(input.musicId),
    filename: input.filename,
    filepath: input.filepath,
    durationSeconds: input.durationSeconds ?? null,
    notes: normalizeOptionalText(input.notes),
  });

  return id;
}

function normalizeAudioTags(tags: string[]) {
  return Array.from(
    new Set(
      tags
        .map((tag) => tag.trim().toLowerCase())
        .filter((tag) => tag.length > 0),
    ),
  ).sort((a, b) => a.localeCompare(b));
}

function listAudioTagsForAudioIds(audioIds: string[]) {
  const uniqueAudioIds = Array.from(new Set(audioIds));

  if (uniqueAudioIds.length === 0) {
    return new Map<string, string[]>();
  }

  const db = getDatabase();
  initializeDatabase(db);
  const placeholders = uniqueAudioIds.map(() => "?").join(", ");
  const rows = db
    .prepare(
      `
        SELECT audio_id, tag
        FROM audio_tags
        WHERE audio_id IN (${placeholders})
        ORDER BY tag ASC
      `,
    )
    .all(...uniqueAudioIds) as Array<{ audio_id: string; tag: string }>;
  const tagsByAudioId = new Map<string, string[]>();

  for (const row of rows) {
    const tags = tagsByAudioId.get(row.audio_id) ?? [];

    tags.push(row.tag);
    tagsByAudioId.set(row.audio_id, tags);
  }

  return tagsByAudioId;
}

function attachAudioTags(audioAssets: AudioAsset[]) {
  const tagsByAudioId = listAudioTagsForAudioIds(
    audioAssets.map((audio) => audio.id),
  );

  return audioAssets.map((audio) => ({
    ...audio,
    tags: tagsByAudioId.get(audio.id) ?? [],
  }));
}

export function listAudioTags() {
  const db = getDatabase();
  initializeDatabase(db);

  return (
    db
      .prepare(
        `
          SELECT DISTINCT tag
          FROM audio_tags
          ORDER BY tag ASC
        `,
      )
      .all() as Array<{ tag: string }>
  ).map((row) => row.tag);
}

export function updateAudioAssetTags(audioId: string, tags: string[]) {
  const db = getDatabase();
  initializeDatabase(db);
  const audioAsset = getAudioAsset(audioId);

  if (!audioAsset) {
    throw new Error("Audio asset not found.");
  }

  const normalizedTags = normalizeAudioTags(tags);
  const replaceTags = db.transaction(() => {
    db.prepare("DELETE FROM audio_tags WHERE audio_id = ?").run(audioId);
    const insertTag = db.prepare(
      `
        INSERT INTO audio_tags (
          id,
          audio_id,
          tag
        )
        VALUES (?, ?, ?)
      `,
    );

    for (const tag of normalizedTags) {
      insertTag.run(nanoid(), audioId, tag);
    }
  });

  replaceTags();

  return normalizedTags;
}

export function listAudioAssets(campaignId: string) {
  const db = getDatabase();
  initializeDatabase(db);

  const audioAssets = db
    .prepare(
      `
        SELECT
          id,
          campaign_id,
          title,
          source_url,
          music_id,
          filename,
          filepath,
          duration_seconds,
          notes,
          created_at
        FROM audio_assets
        WHERE campaign_id = ?
        ORDER BY datetime(created_at) DESC, title ASC
      `,
    )
    .all(campaignId) as AudioAsset[];

  return attachAudioTags(audioAssets);
}

export function listAllAudioAssets() {
  const db = getDatabase();
  initializeDatabase(db);

  const audioAssets = db
    .prepare(
      `
        SELECT
          id,
          campaign_id,
          title,
          source_url,
          music_id,
          filename,
          filepath,
          duration_seconds,
          notes,
          created_at
        FROM audio_assets
        ORDER BY datetime(created_at) DESC, title ASC
      `,
    )
    .all() as AudioAsset[];

  return attachAudioTags(audioAssets);
}

export function getAudioAsset(audioId: string) {
  const db = getDatabase();
  initializeDatabase(db);

  const audioAsset = db
    .prepare(
      `
        SELECT
          id,
          campaign_id,
          title,
          source_url,
          music_id,
          filename,
          filepath,
          duration_seconds,
          notes,
          created_at
        FROM audio_assets
        WHERE id = ?
      `,
    )
    .get(audioId) as AudioAsset | undefined;

  return audioAsset
    ? {
        ...audioAsset,
        tags: listAudioTagsForAudioIds([audioAsset.id]).get(audioAsset.id) ?? [],
      }
    : null;
}

export function getAudioReferenceCounts(audioId: string): AudioReferenceCounts {
  const db = getDatabase();
  initializeDatabase(db);
  const renderJobCount = db
    .prepare("SELECT COUNT(*) AS count FROM render_jobs WHERE audio_id = ?")
    .get(audioId) as { count: number };
  const campaignSelectionCount = db
    .prepare(
      "SELECT COUNT(*) AS count FROM campaign_audio_selections WHERE audio_id = ?",
    )
    .get(audioId) as { count: number };

  return {
    renderJobCount: renderJobCount.count,
    campaignSelectionCount: campaignSelectionCount.count,
  };
}

export function deleteUnusedAudioAsset(audioId: string) {
  const db = getDatabase();
  initializeDatabase(db);
  const audioAsset = getAudioAsset(audioId);

  if (!audioAsset) {
    throw new Error("Audio asset not found.");
  }

  const references = getAudioReferenceCounts(audioId);

  if (references.renderJobCount > 0 || references.campaignSelectionCount > 0) {
    throw new Error(
      [
        "Audio is still in use.",
        references.renderJobCount > 0
          ? `${references.renderJobCount} render job(s) reference it.`
          : null,
        references.campaignSelectionCount > 0
          ? `${references.campaignSelectionCount} campaign selection(s) reference it.`
          : null,
      ]
        .filter(Boolean)
        .join(" "),
    );
  }

  const result = db
    .prepare("DELETE FROM audio_assets WHERE id = ?")
    .run(audioId);

  if (result.changes === 0) {
    throw new Error("Audio asset not found.");
  }

  return audioAsset;
}

function listSelectedBookBackgrounds(campaignId: string) {
  const db = getDatabase();
  initializeDatabase(db);

  return db
    .prepare(
      `
        SELECT
          book_backgrounds.id,
          book_backgrounds.book_id,
          book_backgrounds.google_file_id,
          book_backgrounds.filename,
          book_backgrounds.filepath,
          book_backgrounds.duration_seconds,
          book_backgrounds.created_at
        FROM campaign_background_selections
        JOIN book_backgrounds
          ON book_backgrounds.id = campaign_background_selections.background_id
        WHERE campaign_background_selections.campaign_id = ?
        ORDER BY campaign_background_selections.created_at DESC
      `,
    )
    .all(campaignId) as BookBackground[];
}

function listSelectedBookScreenshots(campaignId: string) {
  const db = getDatabase();
  initializeDatabase(db);

  return db
    .prepare(
      `
        SELECT
          book_screenshots.id,
          book_screenshots.book_id,
          book_screenshots.google_file_id,
          book_screenshots.source_url,
          book_screenshots.filename,
          book_screenshots.filepath,
          book_screenshots.created_at
        FROM campaign_screenshot_selections
        JOIN book_screenshots
          ON book_screenshots.id = campaign_screenshot_selections.screenshot_id
        WHERE campaign_screenshot_selections.campaign_id = ?
        ORDER BY campaign_screenshot_selections.created_at DESC
      `,
    )
    .all(campaignId) as BookScreenshot[];
}

function listBookHooksForSelectedScreenshots(campaignId: string) {
  const db = getDatabase();
  initializeDatabase(db);

  return db
    .prepare(
      `
        SELECT
          book_hooks.id,
          book_hooks.book_id,
          book_hooks.screenshot_id,
          book_hooks.text,
          book_hooks.source_row_number,
          book_hooks.created_at
        FROM campaign_screenshot_selections
        JOIN book_hooks
          ON book_hooks.screenshot_id = campaign_screenshot_selections.screenshot_id
        WHERE campaign_screenshot_selections.campaign_id = ?
        ORDER BY book_hooks.created_at ASC, book_hooks.rowid ASC
      `,
    )
    .all(campaignId) as BookHook[];
}

function listSelectedAudioAssets(campaignId: string) {
  const db = getDatabase();
  initializeDatabase(db);

  return db
    .prepare(
      `
        SELECT
          audio_assets.id,
          audio_assets.campaign_id,
          audio_assets.title,
          audio_assets.source_url,
          audio_assets.music_id,
          audio_assets.filename,
          audio_assets.filepath,
          audio_assets.duration_seconds,
          audio_assets.notes,
          audio_assets.created_at
        FROM campaign_audio_selections
        JOIN audio_assets
          ON audio_assets.id = campaign_audio_selections.audio_id
        WHERE campaign_audio_selections.campaign_id = ?
        ORDER BY campaign_audio_selections.created_at DESC
      `,
    )
    .all(campaignId) as AudioAsset[];
}

export function getBookRenderMatrixStats(campaignId: string) {
  const backgrounds = listSelectedBookBackgrounds(campaignId);
  const screenshots = listSelectedBookScreenshots(campaignId);
  const hooks = listBookHooksForSelectedScreenshots(campaignId);
  const audioAssets = listSelectedAudioAssets(campaignId);

  return {
    backgroundCount: backgrounds.length,
    screenshotCount: screenshots.length,
    hookCount: hooks.length,
    audioCount: audioAssets.length,
    previewCount: backgrounds.length * hooks.length * Math.max(audioAssets.length, 1),
    audioAssets,
  };
}

export function generateRenderJobs({
  campaignId,
  audioId,
}: GenerateRenderJobsInput): GenerateRenderJobsResult {
  const db = getDatabase();
  initializeDatabase(db);

  const campaign = getCampaign(campaignId);

  if (!campaign) {
    throw new Error("Campaign not found.");
  }

  if (campaign.book_id) {
    const backgrounds = listSelectedBookBackgrounds(campaignId);
    const screenshots = listSelectedBookScreenshots(campaignId);
    const hooks = listBookHooksForSelectedScreenshots(campaignId);
    const audioAssets = listSelectedAudioAssets(campaignId);
    const selectedAudioIds = audioAssets.map((audio) => audio.id);
    const audioIds = selectedAudioIds.length > 0 ? selectedAudioIds : [null];
    const screenshotIds = new Set(screenshots.map((screenshot) => screenshot.id));
    const validHooks = hooks.filter((hook) => screenshotIds.has(hook.screenshot_id));
    const previewCount = backgrounds.length * validHooks.length * audioIds.length;

    if (previewCount === 0) {
      return {
        previewCount,
        createdCount: 0,
        skippedDuplicateCount: 0,
      };
    }

    const insertRenderJob = db.prepare(
      `
        INSERT OR IGNORE INTO render_jobs (
          id,
          campaign_id,
          background_id,
          screenshot_id,
          hook_id,
          audio_id,
          background_source,
          screenshot_source,
          hook_source,
          caption,
          status
        )
        VALUES (
          @id,
          @campaignId,
          @backgroundId,
          @screenshotId,
          @hookId,
          @audioId,
          'book',
          'book',
          'book',
          @caption,
          'pending'
        )
      `,
    );

    const insertMany = db.transaction(() => {
      let createdCount = 0;

      for (const background of backgrounds) {
        for (const hook of validHooks) {
          for (const selectedAudioId of audioIds) {
            const result = insertRenderJob.run({
              id: nanoid(),
              campaignId,
              backgroundId: background.id,
              screenshotId: hook.screenshot_id,
              hookId: hook.id,
              audioId: selectedAudioId,
              caption: buildRenderCaption(hook.text, campaign.default_caption),
            });

            createdCount += result.changes;
          }
        }
      }

      return createdCount;
    });

    const createdCount = insertMany();

    return {
      previewCount,
      createdCount,
      skippedDuplicateCount: previewCount - createdCount,
    };
  }

  const selectedAudioId = audioId ?? null;

  if (selectedAudioId) {
    const audio = db
      .prepare(
        `
          SELECT id
          FROM audio_assets
          WHERE id = ?
            AND campaign_id = ?
        `,
      )
      .get(selectedAudioId, campaignId);

    if (!audio) {
      throw new Error("Selected audio asset was not found for this campaign.");
    }
  }

  const backgrounds = listBackgroundAssets(campaignId);
  const screenshots = listScreenshotAssets(campaignId);
  const hooks = listHooks(campaignId);
  const screenshotIds = new Set(screenshots.map((screenshot) => screenshot.id));
  const validHooks = hooks.filter((hook) => screenshotIds.has(hook.screenshot_id));
  const previewCount = backgrounds.length * validHooks.length;

  if (previewCount === 0) {
    return {
      previewCount,
      createdCount: 0,
      skippedDuplicateCount: 0,
    };
  }

  const insertRenderJob = db.prepare(
    `
      INSERT OR IGNORE INTO render_jobs (
        id,
        campaign_id,
        background_id,
        screenshot_id,
        hook_id,
        audio_id,
        caption,
        status
      )
      VALUES (
        @id,
        @campaignId,
        @backgroundId,
        @screenshotId,
        @hookId,
        @audioId,
        @caption,
        'pending'
      )
    `,
  );

  const insertMany = db.transaction(() => {
    let createdCount = 0;

    for (const background of backgrounds) {
      for (const hook of validHooks) {
        const result = insertRenderJob.run({
          id: nanoid(),
          campaignId,
          backgroundId: background.id,
          screenshotId: hook.screenshot_id,
          hookId: hook.id,
          audioId: selectedAudioId,
          caption: buildRenderCaption(hook.text, campaign.default_caption),
        });

        createdCount += result.changes;
      }
    }

    return createdCount;
  });

  const createdCount = insertMany();

  return {
    previewCount,
    createdCount,
    skippedDuplicateCount: previewCount - createdCount,
  };
}

export function listRenderJobs(campaignId: string) {
  const db = getDatabase();
  initializeDatabase(db);

  return db
    .prepare(
      `
        SELECT
          render_jobs.id,
          render_jobs.campaign_id,
          render_jobs.batch_id,
          render_jobs.background_id,
          render_jobs.screenshot_id,
          render_jobs.hook_id,
          render_jobs.audio_id,
          render_jobs.thumbnail_id,
          render_jobs.thumbnail_drive_url,
          render_jobs.render_duration_seconds,
          render_jobs.audio_start_offset_seconds,
          render_jobs.render_options_json,
          render_jobs.background_source,
          render_jobs.screenshot_source,
          render_jobs.hook_source,
          render_jobs.caption,
          render_jobs.output_filename,
          render_jobs.output_filepath,
          render_jobs.drive_file_id,
          render_jobs.drive_url,
          render_jobs.status,
          render_jobs.error,
          render_jobs.created_at,
          render_jobs.updated_at,
          COALESCE(background_assets.filename, book_backgrounds.filename) AS background_filename,
          COALESCE(background_assets.filepath, book_backgrounds.filepath) AS background_filepath,
          COALESCE(screenshot_assets.filename, book_screenshots.filename) AS screenshot_filename,
          COALESCE(screenshot_assets.filepath, book_screenshots.filepath) AS screenshot_filepath,
          COALESCE(hooks.text, book_hooks.text) AS hook_text,
          render_batches.caption AS batch_caption,
          audio_assets.title AS audio_title,
          audio_assets.filepath AS audio_filepath,
          book_thumbnails.filename AS thumbnail_filename,
          book_thumbnails.filepath AS thumbnail_filepath
        FROM render_jobs
        LEFT JOIN render_batches
          ON render_batches.id = render_jobs.batch_id
        LEFT JOIN background_assets
          ON background_assets.id = render_jobs.background_id
          AND render_jobs.background_source = 'campaign'
        LEFT JOIN book_backgrounds
          ON book_backgrounds.id = render_jobs.background_id
          AND render_jobs.background_source = 'book'
        LEFT JOIN screenshot_assets
          ON screenshot_assets.id = render_jobs.screenshot_id
          AND render_jobs.screenshot_source = 'campaign'
        LEFT JOIN book_screenshots
          ON book_screenshots.id = render_jobs.screenshot_id
          AND render_jobs.screenshot_source = 'book'
        LEFT JOIN hooks
          ON hooks.id = render_jobs.hook_id
          AND render_jobs.hook_source = 'campaign'
        LEFT JOIN book_hooks
          ON book_hooks.id = render_jobs.hook_id
          AND render_jobs.hook_source = 'book'
        LEFT JOIN audio_assets
          ON audio_assets.id = render_jobs.audio_id
        LEFT JOIN book_thumbnails
          ON book_thumbnails.id = render_jobs.thumbnail_id
        WHERE render_jobs.campaign_id = ?
        ORDER BY datetime(render_jobs.created_at) DESC, render_jobs.id ASC
      `,
    )
    .all(campaignId) as RenderJobListItem[];
}

export function listRenderJobsByBatch(batchId: string) {
  const db = getDatabase();
  initializeDatabase(db);

  return db
    .prepare(
      `
        SELECT
          render_jobs.id,
          render_jobs.campaign_id,
          render_jobs.batch_id,
          render_jobs.background_id,
          render_jobs.screenshot_id,
          render_jobs.hook_id,
          render_jobs.audio_id,
          render_jobs.thumbnail_id,
          render_jobs.thumbnail_drive_url,
          render_jobs.render_duration_seconds,
          render_jobs.audio_start_offset_seconds,
          render_jobs.render_options_json,
          render_jobs.background_source,
          render_jobs.screenshot_source,
          render_jobs.hook_source,
          render_jobs.caption,
          render_jobs.output_filename,
          render_jobs.output_filepath,
          render_jobs.drive_file_id,
          render_jobs.drive_url,
          render_jobs.status,
          render_jobs.error,
          render_jobs.created_at,
          render_jobs.updated_at,
          COALESCE(background_assets.filename, book_backgrounds.filename) AS background_filename,
          COALESCE(background_assets.filepath, book_backgrounds.filepath) AS background_filepath,
          COALESCE(screenshot_assets.filename, book_screenshots.filename) AS screenshot_filename,
          COALESCE(screenshot_assets.filepath, book_screenshots.filepath) AS screenshot_filepath,
          COALESCE(hooks.text, book_hooks.text) AS hook_text,
          render_batches.caption AS batch_caption,
          audio_assets.title AS audio_title,
          audio_assets.filepath AS audio_filepath,
          book_thumbnails.filename AS thumbnail_filename,
          book_thumbnails.filepath AS thumbnail_filepath
        FROM render_jobs
        LEFT JOIN render_batches
          ON render_batches.id = render_jobs.batch_id
        LEFT JOIN background_assets
          ON background_assets.id = render_jobs.background_id
          AND render_jobs.background_source = 'campaign'
        LEFT JOIN book_backgrounds
          ON book_backgrounds.id = render_jobs.background_id
          AND render_jobs.background_source = 'book'
        LEFT JOIN screenshot_assets
          ON screenshot_assets.id = render_jobs.screenshot_id
          AND render_jobs.screenshot_source = 'campaign'
        LEFT JOIN book_screenshots
          ON book_screenshots.id = render_jobs.screenshot_id
          AND render_jobs.screenshot_source = 'book'
        LEFT JOIN hooks
          ON hooks.id = render_jobs.hook_id
          AND render_jobs.hook_source = 'campaign'
        LEFT JOIN book_hooks
          ON book_hooks.id = render_jobs.hook_id
          AND render_jobs.hook_source = 'book'
        LEFT JOIN audio_assets
          ON audio_assets.id = render_jobs.audio_id
        LEFT JOIN book_thumbnails
          ON book_thumbnails.id = render_jobs.thumbnail_id
        WHERE render_jobs.batch_id = ?
        ORDER BY datetime(render_jobs.created_at) DESC, render_jobs.id ASC
      `,
    )
    .all(batchId) as RenderJobListItem[];
}

export function getRenderJobDetails(jobId: string) {
  const db = getDatabase();
  initializeDatabase(db);

  const job = db
    .prepare(
      `
        SELECT
          render_jobs.id,
          render_jobs.campaign_id,
          render_jobs.batch_id,
          render_jobs.background_id,
          render_jobs.screenshot_id,
          render_jobs.hook_id,
          render_jobs.audio_id,
          render_jobs.thumbnail_id,
          render_jobs.thumbnail_drive_url,
          render_jobs.render_duration_seconds,
          render_jobs.audio_start_offset_seconds,
          render_jobs.render_options_json,
          render_jobs.background_source,
          render_jobs.screenshot_source,
          render_jobs.hook_source,
          render_jobs.caption,
          render_jobs.output_filename,
          render_jobs.output_filepath,
          render_jobs.drive_file_id,
          render_jobs.drive_url,
          render_jobs.status,
          render_jobs.error,
          render_jobs.created_at,
          render_jobs.updated_at,
          COALESCE(background_assets.filename, book_backgrounds.filename) AS background_filename,
          COALESCE(background_assets.filepath, book_backgrounds.filepath) AS background_filepath,
          COALESCE(screenshot_assets.filename, book_screenshots.filename) AS screenshot_filename,
          COALESCE(screenshot_assets.filepath, book_screenshots.filepath) AS screenshot_filepath,
          COALESCE(hooks.text, book_hooks.text) AS hook_text,
          render_batches.caption AS batch_caption,
          audio_assets.title AS audio_title,
          audio_assets.filepath AS audio_filepath,
          book_thumbnails.filename AS thumbnail_filename,
          book_thumbnails.filepath AS thumbnail_filepath
        FROM render_jobs
        LEFT JOIN render_batches
          ON render_batches.id = render_jobs.batch_id
        LEFT JOIN background_assets
          ON background_assets.id = render_jobs.background_id
          AND render_jobs.background_source = 'campaign'
        LEFT JOIN book_backgrounds
          ON book_backgrounds.id = render_jobs.background_id
          AND render_jobs.background_source = 'book'
        LEFT JOIN screenshot_assets
          ON screenshot_assets.id = render_jobs.screenshot_id
          AND render_jobs.screenshot_source = 'campaign'
        LEFT JOIN book_screenshots
          ON book_screenshots.id = render_jobs.screenshot_id
          AND render_jobs.screenshot_source = 'book'
        LEFT JOIN hooks
          ON hooks.id = render_jobs.hook_id
          AND render_jobs.hook_source = 'campaign'
        LEFT JOIN book_hooks
          ON book_hooks.id = render_jobs.hook_id
          AND render_jobs.hook_source = 'book'
        LEFT JOIN audio_assets
          ON audio_assets.id = render_jobs.audio_id
        LEFT JOIN book_thumbnails
          ON book_thumbnails.id = render_jobs.thumbnail_id
        WHERE render_jobs.id = ?
      `,
    )
    .get(jobId) as RenderJobDetails | undefined;

  return job ?? null;
}

export function markRenderJobRunning(jobId: string) {
  const db = getDatabase();
  initializeDatabase(db);

  db.prepare(
    `
      UPDATE render_jobs
      SET status = 'running',
          error = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
  ).run(jobId);
}

export function markRenderJobDone(input: CompleteRenderJobInput) {
  const db = getDatabase();
  initializeDatabase(db);

  db.prepare(
    `
      UPDATE render_jobs
      SET status = 'done',
          error = NULL,
          output_filename = ?,
          output_filepath = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
  ).run(input.outputFilename, input.outputFilepath, input.jobId);
}

export function updateRenderJobDriveFile(input: UpdateRenderJobDriveFileInput) {
  const db = getDatabase();
  initializeDatabase(db);

  const result = db
    .prepare(
      `
        UPDATE render_jobs
        SET drive_file_id = ?,
            drive_url = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
    )
    .run(
      normalizeOptionalText(input.driveFileId),
      normalizeOptionalText(input.driveUrl),
      input.jobId,
    );

  return result.changes > 0;
}

export function enqueueCampaignVideoUploads(campaignId: string) {
  const db = getDatabase();
  initializeDatabase(db);

  const campaign = getCampaign(campaignId);

  if (!campaign) {
    throw new Error("Campaign not found.");
  }

  const jobs = db
    .prepare(
      `
        SELECT id
        FROM render_jobs
        WHERE campaign_id = ?
          AND status = 'done'
          AND output_filepath IS NOT NULL
          AND COALESCE(drive_file_id, '') = ''
          AND COALESCE(drive_url, '') = ''
        ORDER BY datetime(created_at) ASC, id ASC
      `,
    )
    .all(campaignId) as Array<{ id: string }>;

  const insert = db.prepare(
    `
      INSERT OR IGNORE INTO drive_video_upload_queue (
        id,
        campaign_id,
        render_job_id,
        status
      )
      VALUES (
        @id,
        @campaignId,
        @renderJobId,
        'queued'
      )
    `,
  );
  const requeue = db.prepare(
    `
      UPDATE drive_video_upload_queue
      SET status = 'queued',
          error = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE render_job_id = ?
        AND status = 'failed'
    `,
  );
  const enqueue = db.transaction(() => {
    let inserted = 0;
    let requeued = 0;

    for (const job of jobs) {
      const result = insert.run({
        id: nanoid(),
        campaignId,
        renderJobId: job.id,
      });
      inserted += result.changes;

      if (result.changes === 0) {
        requeued += requeue.run(job.id).changes;
      }
    }

    return {
      inserted,
      requeued,
      eligible: jobs.length,
    };
  });

  return enqueue();
}

export function getCampaignVideoUploadQueueStats(
  campaignId: string,
): VideoUploadQueueStats {
  const db = getDatabase();
  initializeDatabase(db);
  const stats: VideoUploadQueueStats = {
    queued: 0,
    running: 0,
    done: 0,
    failed: 0,
    total: 0,
  };
  const rows = db
    .prepare(
      `
        SELECT status, COUNT(*) AS count
        FROM drive_video_upload_queue
        WHERE campaign_id = ?
        GROUP BY status
      `,
    )
    .all(campaignId) as Array<{
    status: VideoUploadQueueStatus;
    count: number;
  }>;

  for (const row of rows) {
    stats[row.status] = row.count;
    stats.total += row.count;
  }

  return stats;
}

export function claimNextVideoUploadQueueItem(campaignId?: string) {
  const db = getDatabase();
  initializeDatabase(db);

  const claim = db.transaction(() => {
    const item = db
      .prepare(
        `
          SELECT
            id,
            campaign_id,
            render_job_id,
            status,
            attempts,
            error,
            created_at,
            updated_at
          FROM drive_video_upload_queue
          WHERE status = 'queued'
            AND (? IS NULL OR campaign_id = ?)
          ORDER BY datetime(created_at) ASC, id ASC
          LIMIT 1
        `,
      )
      .get(campaignId ?? null, campaignId ?? null) as
      | VideoUploadQueueItem
      | undefined;

    if (!item) {
      return null;
    }

    db.prepare(
      `
        UPDATE drive_video_upload_queue
        SET status = 'running',
            attempts = attempts + 1,
            error = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
    ).run(item.id);

    return {
      ...item,
      status: "running" as const,
      attempts: item.attempts + 1,
      error: null,
    };
  });

  return claim();
}

export function markVideoUploadQueueItemDone(queueItemId: string) {
  const db = getDatabase();
  initializeDatabase(db);

  db.prepare(
    `
      UPDATE drive_video_upload_queue
      SET status = 'done',
          error = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
  ).run(queueItemId);
}

export function markVideoUploadQueueItemFailed(
  queueItemId: string,
  error: string,
) {
  const db = getDatabase();
  initializeDatabase(db);

  db.prepare(
    `
      UPDATE drive_video_upload_queue
      SET status = 'failed',
          error = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
  ).run(error, queueItemId);
}

export function markRenderJobFailed(jobId: string, error: string) {
  const db = getDatabase();
  initializeDatabase(db);

  db.prepare(
    `
      UPDATE render_jobs
      SET status = 'failed',
          error = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
  ).run(error, jobId);
}

export function closeDatabase() {
  database?.close();
  database = undefined;
}
