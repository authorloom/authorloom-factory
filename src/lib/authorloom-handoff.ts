import fs from "node:fs";
import path from "node:path";

import { z } from "zod";

import {
  createAuthor,
  createBook,
  createCampaign,
  createRenderBatch,
  listAuthors,
  listBooksByAuthor,
  listCampaigns,
  listRenderBatchesByCampaign,
  updateAuthorDriveFolder,
  updateBookDetails,
  type Author,
  type Book,
  type Campaign,
  type RenderBatch,
} from "@/lib/db";
import { paths } from "@/lib/paths";
import { slugifyCampaignName, slugifyName } from "@/lib/slugs";

export const defaultAuthorloomHandoffDirectory =
  "/Users/kaynebrennan/localsites/social-factory/data/worker-handoffs";

const importRegistryFile = path.join(
  paths.dataDirectory,
  "authorloom-imported-handoffs.json",
);

const optionalString = z.string().trim().optional().nullable();

const authorloomRenderHandoffSchema = z.object({
  contractVersion: z.union([
    z.literal("authorloom.render_batch.handoff.v1"),
    z.literal("render_batch.v1"),
  ]),
  createdAt: z.string(),
  source: z.literal("Authorloom").optional(),
  nextStep: z.string().optional(),
  author: z
    .object({
      id: z.string(),
      name: z.string(),
      slug: optionalString,
      driveFolderId: optionalString,
      driveFolderUrl: optionalString,
    })
    .nullable(),
  book: z.object({
    id: z.string(),
    title: z.string(),
    slug: optionalString,
    driveFolderId: optionalString,
    driveFolderUrl: optionalString,
    hooksSheetId: optionalString,
    hooksSheetUrl: optionalString,
    captionsSheetId: optionalString,
    captionsSheetUrl: optionalString,
    hashtagsSheetId: optionalString,
    hashtagsSheetUrl: optionalString,
  }),
  batch: z.object({
    id: z.string(),
    name: z.string(),
    slug: optionalString,
    status: z.string().optional(),
  }),
  request: z
    .object({
      targetVideoCount: z.number().optional().nullable(),
      notes: optionalString,
      batchName: optionalString,
      batchSlug: optionalString,
    })
    .optional(),
  drive: z
    .object({
      authorFolderId: optionalString,
      bookFolderId: optionalString,
      bookFolderUrl: optionalString,
      hooksSheetId: optionalString,
      hooksSheetUrl: optionalString,
      captionsSheetId: optionalString,
      captionsSheetUrl: optionalString,
      hashtagsSheetId: optionalString,
      hashtagsSheetUrl: optionalString,
    })
    .optional(),
  renderStatus: z
    .object({
      rendered: z.number().optional(),
      uploaded: z.number().optional(),
      videos: z.array(z.unknown()).optional(),
    })
    .optional(),
});

export type AuthorloomRenderHandoff = z.infer<
  typeof authorloomRenderHandoffSchema
>;

export type AuthorloomHandoffImportResult = {
  handoffPath: string;
  contractVersion: AuthorloomRenderHandoff["contractVersion"];
  author: Author;
  authorCreated: boolean;
  book: Book;
  bookCreated: boolean;
  campaign: Campaign;
  campaignCreated: boolean;
  batch: RenderBatch;
  batchCreated: boolean;
  nextUrl: string;
  warnings: string[];
};

export type ImportedAuthorloomHandoffRecord = {
  handoffPath: string;
  importedAt: string;
  renderedAt?: string | null;
  uploadedAt?: string | null;
  reportPath?: string | null;
  contractVersion: AuthorloomRenderHandoff["contractVersion"];
  authorId: string;
  bookId: string;
  campaignId: string;
  batchId: string;
  nextUrl: string;
};

export type AuthorloomHandoffQueueItem = {
  handoffPath: string;
  imported: boolean;
  importedAt: string | null;
  batchId: string | null;
};

export type AuthorloomHandoffFolderImportResult = {
  directory: string;
  imported: AuthorloomHandoffImportResult[];
  skipped: ImportedAuthorloomHandoffRecord[];
  failed: Array<{
    handoffPath: string;
    error: string;
  }>;
};

function normalizeNullable(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function driveFolderUrlFromId(folderId: string | null) {
  return folderId ? `https://drive.google.com/drive/folders/${folderId}` : null;
}

function spreadsheetUrlFromId(spreadsheetId: string | null) {
  return spreadsheetId
    ? `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`
    : null;
}

function parseAuthorloomRenderHandoff(filePath: string) {
  const raw = fs.readFileSync(filePath, "utf8");
  const parsedJson: unknown = JSON.parse(raw);
  return authorloomRenderHandoffSchema.parse(parsedJson);
}

function normalizeHandoffPath(handoffPath: string) {
  return path.resolve(handoffPath);
}

function readImportRegistry() {
  if (!fs.existsSync(importRegistryFile)) {
    return [] as ImportedAuthorloomHandoffRecord[];
  }

  const raw = fs.readFileSync(importRegistryFile, "utf8");
  const parsed: unknown = JSON.parse(raw);

  if (!Array.isArray(parsed)) {
    throw new Error(
      `Authorloom handoff import registry is invalid: ${importRegistryFile}`,
    );
  }

  return parsed as ImportedAuthorloomHandoffRecord[];
}

export function listImportedAuthorloomHandoffs() {
  return readImportRegistry();
}

export function getImportedAuthorloomHandoffByPath(handoffPath: string) {
  return getImportedHandoffRecord(handoffPath);
}

export function getImportedAuthorloomHandoffByBatchId(batchId: string) {
  return (
    readImportRegistry().find((record) => record.batchId === batchId) ?? null
  );
}

function writeImportRegistry(records: ImportedAuthorloomHandoffRecord[]) {
  fs.mkdirSync(paths.dataDirectory, { recursive: true });
  fs.writeFileSync(
    importRegistryFile,
    `${JSON.stringify(records, null, 2)}\n`,
    "utf8",
  );
}

function getImportedHandoffRecord(handoffPath: string) {
  const absolutePath = normalizeHandoffPath(handoffPath);
  return (
    readImportRegistry().find(
      (record) => normalizeHandoffPath(record.handoffPath) === absolutePath,
    ) ?? null
  );
}

function markHandoffImported(result: AuthorloomHandoffImportResult) {
  const records = readImportRegistry();
  const absolutePath = normalizeHandoffPath(result.handoffPath);
  const nextRecords = records.filter(
    (record) => normalizeHandoffPath(record.handoffPath) !== absolutePath,
  );

  nextRecords.push({
    handoffPath: absolutePath,
    importedAt: new Date().toISOString(),
    contractVersion: result.contractVersion,
    authorId: result.author.id,
    bookId: result.book.id,
    campaignId: result.campaign.id,
    batchId: result.batch.id,
    nextUrl: result.nextUrl,
  });

  writeImportRegistry(nextRecords);
}

export function markAuthorloomHandoffRendered(batchId: string) {
  const records = readImportRegistry();
  const nextRecords = records.map((record) =>
    record.batchId === batchId
      ? { ...record, renderedAt: new Date().toISOString() }
      : record,
  );

  writeImportRegistry(nextRecords);
}

export function markAuthorloomHandoffUploaded(input: {
  batchId: string;
  reportPath: string;
}) {
  const records = readImportRegistry();
  const nextRecords = records.map((record) =>
    record.batchId === input.batchId
      ? {
          ...record,
          uploadedAt: new Date().toISOString(),
          reportPath: path.resolve(input.reportPath),
        }
      : record,
  );

  writeImportRegistry(nextRecords);
}

export function updateAuthorloomHandoffRenderStatus(input: {
  handoffPath: string;
  rendered: number;
  uploaded: number;
  videos: unknown[];
  reportPath: string;
}) {
  const absolutePath = normalizeHandoffPath(input.handoffPath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Authorloom handoff file was not found: ${absolutePath}`);
  }

  const parsed = JSON.parse(fs.readFileSync(absolutePath, "utf8")) as Record<
    string,
    unknown
  >;
  const next = {
    ...parsed,
    updatedAt: new Date().toISOString(),
    renderStatus: {
      rendered: input.rendered,
      uploaded: input.uploaded,
      videos: input.videos,
    },
    booktokFactoryReportPath: path.resolve(input.reportPath),
  };

  fs.writeFileSync(absolutePath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
}

export function listAuthorloomHandoffQueue(
  directory = defaultAuthorloomHandoffDirectory,
): AuthorloomHandoffQueueItem[] {
  const absoluteDirectory = path.resolve(directory);

  if (!fs.existsSync(absoluteDirectory)) {
    return [];
  }

  const registry = readImportRegistry();
  const registryByPath = new Map(
    registry.map((record) => [
      normalizeHandoffPath(record.handoffPath),
      record,
    ]),
  );

  return fs
    .readdirSync(absoluteDirectory)
    .filter((entry) => entry.toLowerCase().endsWith(".json"))
    .sort((a, b) => a.localeCompare(b))
    .map((entry) => {
      const handoffPath = path.join(absoluteDirectory, entry);
      const record = registryByPath.get(normalizeHandoffPath(handoffPath));

      return {
        handoffPath,
        imported: Boolean(record),
        importedAt: record?.importedAt ?? null,
        batchId: record?.batchId ?? null,
      };
    });
}

function findOrCreateAuthor(handoff: AuthorloomRenderHandoff) {
  if (!handoff.author) {
    throw new Error(
      "Authorloom handoff is missing an author. Create/import the author before importing this handoff.",
    );
  }

  const authorSlug = normalizeNullable(handoff.author.slug)
    ?? slugifyName(handoff.author.name);

  if (!authorSlug) {
    throw new Error("Author slug could not be generated from the handoff.");
  }

  const existingAuthor = listAuthors().find(
    (author) => author.slug === authorSlug,
  );

  const authorId = existingAuthor
    ? existingAuthor.id
    : createAuthor({ name: handoff.author.name });

  const author = existingAuthor ?? listAuthors().find((item) => item.id === authorId);

  if (!author) {
    throw new Error("Author was not found after import.");
  }

  const driveFolderId =
    normalizeNullable(handoff.author.driveFolderId)
    ?? normalizeNullable(handoff.drive?.authorFolderId);
  const driveFolderUrl =
    normalizeNullable(handoff.author.driveFolderUrl)
    ?? driveFolderUrlFromId(driveFolderId);

  if (
    (driveFolderId && author.drive_folder_id !== driveFolderId)
    || (driveFolderUrl && author.drive_folder_url !== driveFolderUrl)
  ) {
    updateAuthorDriveFolder({
      authorId: author.id,
      driveFolderId,
      driveFolderUrl,
    });
  }

  const updatedAuthor = listAuthors().find((item) => item.id === author.id);

  if (!updatedAuthor) {
    throw new Error("Author was not found after Drive metadata update.");
  }

  return {
    author: updatedAuthor,
    created: !existingAuthor,
  };
}

function findOrCreateBook(
  handoff: AuthorloomRenderHandoff,
  authorId: string,
) {
  const bookSlug =
    normalizeNullable(handoff.book.slug) ?? slugifyName(handoff.book.title);

  if (!bookSlug) {
    throw new Error("Book slug could not be generated from the handoff.");
  }

  const existingBook = listBooksByAuthor(authorId).find(
    (book) => book.slug === bookSlug,
  );

  const driveFolderId =
    normalizeNullable(handoff.book.driveFolderId)
    ?? normalizeNullable(handoff.drive?.bookFolderId);
  const driveFolderUrl =
    normalizeNullable(handoff.book.driveFolderUrl)
    ?? normalizeNullable(handoff.drive?.bookFolderUrl)
    ?? driveFolderUrlFromId(driveFolderId);
  const hooksSheetId =
    normalizeNullable(handoff.book.hooksSheetId)
    ?? normalizeNullable(handoff.drive?.hooksSheetId);
  const captionsSheetId =
    normalizeNullable(handoff.book.captionsSheetId)
    ?? normalizeNullable(handoff.drive?.captionsSheetId);
  const hashtagsSheetId =
    normalizeNullable(handoff.book.hashtagsSheetId)
    ?? normalizeNullable(handoff.drive?.hashtagsSheetId);
  const hooksSheetUrl =
    normalizeNullable(handoff.book.hooksSheetUrl)
    ?? normalizeNullable(handoff.drive?.hooksSheetUrl)
    ?? spreadsheetUrlFromId(hooksSheetId);
  const captionsSheetUrl =
    normalizeNullable(handoff.book.captionsSheetUrl)
    ?? normalizeNullable(handoff.drive?.captionsSheetUrl)
    ?? spreadsheetUrlFromId(captionsSheetId);
  const hashtagsSheetUrl =
    normalizeNullable(handoff.book.hashtagsSheetUrl)
    ?? normalizeNullable(handoff.drive?.hashtagsSheetUrl)
    ?? spreadsheetUrlFromId(hashtagsSheetId);

  const bookId = existingBook
    ? existingBook.id
    : createBook({
        authorId,
        slug: bookSlug,
        title: handoff.book.title,
        description: normalizeNullable(handoff.request?.notes),
        driveFolderId,
        driveFolderUrl,
        hooksSheetId,
        hooksSheetUrl,
        captionsSheetId,
        captionsSheetUrl,
        hashtagsSheetId,
        hashtagsSheetUrl,
      });

  const book = listBooksByAuthor(authorId).find((item) => item.id === bookId);

  if (!book) {
    throw new Error("Book was not found after import.");
  }

  if (existingBook) {
    updateBookDetails({
      bookId: book.id,
      title: book.title,
      seriesId: book.series_id,
      description: book.description,
      driveFolderId: driveFolderId ?? book.drive_folder_id,
      driveFolderUrl: driveFolderUrl ?? book.drive_folder_url,
      hooksSheetId: hooksSheetId ?? book.hooks_sheet_id,
      hooksSheetUrl: hooksSheetUrl ?? book.hooks_sheet_url,
      captionsSheetId: captionsSheetId ?? book.captions_sheet_id,
      captionsSheetUrl: captionsSheetUrl ?? book.captions_sheet_url,
      hashtagsSheetId: hashtagsSheetId ?? book.hashtags_sheet_id,
      hashtagsSheetUrl: hashtagsSheetUrl ?? book.hashtags_sheet_url,
    });
  }

  const updatedBook = listBooksByAuthor(authorId).find(
    (item) => item.id === bookId,
  );

  if (!updatedBook) {
    throw new Error("Book was not found after metadata update.");
  }

  return {
    book: updatedBook,
    created: !existingBook,
  };
}

function findOrCreateCampaign(
  handoff: AuthorloomRenderHandoff,
  bookId: string,
) {
  const campaignSlug =
    normalizeNullable(handoff.request?.batchSlug)
    ?? normalizeNullable(handoff.batch.slug)
    ?? slugifyCampaignName(handoff.batch.name);

  if (!campaignSlug) {
    throw new Error("Campaign slug could not be generated from the handoff.");
  }

  const existingCampaign = listCampaigns().find(
    (campaign) =>
      campaign.book_id === bookId
      && (campaign.slug === campaignSlug
        || slugifyCampaignName(campaign.name) === campaignSlug),
  );

  const campaignId = existingCampaign
    ? existingCampaign.id
    : createCampaign({
        name: handoff.request?.batchName ?? handoff.batch.name,
        slug: campaignSlug,
        description: normalizeNullable(handoff.request?.notes),
        bookId,
        layoutId: "default_video_layout",
        goal: "Imported from Authorloom render batch request.",
      });

  const campaign = listCampaigns().find((item) => item.id === campaignId);

  if (!campaign) {
    throw new Error("Campaign was not found after import.");
  }

  return {
    campaign,
    created: !existingCampaign,
  };
}

function findOrCreateRenderBatch(
  handoff: AuthorloomRenderHandoff,
  campaignId: string,
) {
  const batchName = handoff.batch.name.trim();

  if (!batchName) {
    throw new Error("Render batch name is required in the handoff.");
  }

  const existingBatch = listRenderBatchesByCampaign(campaignId).find(
    (batch) => batch.name === batchName,
  );

  const batchId = existingBatch
    ? existingBatch.id
    : createRenderBatch({
        campaignId,
        name: batchName,
        layoutId: "default_video_layout",
        status: "draft",
      });

  const batch = listRenderBatchesByCampaign(campaignId).find(
    (item) => item.id === batchId,
  );

  if (!batch) {
    throw new Error("Render batch was not found after import.");
  }

  return {
    batch,
    created: !existingBatch,
  };
}

export function importAuthorloomRenderHandoff(
  handoffFilePath: string,
  options: { force?: boolean } = {},
): AuthorloomHandoffImportResult {
  const absolutePath = normalizeHandoffPath(handoffFilePath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Authorloom handoff file was not found: ${absolutePath}`);
  }

  const importedRecord = getImportedHandoffRecord(absolutePath);

  if (importedRecord && !options.force) {
    throw new Error(
      `Authorloom handoff has already been imported: ${absolutePath}`,
    );
  }

  const handoff = parseAuthorloomRenderHandoff(absolutePath);
  const { author, created: authorCreated } = findOrCreateAuthor(handoff);
  const { book, created: bookCreated } = findOrCreateBook(handoff, author.id);
  const { campaign, created: campaignCreated } = findOrCreateCampaign(
    handoff,
    book.id,
  );
  const { batch, created: batchCreated } = findOrCreateRenderBatch(
    handoff,
    campaign.id,
  );

  return {
    handoffPath: absolutePath,
    contractVersion: handoff.contractVersion,
    author,
    authorCreated,
    book,
    bookCreated,
    campaign,
    campaignCreated,
    batch,
    batchCreated,
    nextUrl: `/campaigns/${campaign.id}/batches/${batch.id}`,
    warnings: [
      "Handoff import creates the local author/book/campaign/batch shell only.",
      "Import Drive assets, select batch assets, then generate/render jobs in BookTok Factory.",
    ],
  };
}

export function importAuthorloomRenderHandoffAndMark(
  handoffFilePath: string,
  options: { force?: boolean } = {},
) {
  const result = importAuthorloomRenderHandoff(handoffFilePath, {
    force: options.force,
  });
  markHandoffImported(result);
  return result;
}

export function importPendingAuthorloomHandoffs(
  directory = defaultAuthorloomHandoffDirectory,
  options: { force?: boolean } = {},
): AuthorloomHandoffFolderImportResult {
  const absoluteDirectory = path.resolve(directory);

  if (!fs.existsSync(absoluteDirectory)) {
    return {
      directory: absoluteDirectory,
      imported: [],
      skipped: [],
      failed: [],
    };
  }

  const queue = listAuthorloomHandoffQueue(absoluteDirectory);
  const imported: AuthorloomHandoffImportResult[] = [];
  const skipped: ImportedAuthorloomHandoffRecord[] = [];
  const failed: AuthorloomHandoffFolderImportResult["failed"] = [];

  for (const item of queue) {
    const existingRecord = getImportedHandoffRecord(item.handoffPath);

    if (existingRecord && !options.force) {
      skipped.push(existingRecord);
      continue;
    }

    try {
      imported.push(
        importAuthorloomRenderHandoffAndMark(item.handoffPath, {
          force: options.force,
        }),
      );
    } catch (error) {
      failed.push({
        handoffPath: item.handoffPath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    directory: absoluteDirectory,
    imported,
    skipped,
    failed,
  };
}
