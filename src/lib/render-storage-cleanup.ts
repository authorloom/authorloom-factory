import fs from "node:fs/promises";
import path from "node:path";

import { getDatabase, initializeDatabase } from "@/lib/db";
import { paths } from "@/lib/paths";

export type RenderStorageCleanupOptions = {
  dryRun?: boolean;
  maxAgeHours?: number;
  maxBytes?: number;
  deleteUploadedRenders?: boolean;
  now?: number;
};

export type RenderStorageCleanupResult = {
  dryRun: boolean;
  scannedFiles: number;
  eligibleFiles: number;
  deletedFiles: number;
  bytesScanned: number;
  bytesEligible: number;
  bytesDeleted: number;
  skippedFiles: number;
  logs: string[];
};

type RenderFile = {
  filepath: string;
  bytes: number;
  mtimeMs: number;
  referenced: boolean;
  uploaded: boolean;
};

export async function cleanupRenderStorage(
  options: RenderStorageCleanupOptions = {},
): Promise<RenderStorageCleanupResult> {
  const dryRun = options.dryRun ?? true;
  const now = options.now ?? Date.now();
  const maxAgeHours =
    options.maxAgeHours ??
    Number(process.env.AUTHORLOOM_RENDER_RETENTION_HOURS ?? 72);
  const maxBytes =
    options.maxBytes ??
    parseStorageBytes(process.env.AUTHORLOOM_RENDER_MAX_BYTES) ??
    20 * 1024 * 1024 * 1024;
  const deleteUploadedRenders =
    options.deleteUploadedRenders ??
    process.env.AUTHORLOOM_DELETE_UPLOADED_RENDERS === "true";
  const result: RenderStorageCleanupResult = {
    dryRun,
    scannedFiles: 0,
    eligibleFiles: 0,
    deletedFiles: 0,
    bytesScanned: 0,
    bytesEligible: 0,
    bytesDeleted: 0,
    skippedFiles: 0,
    logs: [],
  };

  await fs.mkdir(paths.rendersDirectory, { recursive: true });

  const renderFiles = await listRenderFiles(paths.rendersDirectory);
  const references = getRenderReferences();
  const files: RenderFile[] = [];

  for (const file of renderFiles) {
    const stats = await fs.stat(file);
    const normalized = path.resolve(file);
    const reference = references.get(normalized);
    const uploaded = Boolean(reference?.driveUrl);
    files.push({
      filepath: normalized,
      bytes: stats.size,
      mtimeMs: stats.mtimeMs,
      referenced: Boolean(reference),
      uploaded,
    });
    result.scannedFiles += 1;
    result.bytesScanned += stats.size;
  }

  const ageCutoffMs = now - maxAgeHours * 60 * 60 * 1000;
  const eligible = files
    .filter((file) => {
      if (file.referenced && !file.uploaded) return false;
      if (file.uploaded && !deleteUploadedRenders) return false;
      return file.mtimeMs <= ageCutoffMs;
    })
    .sort((left, right) => left.mtimeMs - right.mtimeMs);
  let projectedBytes = result.bytesScanned;

  for (const file of eligible) {
    const ageEligible = file.mtimeMs <= ageCutoffMs;
    const sizePressure = projectedBytes > maxBytes;

    if (!ageEligible && !sizePressure) continue;

    result.eligibleFiles += 1;
    result.bytesEligible += file.bytes;
    projectedBytes -= file.bytes;

    if (dryRun) {
      result.logs.push(
        `Would delete ${file.filepath} (${formatBytes(file.bytes)}).`,
      );
      continue;
    }

    await fs.rm(file.filepath, { force: true });
    result.deletedFiles += 1;
    result.bytesDeleted += file.bytes;
    result.logs.push(`Deleted ${file.filepath} (${formatBytes(file.bytes)}).`);
  }

  result.skippedFiles = result.scannedFiles - result.eligibleFiles;
  result.logs.unshift(
    `Render cleanup ${dryRun ? "dry run" : "executed"}: ${result.deletedFiles} file(s), ${formatBytes(result.bytesDeleted)} recovered.`,
  );

  return result;
}

async function listRenderFiles(directory: string): Promise<string[]> {
  let entries: Array<import("node:fs").Dirent>;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }

  const nested = await Promise.all(
    entries.map(async (entry) => {
      const filepath = path.join(directory, entry.name);
      if (entry.isDirectory()) return listRenderFiles(filepath);
      if (entry.isFile() && entry.name.toLowerCase().endsWith(".mp4")) return [filepath];
      return [];
    }),
  );

  return nested.flat();
}

function getRenderReferences() {
  const db = getDatabase();
  initializeDatabase(db);
  const rows = db
    .prepare(
      `
        SELECT output_filepath, drive_url
        FROM render_jobs
        WHERE output_filepath IS NOT NULL
      `,
    )
    .all() as Array<{ output_filepath: string | null; drive_url: string | null }>;

  return new Map(
    rows
      .filter((row) => row.output_filepath)
      .map((row) => [
        path.resolve(row.output_filepath as string),
        { driveUrl: row.drive_url },
      ]),
  );
}

function parseStorageBytes(value: string | undefined) {
  if (!value) return null;
  const match = value.trim().match(/^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb|tb)?$/i);
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = (match[2] ?? "b").toLowerCase();
  const multiplier =
    unit === "tb"
      ? 1024 ** 4
      : unit === "gb"
        ? 1024 ** 3
        : unit === "mb"
          ? 1024 ** 2
          : unit === "kb"
            ? 1024
            : 1;
  return Math.round(amount * multiplier);
}

function formatBytes(bytes: number) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${bytes} B`;
}
