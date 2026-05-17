"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import {
  createBook,
  createBookTropes,
  createSeries,
  getAuthor,
  getSeries,
  listSeriesByAuthor,
} from "@/lib/db";
import { createBookDriveFolderForAuthor } from "@/lib/google";
import {
  findOrCreateCaptionsSpreadsheet,
  findOrCreateHashtagsSpreadsheet,
  findOrCreateHooksSpreadsheet,
} from "@/lib/sheets";
import { slugifyName } from "@/lib/slugs";

const newBookSchema = z.object({
  authorId: z.string().trim().optional(),
  authorName: z.string().trim().optional(),
  seriesId: z.string().trim().optional(),
  newSeriesName: z.string().trim().optional(),
  title: z.string().trim().min(1, "Book title is required."),
  description: z.string().optional(),
  tropes: z.string().optional(),
  driveFolderUrl: z.string().optional(),
});

function getFormString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export async function createBookAction(formData: FormData) {
  const parsed = newBookSchema.safeParse({
    authorId: getFormString(formData, "authorId"),
    authorName: getFormString(formData, "authorName"),
    seriesId: getFormString(formData, "seriesId"),
    newSeriesName: getFormString(formData, "newSeriesName"),
    title: getFormString(formData, "title"),
    description: getFormString(formData, "description"),
    tropes: getFormString(formData, "tropes"),
    driveFolderUrl: getFormString(formData, "driveFolderUrl"),
  });

  if (!parsed.success) {
    throw new Error(z.prettifyError(parsed.error));
  }

  const authorId = parsed.data.authorId || null;
  const author = authorId ? getAuthor(authorId) : null;

  if (!author) {
    throw new Error("Create and open an author before creating books.");
  }

  if (!author.drive_folder_id) {
    throw new Error(
      "Connect the author's Google Drive folder before creating books.",
    );
  }

  const bookSlug = slugifyName(parsed.data.title);

  if (!bookSlug) {
    throw new Error("Book slug could not be generated.");
  }

  let bookDriveFolder;

  try {
    bookDriveFolder = await createBookDriveFolderForAuthor({
      authorDriveFolderId: author.drive_folder_id,
      slug: bookSlug,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Could not create the book Drive folder.";

    throw new Error(message);
  }

  const hooksSheet = await findOrCreateHooksSpreadsheet({
    parentFolderId: bookDriveFolder.screenshotsFolderId,
    title: "hooks",
  });
  const captionsSheet = await findOrCreateCaptionsSpreadsheet({
    parentFolderId: bookDriveFolder.captionsFolderId,
    title: "captions",
  });
  const hashtagsSheet = await findOrCreateHashtagsSpreadsheet({
    parentFolderId: bookDriveFolder.hashtagsFolderId,
    title: "hashtags",
  });

  let seriesId: string | null = null;
  const selectedSeriesId = parsed.data.seriesId || "";
  const newSeriesName = parsed.data.newSeriesName?.trim() ?? "";

  if (selectedSeriesId && selectedSeriesId !== "__new__") {
    const selectedSeries = getSeries(selectedSeriesId);

    if (!selectedSeries || selectedSeries.author_id !== author.id) {
      throw new Error("Selected series does not belong to this author.");
    }

    seriesId = selectedSeries.id;
  } else if (newSeriesName) {
    const existingSeries = listSeriesByAuthor(author.id).find(
      (series) => series.name.toLowerCase() === newSeriesName.toLowerCase(),
    );

    seriesId =
      existingSeries?.id ??
      createSeries({ authorId: author.id, name: newSeriesName });
  }

  const bookId = createBook({
    authorId: author.id,
    seriesId,
    slug: bookSlug,
    title: parsed.data.title,
    description: parsed.data.description,
    driveFolderUrl: bookDriveFolder.folderUrl,
    driveFolderId: bookDriveFolder.folderId,
    hooksSheetUrl: hooksSheet.spreadsheetUrl,
    hooksSheetId: hooksSheet.spreadsheetId,
    captionsSheetUrl: captionsSheet.spreadsheetUrl,
    captionsSheetId: captionsSheet.spreadsheetId,
    hashtagsSheetUrl: hashtagsSheet.spreadsheetUrl,
    hashtagsSheetId: hashtagsSheet.spreadsheetId,
  });
  const tropes =
    parsed.data.tropes
      ?.split(",")
      .map((trope) => trope.trim())
      .filter((trope) => trope.length > 0) ?? [];

  createBookTropes({ bookId, tropes });

  revalidatePath("/books");
  redirect(`/books/${bookId}`);
}
