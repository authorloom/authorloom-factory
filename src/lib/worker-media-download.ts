import path from "node:path";

const contentTypeExtensions: Record<string, string> = {
  "audio/aac": ".aac",
  "audio/flac": ".flac",
  "audio/m4a": ".m4a",
  "audio/mp4": ".m4a",
  "audio/mpeg": ".mp3",
  "audio/ogg": ".ogg",
  "audio/wav": ".wav",
  "audio/x-m4a": ".m4a",
  "audio/x-wav": ".wav",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "video/mp4": ".mp4",
  "video/quicktime": ".mov",
  "video/webm": ".webm",
  "video/x-m4v": ".m4v",
};

export function extensionForContentType(contentType?: string | null) {
  const normalized = contentType?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  return contentTypeExtensions[normalized] ?? "";
}

export function filenameForCanonicalContentType(
  filename: string,
  contentType?: string | null,
) {
  const extension = extensionForContentType(contentType);
  if (!extension) return filename;
  const parsed = path.parse(filename);
  return path.join(parsed.dir, `${parsed.name}${extension}`);
}

export async function downloadWithDriveFallback(input: {
  primary: () => Promise<void>;
  driveFileId?: string | null;
  drive: (driveFileId: string) => Promise<void>;
  onFallback?: (error: unknown) => void;
}) {
  try {
    await input.primary();
    return "primary" as const;
  } catch (error) {
    const driveFileId = input.driveFileId?.trim();
    if (!driveFileId) throw error;
    input.onFallback?.(error);
    await input.drive(driveFileId);
    return "drive" as const;
  }
}
