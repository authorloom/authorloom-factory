"use server";

import fs from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import {
  clearBookImportedAssets,
  createBookBackground,
  createBookCaption,
  createBookHashtag,
  createBookHookForScreenshot,
  createBookScreenshot,
  createBookHooksForScreenshot,
  createBookThumbnail,
  createSeries,
  deleteBookCaption,
  deleteBookHashtag,
  deleteBookHook,
  getBook,
  getSeries,
  listBookBackgrounds,
  listBookScreenshots,
  listBookThumbnails,
  listSeriesByAuthor,
  replaceBookTropes,
  updateBookDetails,
} from "@/lib/db";
import {
  downloadDriveFile,
  extractDriveIdFromUrl,
  getDriveFile,
  listDriveFolderChildren,
} from "@/lib/google";
import {
  extractSpreadsheetIdFromUrl,
  readSheetRows,
} from "@/lib/sheets";
import {
  backgroundVideoExtensions,
  coverImageExtensions,
  createStoredFilename,
  getFileExtension,
  manuscriptExtensions,
  screenshotImageExtensions,
} from "@/lib/files";
import type { DriveFile } from "@/lib/google";
import { paths } from "@/lib/paths";

const editBookSchema = z.object({
  title: z.string().trim().min(1, "Book title is required."),
  seriesId: z.string().trim().optional(),
  newSeriesName: z.string().trim().optional(),
  description: z.string().optional(),
  tropes: z.string().optional(),
  driveFolderUrl: z.string().optional(),
  hooksSheetUrl: z.string().optional(),
});

function getTextAreaValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function getFormString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

async function clearBookImportedAssetFiles(bookId: string) {
  await Promise.all([
    fs.rm(path.join(paths.screenshotsDirectory, bookId), {
      recursive: true,
      force: true,
    }),
    fs.rm(path.join(paths.backgroundsDirectory, bookId), {
      recursive: true,
      force: true,
    }),
    fs.rm(path.join(paths.thumbnailsDirectory, bookId), {
      recursive: true,
      force: true,
    }),
  ]);
}

function redirectToScreenshotImportSummary(
  bookId: string,
  summary: {
    downloaded: number;
    duplicates: number;
    unsupported: number;
    errors: string[];
  },
) {
  const params = new URLSearchParams({
    driveImport: summary.errors.length > 0 ? "partial" : "success",
    downloaded: String(summary.downloaded),
    duplicates: String(summary.duplicates),
    unsupported: String(summary.unsupported),
  });

  for (const error of summary.errors) {
    params.append("error", error);
  }

  redirect(`/books/${bookId}/screenshots?${params.toString()}`);
}

function redirectToBackgroundImportSummary(
  bookId: string,
  summary: {
    downloaded: number;
    duplicates: number;
    unsupported: number;
    errors: string[];
  },
) {
  const params = new URLSearchParams({
    driveImport: summary.errors.length > 0 ? "partial" : "success",
    downloaded: String(summary.downloaded),
    duplicates: String(summary.duplicates),
    unsupported: String(summary.unsupported),
  });

  for (const error of summary.errors) {
    params.append("error", error);
  }

  redirect(`/books/${bookId}/backgrounds?${params.toString()}`);
}

function redirectToThumbnailImportSummary(
  bookId: string,
  summary: {
    downloaded: number;
    duplicates: number;
    unsupported: number;
    errors: string[];
  },
) {
  const params = new URLSearchParams({
    driveImport: summary.errors.length > 0 ? "partial" : "success",
    downloaded: String(summary.downloaded),
    duplicates: String(summary.duplicates),
    unsupported: String(summary.unsupported),
  });

  for (const error of summary.errors) {
    params.append("error", error);
  }

  redirect(`/books/${bookId}/thumbnails?${params.toString()}`);
}

function redirectToCoverManuscriptImportSummary(
  bookId: string,
  summary: {
    cover: string;
    manuscript: string;
    errors: string[];
  },
) {
  const params = new URLSearchParams({
    driveAssetImport: summary.errors.length > 0 ? "partial" : "success",
    cover: summary.cover,
    manuscript: summary.manuscript,
  });

  for (const error of summary.errors) {
    params.append("assetError", error);
  }

  redirect(`/books/${bookId}/edit?${params.toString()}`);
}

function redirectToSingleAssetImportSummary(
  bookId: string,
  type: "cover" | "manuscript",
  summary: {
    status: string;
    errors: string[];
  },
) {
  const params = new URLSearchParams({
    [`${type}Import`]: summary.errors.length > 0 ? "partial" : "success",
    [`${type}Status`]: summary.status,
  });

  for (const error of summary.errors) {
    params.append(`${type}Error`, error);
  }

  redirect(`/books/${bookId}?${params.toString()}`);
}

function redirectToHooksImportSummary(
  bookId: string,
  summary: {
    imported: number;
    duplicates: number;
    unmatched: string[];
    ignored: number;
    errors: string[];
  },
) {
  const params = new URLSearchParams({
    hookImport:
      summary.errors.length > 0 || summary.unmatched.length > 0
        ? "partial"
        : "success",
    imported: String(summary.imported),
    duplicates: String(summary.duplicates),
    unmatched: String(summary.unmatched.length),
    ignored: String(summary.ignored),
  });

  for (const unmatched of summary.unmatched) {
    params.append("unmatchedRow", unmatched);
  }

  for (const error of summary.errors) {
    params.append("hookError", error);
  }

  redirect(`/books/${bookId}/screenshots?${params.toString()}`);
}

function redirectToBookAssetImportSummary(
  bookId: string,
  type: "captions" | "hashtags",
  summary: {
    imported: number;
    duplicates: number;
    ignored: number;
    errors: string[];
  },
) {
  const params = new URLSearchParams({
    [`${type}Import`]: summary.errors.length > 0 ? "partial" : "success",
    [`${type}Imported`]: String(summary.imported),
    [`${type}Duplicates`]: String(summary.duplicates),
    [`${type}Ignored`]: String(summary.ignored),
  });

  for (const error of summary.errors) {
    params.append(`${type}Error`, error);
  }

  redirect(`/books/${bookId}?${params.toString()}`);
}

function findDriveFolder(files: DriveFile[], name: string) {
  return files.find(
    (file) =>
      file.name === name &&
      file.mimeType === "application/vnd.google-apps.folder",
  );
}

function findFirstSupportedDriveFile(
  files: DriveFile[],
  supportedExtensions: readonly string[],
) {
  return files
    .filter((file) => {
      if (!file.id || !file.name) {
        return false;
      }

      const extension = getFileExtension(file.name);
      return Boolean(
        extension && supportedExtensions.includes(extension),
      );
    })
    .sort((first, second) => {
      const firstName = first.name ?? "";
      const secondName = second.name ?? "";

      return firstName.localeCompare(secondName);
    })[0];
}

function parseCsv(content: string) {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = "";
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    const nextCharacter = content[index + 1];

    if (character === "\"") {
      if (inQuotes && nextCharacter === "\"") {
        currentCell += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (character === "," && !inQuotes) {
      currentRow.push(currentCell);
      currentCell = "";
      continue;
    }

    if ((character === "\n" || character === "\r") && !inQuotes) {
      if (character === "\r" && nextCharacter === "\n") {
        index += 1;
      }

      currentRow.push(currentCell);
      rows.push(currentRow);
      currentRow = [];
      currentCell = "";
      continue;
    }

    currentCell += character;
  }

  currentRow.push(currentCell);
  rows.push(currentRow);

  return rows.filter((row) =>
    row.some((cell) => cell.trim().length > 0),
  );
}

function normalizeCsvHeader(value: string) {
  return value.trim().toLowerCase().replace(/^\uFEFF/, "");
}

function getSheetCellValue(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value);
}

function sanitizeHashtag(value: string) {
  const sanitized = value
    .trim()
    .replace(/^#+/, "")
    .replace(/\s+/g, "")
    .replace(/[^a-zA-Z0-9_]/g, "")
    .toLowerCase();

  return sanitized ? `#${sanitized}` : "";
}

function importHookRowsForBook(input: {
  bookId: string;
  rows: unknown[][];
  emptySourceMessage: string;
  missingColumnsMessage: string;
}) {
  const summary = {
    imported: 0,
    duplicates: 0,
    unmatched: [] as string[],
    ignored: 0,
    errors: [] as string[],
  };
  const [headerRow, ...dataRows] = input.rows;

  if (!headerRow) {
    throw new Error(input.emptySourceMessage);
  }

  const headers = headerRow.map((value) =>
    normalizeCsvHeader(getSheetCellValue(value)),
  );
  const hookIndex = headers.indexOf("hook");
  const screenshotUrlIndex = headers.indexOf("screenshot_url");

  if (hookIndex === -1 || screenshotUrlIndex === -1) {
    throw new Error(input.missingColumnsMessage);
  }

  const screenshotsByGoogleFileId = new Map(
    listBookScreenshots(input.bookId)
      .filter((screenshot) => screenshot.google_file_id)
      .map((screenshot) => [screenshot.google_file_id, screenshot]),
  );

  for (const [index, row] of dataRows.entries()) {
    const sourceRowNumber = index + 2;
    const hookText = getSheetCellValue(row[hookIndex]).trim();
    const screenshotUrl = getSheetCellValue(row[screenshotUrlIndex]).trim();

    if (!hookText && !screenshotUrl) {
      summary.ignored += 1;
      continue;
    }

    if (!hookText) {
      summary.ignored += 1;
      continue;
    }

    const screenshotGoogleFileId = extractDriveIdFromUrl(screenshotUrl);

    if (!screenshotGoogleFileId) {
      summary.unmatched.push(
        `Row ${sourceRowNumber}: missing screenshot_url Drive file ID`,
      );
      continue;
    }

    const screenshot = screenshotsByGoogleFileId.get(screenshotGoogleFileId);

    if (!screenshot) {
      summary.unmatched.push(
        `Row ${sourceRowNumber}: no screenshot matched ${screenshotGoogleFileId}`,
      );
      continue;
    }

    const created = createBookHookForScreenshot({
      bookId: input.bookId,
      screenshotId: screenshot.id,
      text: hookText,
      sourceRowNumber,
    });

    if (created) {
      summary.imported += 1;
    } else {
      summary.duplicates += 1;
    }
  }

  return summary;
}

function importCaptionRowsForBook(input: {
  bookId: string;
  rows: unknown[][];
}) {
  const summary = {
    imported: 0,
    duplicates: 0,
    ignored: 0,
    errors: [] as string[],
  };
  const [headerRow, ...dataRows] = input.rows;

  if (!headerRow) {
    throw new Error("Captions Google Sheet has no rows.");
  }

  const headers = headerRow.map((value) =>
    normalizeCsvHeader(getSheetCellValue(value)),
  );
  const captionIndex = headers.indexOf("caption");

  if (captionIndex === -1) {
    throw new Error("Captions Google Sheet must include a caption column.");
  }

  for (const [index, row] of dataRows.entries()) {
    const sourceRowNumber = index + 2;
    const captionText = getSheetCellValue(row[captionIndex]).trim();

    if (!captionText) {
      summary.ignored += 1;
      continue;
    }

    const created = createBookCaption({
      bookId: input.bookId,
      text: captionText,
      sourceRowNumber,
    });

    if (created) {
      summary.imported += 1;
    } else {
      summary.duplicates += 1;
    }
  }

  return summary;
}

function importHashtagRowsForBook(input: {
  bookId: string;
  rows: unknown[][];
}) {
  const summary = {
    imported: 0,
    duplicates: 0,
    ignored: 0,
    errors: [] as string[],
  };
  const [headerRow, ...dataRows] = input.rows;

  if (!headerRow) {
    throw new Error("Hashtags Google Sheet has no rows.");
  }

  const headers = headerRow.map((value) =>
    normalizeCsvHeader(getSheetCellValue(value)),
  );
  const hashtagIndex = headers.indexOf("hashtag");

  if (hashtagIndex === -1) {
    throw new Error("Hashtags Google Sheet must include a hashtag column.");
  }

  for (const [index, row] of dataRows.entries()) {
    const sourceRowNumber = index + 2;
    const originalText = getSheetCellValue(row[hashtagIndex]).trim();
    const hashtag = sanitizeHashtag(originalText);

    if (!hashtag) {
      summary.ignored += 1;
      continue;
    }

    const created = createBookHashtag({
      bookId: input.bookId,
      originalText,
      hashtag,
      sourceRowNumber,
    });

    if (created) {
      summary.imported += 1;
    } else {
      summary.duplicates += 1;
    }
  }

  return summary;
}

function parseLines(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export async function updateBookAction(bookId: string, formData: FormData) {
  const parsed = editBookSchema.safeParse({
    title: getFormString(formData, "title"),
    seriesId: getFormString(formData, "seriesId"),
    newSeriesName: getFormString(formData, "newSeriesName"),
    description: getFormString(formData, "description"),
    tropes: getFormString(formData, "tropes"),
    driveFolderUrl: getFormString(formData, "driveFolderUrl"),
    hooksSheetUrl: getFormString(formData, "hooksSheetUrl"),
  });

  if (!parsed.success) {
    throw new Error(z.prettifyError(parsed.error));
  }

  const tropes =
    parsed.data.tropes
      ?.split(",")
      .map((trope) => trope.trim())
      .filter((trope) => trope.length > 0) ?? [];
  const book = getBook(bookId);

  if (!book) {
    throw new Error("Book not found.");
  }

  let seriesId: string | null = null;
  const selectedSeriesId = parsed.data.seriesId || "";
  const newSeriesName = parsed.data.newSeriesName?.trim() ?? "";

  if (selectedSeriesId && selectedSeriesId !== "__new__") {
    const selectedSeries = getSeries(selectedSeriesId);

    if (!selectedSeries || selectedSeries.author_id !== book.author_id) {
      throw new Error("Selected series does not belong to this author.");
    }

    seriesId = selectedSeries.id;
  } else if (newSeriesName) {
    const existingSeries = listSeriesByAuthor(book.author_id).find(
      (series) => series.name.toLowerCase() === newSeriesName.toLowerCase(),
    );

    seriesId =
      existingSeries?.id ??
      createSeries({ authorId: book.author_id, name: newSeriesName });
  }

  updateBookDetails({
    bookId,
    title: parsed.data.title,
    seriesId,
    description: parsed.data.description,
    driveFolderUrl: parsed.data.driveFolderUrl,
    hooksSheetUrl: parsed.data.hooksSheetUrl,
    hooksSheetId: parsed.data.hooksSheetUrl
      ? extractSpreadsheetIdFromUrl(parsed.data.hooksSheetUrl)
      : null,
  });
  replaceBookTropes({ bookId, tropes });

  revalidatePath("/books");
  revalidatePath(`/books/${bookId}`);
  redirect(`/books/${bookId}`);
}

export async function updateBookTitleAction(bookId: string, formData: FormData) {
  const book = getBook(bookId);

  if (!book) {
    throw new Error("Book not found.");
  }

  const title = getFormString(formData, "title");

  updateBookDetails({
    bookId,
    title,
    description: book.description,
  });

  revalidatePath("/books");
  revalidatePath(`/books/${bookId}`);
}

export async function updateBookDescriptionAction(
  bookId: string,
  formData: FormData,
) {
  const book = getBook(bookId);

  if (!book) {
    throw new Error("Book not found.");
  }

  updateBookDetails({
    bookId,
    title: book.title,
    description: getTextAreaValue(formData, "description"),
  });

  revalidatePath("/books");
  revalidatePath(`/books/${bookId}`);
}

export async function updateBookSeriesAction(
  bookId: string,
  formData: FormData,
) {
  const book = getBook(bookId);

  if (!book) {
    throw new Error("Book not found.");
  }

  let seriesId: string | null = null;
  const selectedSeriesId = getFormString(formData, "seriesId");
  const newSeriesName = getFormString(formData, "newSeriesName").trim();

  if (selectedSeriesId && selectedSeriesId !== "__new__") {
    const selectedSeries = getSeries(selectedSeriesId);

    if (!selectedSeries || selectedSeries.author_id !== book.author_id) {
      throw new Error("Selected series does not belong to this author.");
    }

    seriesId = selectedSeries.id;
  } else if (newSeriesName) {
    const existingSeries = listSeriesByAuthor(book.author_id).find(
      (seriesRecord) =>
        seriesRecord.name.toLowerCase() === newSeriesName.toLowerCase(),
    );

    seriesId =
      existingSeries?.id ??
      createSeries({ authorId: book.author_id, name: newSeriesName });
  }

  updateBookDetails({
    bookId,
    title: book.title,
    seriesId,
    description: book.description,
  });

  revalidatePath("/books");
  revalidatePath(`/books/${bookId}`);
}

export async function updateBookTropesAction(
  bookId: string,
  formData: FormData,
) {
  const tropes = getFormString(formData, "tropes")
    .split(",")
    .map((trope) => trope.trim())
    .filter(Boolean);

  replaceBookTropes({ bookId, tropes });

  revalidatePath("/books");
  revalidatePath(`/books/${bookId}`);
}

export async function syncBookDriveFolderAction(
  bookId: string,
  formData: FormData,
) {
  return syncBookDriveFolder(bookId, formData, `/books/${bookId}/edit`);
}

export async function syncBookDriveFolderFromBookPageAction(
  bookId: string,
  formData: FormData,
) {
  return syncBookDriveFolder(bookId, formData, `/books/${bookId}`);
}

async function syncBookDriveFolder(
  bookId: string,
  formData: FormData,
  redirectPath: string,
) {
  const book = getBook(bookId);

  if (!book) {
    throw new Error("Book not found.");
  }

  const driveFolderUrl = getFormString(formData, "driveFolderUrl");
  const driveFolderId = extractDriveIdFromUrl(driveFolderUrl);

  if (!driveFolderUrl.trim() || !driveFolderId) {
    redirect(
      `${redirectPath}?driveSync=error&message=${encodeURIComponent(
        "Enter a Google Drive folder URL before syncing.",
      )}`,
    );
  }

  let driveFolderName = driveFolderId;

  try {
    const driveFile = await getDriveFile(driveFolderId);

    if (driveFile.mimeType !== "application/vnd.google-apps.folder") {
      throw new Error("The Drive URL points to a file, not a folder.");
    }

    driveFolderName = driveFile.name ?? driveFolderId;
    const driveFolderChanged = book.drive_folder_id !== driveFolderId;

    updateBookDetails({
      bookId,
      title: book.title,
      description: book.description,
      coverFilepath: book.cover_filepath,
      manuscriptFilepath: book.manuscript_filepath,
      driveFolderUrl,
      driveFolderId,
    });

    if (driveFolderChanged) {
      clearBookImportedAssets(bookId);
      await clearBookImportedAssetFiles(bookId);
    }

    revalidatePath(`/books/${bookId}`);
    revalidatePath(`/books/${bookId}/edit`);
    revalidatePath(`/books/${bookId}/screenshots`);
    revalidatePath(`/books/${bookId}/backgrounds`);
    revalidatePath(`/books/${bookId}/thumbnails`);
    revalidatePath(`/books/${bookId}/captions`);
    revalidatePath(`/books/${bookId}/hashtags`);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Could not verify the Google Drive folder.";

    redirect(
      `${redirectPath}?driveSync=error&message=${encodeURIComponent(
        message,
      )}`,
    );
  }

  redirect(
    `${redirectPath}?driveSync=success&message=${encodeURIComponent(
      `Connected Drive folder: ${driveFolderName}${
        book.drive_folder_id !== driveFolderId
          ? ". Cleared imported assets from the previous folder."
          : ""
      }`,
    )}`,
  );
}

export async function importBookScreenshotsFromDriveAction(bookId: string) {
  const book = getBook(bookId);

  if (!book) {
    throw new Error("Book not found.");
  }

  const summary = {
    downloaded: 0,
    duplicates: 0,
    unsupported: 0,
    errors: [] as string[],
  };

  try {
    const bookDriveFolderId =
      book.drive_folder_id ??
      (book.drive_folder_url
        ? extractDriveIdFromUrl(book.drive_folder_url)
        : null);

    if (!bookDriveFolderId) {
      throw new Error("Book Drive folder is not connected.");
    }

    const bookFolderChildren = await listDriveFolderChildren(bookDriveFolderId);
    const sourceAssetsFolder = bookFolderChildren.find(
      (file) =>
        file.name === "source-assets" &&
        file.mimeType === "application/vnd.google-apps.folder",
    );

    if (!sourceAssetsFolder?.id) {
      throw new Error("Missing source-assets folder.");
    }

    const sourceAssetsChildren = await listDriveFolderChildren(
      sourceAssetsFolder.id,
    );
    const screenshotsFolder = sourceAssetsChildren.find(
      (file) =>
        file.name === "screenshots" &&
        file.mimeType === "application/vnd.google-apps.folder",
    );

    if (!screenshotsFolder?.id) {
      throw new Error("Missing source-assets/screenshots folder.");
    }

    const existingGoogleFileIds = new Set(
      listBookScreenshots(bookId)
        .map((screenshot) => screenshot.google_file_id)
        .filter((googleFileId): googleFileId is string =>
          Boolean(googleFileId),
        ),
    );
    const driveFiles = await listDriveFolderChildren(screenshotsFolder.id);
    const screenshotDirectory = path.join(paths.screenshotsDirectory, bookId);

    await fs.mkdir(screenshotDirectory, { recursive: true });

    for (const driveFile of driveFiles) {
      if (!driveFile.id || !driveFile.name) {
        summary.errors.push("Skipped a Drive file with missing metadata.");
        continue;
      }

      if (existingGoogleFileIds.has(driveFile.id)) {
        summary.duplicates += 1;
        continue;
      }

      const extension = getFileExtension(driveFile.name);

      if (
        !extension ||
        !(screenshotImageExtensions as readonly string[]).includes(extension)
      ) {
        summary.unsupported += 1;
        continue;
      }

      try {
        const storedFilename = createStoredFilename(driveFile.name);
        const filepath = path.join(screenshotDirectory, storedFilename);

        await downloadDriveFile(driveFile.id, filepath);
        createBookScreenshot({
          bookId,
          filename: storedFilename,
          filepath,
          googleFileId: driveFile.id,
          sourceUrl: driveFile.webViewLink,
        });
        existingGoogleFileIds.add(driveFile.id);
        summary.downloaded += 1;
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Unknown screenshot import error.";
        summary.errors.push(`${driveFile.name}: ${message}`);
      }
    }

    revalidatePath(`/books/${bookId}`);
    revalidatePath(`/books/${bookId}/screenshots`);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Could not import screenshots from Drive.";
    summary.errors.push(message);
  }

  redirectToScreenshotImportSummary(bookId, summary);
}

export async function importBookBackgroundsFromDriveAction(bookId: string) {
  const book = getBook(bookId);

  if (!book) {
    throw new Error("Book not found.");
  }

  const summary = {
    downloaded: 0,
    duplicates: 0,
    unsupported: 0,
    errors: [] as string[],
  };

  try {
    const bookDriveFolderId =
      book.drive_folder_id ??
      (book.drive_folder_url
        ? extractDriveIdFromUrl(book.drive_folder_url)
        : null);

    if (!bookDriveFolderId) {
      throw new Error("Book Drive folder is not connected.");
    }

    const bookFolderChildren = await listDriveFolderChildren(bookDriveFolderId);
    const sourceAssetsFolder = bookFolderChildren.find(
      (file) =>
        file.name === "source-assets" &&
        file.mimeType === "application/vnd.google-apps.folder",
    );

    if (!sourceAssetsFolder?.id) {
      throw new Error("Missing source-assets folder.");
    }

    const sourceAssetsChildren = await listDriveFolderChildren(
      sourceAssetsFolder.id,
    );
    const backgroundsFolder = sourceAssetsChildren.find(
      (file) =>
        file.name === "backgrounds" &&
        file.mimeType === "application/vnd.google-apps.folder",
    );

    if (!backgroundsFolder?.id) {
      throw new Error("Missing source-assets/backgrounds folder.");
    }

    const existingGoogleFileIds = new Set(
      listBookBackgrounds(bookId)
        .map((background) => background.google_file_id)
        .filter((googleFileId): googleFileId is string =>
          Boolean(googleFileId),
        ),
    );
    const driveFiles = await listDriveFolderChildren(backgroundsFolder.id);
    const backgroundDirectory = path.join(paths.backgroundsDirectory, bookId);

    await fs.mkdir(backgroundDirectory, { recursive: true });

    for (const driveFile of driveFiles) {
      if (!driveFile.id || !driveFile.name) {
        summary.errors.push("Skipped a Drive file with missing metadata.");
        continue;
      }

      if (existingGoogleFileIds.has(driveFile.id)) {
        summary.duplicates += 1;
        continue;
      }

      const extension = getFileExtension(driveFile.name);

      if (
        !extension ||
        !(backgroundVideoExtensions as readonly string[]).includes(extension)
      ) {
        summary.unsupported += 1;
        continue;
      }

      try {
        const storedFilename = createStoredFilename(driveFile.name);
        const filepath = path.join(backgroundDirectory, storedFilename);

        await downloadDriveFile(driveFile.id, filepath);
        createBookBackground({
          bookId,
          filename: storedFilename,
          filepath,
          googleFileId: driveFile.id,
        });
        existingGoogleFileIds.add(driveFile.id);
        summary.downloaded += 1;
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Unknown background import error.";
        summary.errors.push(`${driveFile.name}: ${message}`);
      }
    }

    revalidatePath(`/books/${bookId}`);
    revalidatePath(`/books/${bookId}/backgrounds`);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Could not import backgrounds from Drive.";
    summary.errors.push(message);
  }

  redirectToBackgroundImportSummary(bookId, summary);
}

export async function importBookThumbnailsFromDriveAction(bookId: string) {
  const book = getBook(bookId);

  if (!book) {
    throw new Error("Book not found.");
  }

  const summary = {
    downloaded: 0,
    duplicates: 0,
    unsupported: 0,
    errors: [] as string[],
  };

  try {
    const bookDriveFolderId =
      book.drive_folder_id ??
      (book.drive_folder_url
        ? extractDriveIdFromUrl(book.drive_folder_url)
        : null);

    if (!bookDriveFolderId) {
      throw new Error("Book Drive folder is not connected.");
    }

    const bookFolderChildren = await listDriveFolderChildren(bookDriveFolderId);
    const sourceAssetsFolder = bookFolderChildren.find(
      (file) =>
        file.name === "source-assets" &&
        file.mimeType === "application/vnd.google-apps.folder",
    );

    if (!sourceAssetsFolder?.id) {
      throw new Error("Missing source-assets folder.");
    }

    const sourceAssetsChildren = await listDriveFolderChildren(
      sourceAssetsFolder.id,
    );
    const thumbnailsFolder = sourceAssetsChildren.find(
      (file) =>
        file.name === "thumbnails" &&
        file.mimeType === "application/vnd.google-apps.folder",
    );

    if (!thumbnailsFolder?.id) {
      throw new Error("Missing source-assets/thumbnails folder.");
    }

    const existingGoogleFileIds = new Set(
      listBookThumbnails(bookId)
        .map((thumbnail) => thumbnail.google_file_id)
        .filter((googleFileId): googleFileId is string =>
          Boolean(googleFileId),
        ),
    );
    const driveFiles = await listDriveFolderChildren(thumbnailsFolder.id);
    const thumbnailDirectory = path.join(paths.thumbnailsDirectory, bookId);

    await fs.mkdir(thumbnailDirectory, { recursive: true });

    for (const driveFile of driveFiles) {
      if (!driveFile.id || !driveFile.name) {
        summary.errors.push("Skipped a Drive file with missing metadata.");
        continue;
      }

      if (existingGoogleFileIds.has(driveFile.id)) {
        summary.duplicates += 1;
        continue;
      }

      const extension = getFileExtension(driveFile.name);

      if (
        !extension ||
        !(screenshotImageExtensions as readonly string[]).includes(extension)
      ) {
        summary.unsupported += 1;
        continue;
      }

      try {
        const storedFilename = createStoredFilename(driveFile.name);
        const filepath = path.join(thumbnailDirectory, storedFilename);

        await downloadDriveFile(driveFile.id, filepath);
        createBookThumbnail({
          bookId,
          filename: storedFilename,
          filepath,
          googleFileId: driveFile.id,
          driveUrl: driveFile.webViewLink ?? driveFile.webContentLink,
        });
        existingGoogleFileIds.add(driveFile.id);
        summary.downloaded += 1;
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Unknown thumbnail import error.";
        summary.errors.push(`${driveFile.name}: ${message}`);
      }
    }

    revalidatePath(`/books/${bookId}`);
    revalidatePath(`/books/${bookId}/thumbnails`);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Could not import thumbnails from Drive.";
    summary.errors.push(message);
  }

  redirectToThumbnailImportSummary(bookId, summary);
}

export async function importBookCoverAndManuscriptFromDriveAction(
  bookId: string,
) {
  const book = getBook(bookId);

  if (!book) {
    throw new Error("Book not found.");
  }

  const summary = {
    cover: "Not imported",
    manuscript: "Not imported",
    errors: [] as string[],
  };
  let coverFilepath = book.cover_filepath;
  let manuscriptFilepath = book.manuscript_filepath;

  try {
    const bookDriveFolderId =
      book.drive_folder_id ??
      (book.drive_folder_url
        ? extractDriveIdFromUrl(book.drive_folder_url)
        : null);

    if (!bookDriveFolderId) {
      throw new Error("Book Drive folder is not connected.");
    }

    const bookFolderChildren = await listDriveFolderChildren(bookDriveFolderId);
    const sourceAssetsFolder = findDriveFolder(
      bookFolderChildren,
      "source-assets",
    );

    if (!sourceAssetsFolder?.id) {
      throw new Error("Missing source-assets folder.");
    }

    const sourceAssetsChildren = await listDriveFolderChildren(
      sourceAssetsFolder.id,
    );
    const coverFolder = findDriveFolder(sourceAssetsChildren, "cover");
    const manuscriptFolder = findDriveFolder(
      sourceAssetsChildren,
      "manuscript",
    );

    if (!coverFolder?.id) {
      summary.errors.push("Missing source-assets/cover folder.");
    } else {
      try {
        const coverFiles = await listDriveFolderChildren(coverFolder.id);
        const coverFile = findFirstSupportedDriveFile(
          coverFiles,
          coverImageExtensions,
        );

        if (!coverFile?.id || !coverFile.name) {
          summary.errors.push("No supported cover file found.");
        } else {
          const coverDirectory = path.join(paths.coversDirectory, bookId);
          const coverFilename = createStoredFilename(coverFile.name);

          coverFilepath = path.join(coverDirectory, coverFilename);
          await fs.mkdir(coverDirectory, { recursive: true });
          await downloadDriveFile(coverFile.id, coverFilepath);
          summary.cover = `Imported ${coverFile.name}`;
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Unknown cover import error.";
        summary.errors.push(`Cover: ${message}`);
      }
    }

    if (!manuscriptFolder?.id) {
      summary.errors.push("Missing source-assets/manuscript folder.");
    } else {
      try {
        const manuscriptFiles = await listDriveFolderChildren(
          manuscriptFolder.id,
        );
        const manuscriptFile = findFirstSupportedDriveFile(
          manuscriptFiles,
          manuscriptExtensions,
        );

        if (!manuscriptFile?.id || !manuscriptFile.name) {
          summary.errors.push("No supported manuscript file found.");
        } else {
          const manuscriptDirectory = path.join(
            paths.manuscriptsDirectory,
            bookId,
          );
          const manuscriptFilename = createStoredFilename(manuscriptFile.name);

          manuscriptFilepath = path.join(
            manuscriptDirectory,
            manuscriptFilename,
          );
          await fs.mkdir(manuscriptDirectory, { recursive: true });
          await downloadDriveFile(manuscriptFile.id, manuscriptFilepath);
          summary.manuscript = `Imported ${manuscriptFile.name}`;
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Unknown manuscript import error.";
        summary.errors.push(`Manuscript: ${message}`);
      }
    }

    updateBookDetails({
      bookId,
      title: book.title,
      description: book.description,
      coverFilepath,
      manuscriptFilepath,
    });

    revalidatePath(`/books/${bookId}`);
    revalidatePath(`/books/${bookId}/edit`);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Could not import cover/manuscript from Drive.";
    summary.errors.push(message);
  }

  redirectToCoverManuscriptImportSummary(bookId, summary);
}

export async function importBookCoverFromDriveAction(bookId: string) {
  const book = getBook(bookId);

  if (!book) {
    throw new Error("Book not found.");
  }

  const summary = {
    status: "Not imported",
    errors: [] as string[],
  };

  try {
    const bookDriveFolderId =
      book.drive_folder_id ??
      (book.drive_folder_url
        ? extractDriveIdFromUrl(book.drive_folder_url)
        : null);

    if (!bookDriveFolderId) {
      throw new Error("Book Drive folder is not connected.");
    }

    const bookFolderChildren = await listDriveFolderChildren(bookDriveFolderId);
    const sourceAssetsFolder = findDriveFolder(
      bookFolderChildren,
      "source-assets",
    );

    if (!sourceAssetsFolder?.id) {
      throw new Error("Missing source-assets folder.");
    }

    const sourceAssetsChildren = await listDriveFolderChildren(
      sourceAssetsFolder.id,
    );
    const coverFolder = findDriveFolder(sourceAssetsChildren, "cover");

    if (!coverFolder?.id) {
      throw new Error("Missing source-assets/cover folder.");
    }

    const coverFiles = await listDriveFolderChildren(coverFolder.id);
    const coverFile = findFirstSupportedDriveFile(coverFiles, coverImageExtensions);

    if (!coverFile?.id || !coverFile.name) {
      throw new Error("No supported cover file found.");
    }

    const coverDirectory = path.join(paths.coversDirectory, bookId);
    const coverFilename = createStoredFilename(coverFile.name);
    const coverFilepath = path.join(coverDirectory, coverFilename);

    await fs.mkdir(coverDirectory, { recursive: true });
    await downloadDriveFile(coverFile.id, coverFilepath);
    updateBookDetails({
      bookId,
      title: book.title,
      description: book.description,
      coverFilepath,
    });
    summary.status = `Imported ${coverFile.name}`;

    revalidatePath(`/books/${bookId}`);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not import cover.";
    summary.errors.push(message);
  }

  redirectToSingleAssetImportSummary(bookId, "cover", summary);
}

export async function importBookManuscriptFromDriveAction(bookId: string) {
  const book = getBook(bookId);

  if (!book) {
    throw new Error("Book not found.");
  }

  const summary = {
    status: "Not imported",
    errors: [] as string[],
  };

  try {
    const bookDriveFolderId =
      book.drive_folder_id ??
      (book.drive_folder_url
        ? extractDriveIdFromUrl(book.drive_folder_url)
        : null);

    if (!bookDriveFolderId) {
      throw new Error("Book Drive folder is not connected.");
    }

    const bookFolderChildren = await listDriveFolderChildren(bookDriveFolderId);
    const sourceAssetsFolder = findDriveFolder(
      bookFolderChildren,
      "source-assets",
    );

    if (!sourceAssetsFolder?.id) {
      throw new Error("Missing source-assets folder.");
    }

    const sourceAssetsChildren = await listDriveFolderChildren(
      sourceAssetsFolder.id,
    );
    const manuscriptFolder = findDriveFolder(sourceAssetsChildren, "manuscript");

    if (!manuscriptFolder?.id) {
      throw new Error("Missing source-assets/manuscript folder.");
    }

    const manuscriptFiles = await listDriveFolderChildren(manuscriptFolder.id);
    const manuscriptFile = findFirstSupportedDriveFile(
      manuscriptFiles,
      manuscriptExtensions,
    );

    if (!manuscriptFile?.id || !manuscriptFile.name) {
      throw new Error("No supported manuscript file found.");
    }

    const manuscriptDirectory = path.join(paths.manuscriptsDirectory, bookId);
    const manuscriptFilename = createStoredFilename(manuscriptFile.name);
    const manuscriptFilepath = path.join(
      manuscriptDirectory,
      manuscriptFilename,
    );

    await fs.mkdir(manuscriptDirectory, { recursive: true });
    await downloadDriveFile(manuscriptFile.id, manuscriptFilepath);
    updateBookDetails({
      bookId,
      title: book.title,
      description: book.description,
      manuscriptFilepath,
    });
    summary.status = `Imported ${manuscriptFile.name}`;

    revalidatePath(`/books/${bookId}`);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not import manuscript.";
    summary.errors.push(message);
  }

  redirectToSingleAssetImportSummary(bookId, "manuscript", summary);
}

export async function importBookHooksCsvFromDriveAction(bookId: string) {
  const book = getBook(bookId);

  if (!book) {
    throw new Error("Book not found.");
  }

  let summary = {
    imported: 0,
    duplicates: 0,
    unmatched: [] as string[],
    ignored: 0,
    errors: [] as string[],
  };

  try {
    const bookDriveFolderId =
      book.drive_folder_id ??
      (book.drive_folder_url
        ? extractDriveIdFromUrl(book.drive_folder_url)
        : null);

    if (!bookDriveFolderId) {
      throw new Error("Book Drive folder is not connected.");
    }

    const bookFolderChildren = await listDriveFolderChildren(bookDriveFolderId);
    const sourceAssetsFolder = findDriveFolder(
      bookFolderChildren,
      "source-assets",
    );

    if (!sourceAssetsFolder?.id) {
      throw new Error("Missing source-assets folder.");
    }

    const sourceAssetsChildren = await listDriveFolderChildren(
      sourceAssetsFolder.id,
    );
    const hooksFile = sourceAssetsChildren.find(
      (file) => file.name === "hooks.csv" && file.id,
    );

    if (!hooksFile?.id) {
      throw new Error("Missing source-assets/hooks.csv file.");
    }

    const importDirectory = path.join(paths.storageDirectory, "imports", bookId);
    const csvFilepath = path.join(importDirectory, `hooks-${Date.now()}.csv`);

    await fs.mkdir(importDirectory, { recursive: true });
    await downloadDriveFile(hooksFile.id, csvFilepath);

    const csvContent = await fs.readFile(csvFilepath, "utf8");
    summary = importHookRowsForBook({
      bookId,
      rows: parseCsv(csvContent),
      emptySourceMessage: "hooks.csv is empty.",
      missingColumnsMessage:
        "hooks.csv must include hook and screenshot_url columns.",
    });

    revalidatePath(`/books/${bookId}`);
    revalidatePath(`/books/${bookId}/screenshots`);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not import hooks.csv.";
    summary.errors.push(message);
  }

  redirectToHooksImportSummary(bookId, summary);
}

export async function saveBookHooksSheetAction(
  bookId: string,
  formData: FormData,
) {
  const book = getBook(bookId);

  if (!book) {
    throw new Error("Book not found.");
  }

  const hooksSheetUrl = getFormString(formData, "hooksSheetUrl");
  const hooksSheetId = hooksSheetUrl
    ? extractSpreadsheetIdFromUrl(hooksSheetUrl)
    : null;

  if (hooksSheetUrl.trim() && !hooksSheetId) {
    redirect(
      `/books/${bookId}/screenshots?hookImport=partial&hookError=${encodeURIComponent(
        "Enter a valid Google Sheets URL.",
      )}`,
    );
  }

  updateBookDetails({
    bookId,
    title: book.title,
    description: book.description,
    hooksSheetUrl,
    hooksSheetId,
  });

  revalidatePath(`/books/${bookId}`);
  revalidatePath(`/books/${bookId}/screenshots`);
  redirect(`/books/${bookId}/screenshots`);
}

export async function importBookHooksSheetAction(bookId: string) {
  const book = getBook(bookId);

  if (!book) {
    throw new Error("Book not found.");
  }

  let summary = {
    imported: 0,
    duplicates: 0,
    unmatched: [] as string[],
    ignored: 0,
    errors: [] as string[],
  };

  try {
    const spreadsheetId =
      book.hooks_sheet_id ??
      (book.hooks_sheet_url
        ? extractSpreadsheetIdFromUrl(book.hooks_sheet_url)
        : null);

    if (!spreadsheetId) {
      throw new Error("Book hooks Google Sheet is not connected.");
    }

    const rows = await readSheetRows({
      spreadsheetId,
      range: "A:Z",
    });

    summary = importHookRowsForBook({
      bookId,
      rows: rows ?? [],
      emptySourceMessage: "Google Sheet has no rows.",
      missingColumnsMessage:
        "Google Sheet must include hook and screenshot_url columns.",
    });

    if (book.hooks_sheet_id !== spreadsheetId) {
      updateBookDetails({
        bookId,
        title: book.title,
        description: book.description,
        hooksSheetId: spreadsheetId,
      });
    }

    revalidatePath(`/books/${bookId}`);
    revalidatePath(`/books/${bookId}/screenshots`);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Could not import hooks from Google Sheet.";
    summary.errors.push(message);
  }

  redirectToHooksImportSummary(bookId, summary);
}

export async function importBookCaptionsSheetAction(bookId: string) {
  const book = getBook(bookId);

  if (!book) {
    throw new Error("Book not found.");
  }

  let summary = {
    imported: 0,
    duplicates: 0,
    ignored: 0,
    errors: [] as string[],
  };

  try {
    const spreadsheetId =
      book.captions_sheet_id ??
      (book.captions_sheet_url
        ? extractSpreadsheetIdFromUrl(book.captions_sheet_url)
        : null);

    if (!spreadsheetId) {
      throw new Error("Book captions Google Sheet is not connected.");
    }

    const rows = await readSheetRows({
      spreadsheetId,
      range: "A:Z",
    });

    summary = importCaptionRowsForBook({
      bookId,
      rows: rows ?? [],
    });

    if (book.captions_sheet_id !== spreadsheetId) {
      updateBookDetails({
        bookId,
        title: book.title,
        description: book.description,
        captionsSheetId: spreadsheetId,
      });
    }

    revalidatePath(`/books/${bookId}`);
    revalidatePath(`/campaigns`);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Could not import captions from Google Sheet.";
    summary.errors.push(message);
  }

  redirectToBookAssetImportSummary(bookId, "captions", summary);
}

export async function importBookHashtagsSheetAction(bookId: string) {
  const book = getBook(bookId);

  if (!book) {
    throw new Error("Book not found.");
  }

  let summary = {
    imported: 0,
    duplicates: 0,
    ignored: 0,
    errors: [] as string[],
  };

  try {
    const spreadsheetId =
      book.hashtags_sheet_id ??
      (book.hashtags_sheet_url
        ? extractSpreadsheetIdFromUrl(book.hashtags_sheet_url)
        : null);

    if (!spreadsheetId) {
      throw new Error("Book hashtags Google Sheet is not connected.");
    }

    const rows = await readSheetRows({
      spreadsheetId,
      range: "A:Z",
    });

    summary = importHashtagRowsForBook({
      bookId,
      rows: rows ?? [],
    });

    if (book.hashtags_sheet_id !== spreadsheetId) {
      updateBookDetails({
        bookId,
        title: book.title,
        description: book.description,
        hashtagsSheetId: spreadsheetId,
      });
    }

    revalidatePath(`/books/${bookId}`);
    revalidatePath(`/campaigns`);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Could not import hashtags from Google Sheet.";
    summary.errors.push(message);
  }

  redirectToBookAssetImportSummary(bookId, "hashtags", summary);
}

export async function addBookCaptionsAction(bookId: string, formData: FormData) {
  const caption = getTextAreaValue(formData, "caption").trim();

  if (caption) {
    createBookCaption({ bookId, text: caption });
  }

  revalidatePath(`/books/${bookId}`);
  revalidatePath(`/books/${bookId}/captions`);
}

export async function addBookHashtagsAction(bookId: string, formData: FormData) {
  const lines = parseLines(getTextAreaValue(formData, "hashtags"));

  for (const line of lines) {
    const hashtag = sanitizeHashtag(line);

    if (hashtag) {
      createBookHashtag({
        bookId,
        originalText: line,
        hashtag,
      });
    }
  }

  revalidatePath(`/books/${bookId}`);
  revalidatePath(`/books/${bookId}/hashtags`);
}

export async function deleteBookCaptionAction(bookId: string, captionId: string) {
  deleteBookCaption(bookId, captionId);

  revalidatePath(`/books/${bookId}`);
  revalidatePath(`/books/${bookId}/captions`);
}

export async function deleteBookHashtagAction(bookId: string, hashtagId: string) {
  deleteBookHashtag(bookId, hashtagId);

  revalidatePath(`/books/${bookId}`);
  revalidatePath(`/books/${bookId}/hashtags`);
}

export async function addBookHooksAction(
  bookId: string,
  screenshotId: string,
  formData: FormData,
) {
  const rawHooks = getTextAreaValue(formData, "hooks");
  const lines = rawHooks.split(/\r?\n/);

  createBookHooksForScreenshot({
    bookId,
    screenshotId,
    lines,
  });

  revalidatePath(`/books/${bookId}`);
  revalidatePath(`/books/${bookId}/screenshots`);
  revalidatePath(`/books/${bookId}/screenshots/${screenshotId}`);
}

export async function deleteBookHookAction(
  bookId: string,
  hookId: string,
  screenshotId?: string,
) {
  const deleted = deleteBookHook(bookId, hookId);

  if (!deleted) {
    throw new Error("Hook not found for this book.");
  }

  revalidatePath(`/books/${bookId}`);
  revalidatePath(`/books/${bookId}/screenshots`);
  if (screenshotId) {
    revalidatePath(`/books/${bookId}/screenshots/${screenshotId}`);
  }
}
