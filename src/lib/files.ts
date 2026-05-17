import path from "node:path";
import { nanoid } from "nanoid";

export const backgroundVideoExtensions = ["mp4", "mov", "m4v"] as const;
export const screenshotImageExtensions = [
  "png",
  "jpg",
  "jpeg",
  "webp",
] as const;
export const coverImageExtensions = screenshotImageExtensions;
export const manuscriptExtensions = ["pdf", "doc", "docx", "txt"] as const;

const unsafeFilenamePattern = /[\/\\\0]/;

export function getFileExtension(filename: string) {
  const extension = path.extname(filename).slice(1).toLowerCase();
  return extension || null;
}

export function assertSafeOriginalFilename(filename: string) {
  const trimmed = filename.trim();

  if (!trimmed) {
    throw new Error("Filename is required.");
  }

  if (unsafeFilenamePattern.test(trimmed) || trimmed !== path.basename(trimmed)) {
    throw new Error(`Unsafe filename rejected: ${filename}`);
  }
}

export function assertAllowedExtension(
  filename: string,
  allowedExtensions: readonly string[],
) {
  const extension = getFileExtension(filename);

  if (!extension || !allowedExtensions.includes(extension)) {
    throw new Error(
      `Unsupported file extension. Allowed: ${allowedExtensions.join(", ")}`,
    );
  }

  return extension;
}

export function createStoredFilename(originalFilename: string) {
  const extension = assertAllowedExtension(originalFilename, [
    ...backgroundVideoExtensions,
    ...screenshotImageExtensions,
    ...manuscriptExtensions,
  ]);
  const basename = path.basename(originalFilename, path.extname(originalFilename));
  const safeBasename =
    basename
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "asset";

  return `${nanoid()}-${safeBasename}.${extension}`;
}
