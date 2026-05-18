import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";

import { drive_v3, google } from "googleapis";

import {
  getBook,
  getCampaign,
  getRenderBatch,
  getRenderJobDetails,
  listRenderJobs,
  listRenderJobsByBatch,
  type RenderJobListItem,
  updateCampaignDriveOutputFolders,
  updateRenderJobDriveFile,
} from "@/lib/db";
import { env } from "@/lib/env";
import {
  assertGoogleServiceAccountConfigured,
  getGoogleAuthClient,
  getGoogleOAuthClient,
  getGoogleServiceAccountAuth,
} from "@/lib/google-auth";

const driveFolderMimeType = "application/vnd.google-apps.folder";

export type DriveFile = drive_v3.Schema$File;

export type BookDriveFolderStatus = {
  key:
    | "sourceAssets"
    | "screenshots"
    | "backgrounds"
    | "thumbnails"
    | "captions"
    | "hashtags"
    | "cover"
    | "manuscript"
    | "campaigns";
  label: string;
  expectedName: string;
  found: boolean;
  folderId: string | null;
  folderName: string | null;
};

export type BookDriveFolderInspection = {
  bookId: string;
  folderId: string;
  folderName: string | null;
  webViewLink: string | null;
  folders: BookDriveFolderStatus[];
};

export type CampaignDriveOutputFolders = {
  campaignId: string;
  finalVideosFolderId: string;
  metricoolFolderId: string | null;
};

export type CreatedCampaignDriveFolder = {
  folderId: string;
  folderUrl: string | null;
};

export type CreatedBookDriveFolder = {
  folderId: string;
  folderUrl: string | null;
  screenshotsFolderId: string;
  thumbnailsFolderId: string;
  captionsFolderId: string;
  hashtagsFolderId: string;
};

export type CampaignVideoUploadSummary = {
  uploaded: number;
  skippedAlreadyUploaded: number;
  skippedDueToLimit: number;
  remainingNotUploaded: number;
  failed: number;
  errors: string[];
};

export type UploadedVideoOutput = {
  jobId: string;
  outputFilename: string | null;
  outputFilepath: string | null;
  driveFileId: string | null;
  driveUrl: string | null;
  caption: string;
  hookText: string;
  thumbnailId: string | null;
  thumbnailDriveUrl: string | null;
};

export type BatchVideoUploadSummary = CampaignVideoUploadSummary & {
  campaignId: string;
  batchId: string;
  videos: UploadedVideoOutput[];
};

export function assertGoogleDriveConfigured() {
  assertGoogleServiceAccountConfigured();
}

export function getGoogleServiceAccountEmail() {
  if (env.GOOGLE_CLIENT_EMAIL) {
    return env.GOOGLE_CLIENT_EMAIL;
  }

  if (!env.GOOGLE_APPLICATION_CREDENTIALS) {
    return null;
  }

  try {
    const rawCredentials = fs.readFileSync(
      env.GOOGLE_APPLICATION_CREDENTIALS,
      "utf8",
    );
    const credentials = JSON.parse(rawCredentials) as {
      client_email?: unknown;
    };

    return typeof credentials.client_email === "string"
      ? credentials.client_email
      : null;
  } catch {
    return null;
  }
}

export function getDriveClient(options?: { write?: boolean }) {
  const auth = getGoogleAuthClient({
    preferOAuth:
      Boolean(options?.write) ||
      env.GOOGLE_FACTORY_PREFER_OAUTH_WRITES === "true",
  });
  return google.drive({ version: "v3", auth });
}

function getServiceAccountDriveClient() {
  return google.drive({
    version: "v3",
    auth: getGoogleServiceAccountAuth({ impersonateWorkspace: false }),
  });
}

function getWorkspaceImpersonatedDriveClient() {
  return google.drive({
    version: "v3",
    auth: getGoogleServiceAccountAuth({ impersonateWorkspace: true }),
  });
}

function getOAuthDriveClient() {
  return google.drive({ version: "v3", auth: getGoogleOAuthClient() });
}

function getDriveWriteClient() {
  if (env.GOOGLE_FACTORY_PREFER_OAUTH_WRITES === "true") {
    return getOAuthDriveClient();
  }

  if (env.GOOGLE_WORKSPACE_IMPERSONATE_EMAIL) {
    return getWorkspaceImpersonatedDriveClient();
  }

  try {
    return getOAuthDriveClient();
  } catch {
    // Fall back to service-account writes for read/write operations that do not
    // create owned files in Drive. Video uploads should use OAuth or delegation.
  }

  return getServiceAccountDriveClient();
}

function driveWriteAuthLabel() {
  return env.GOOGLE_FACTORY_PREFER_OAUTH_WRITES === "true"
    ? "OAuth"
    : env.GOOGLE_WORKSPACE_IMPERSONATE_EMAIL
    ? `workspace impersonation (${env.GOOGLE_WORKSPACE_IMPERSONATE_EMAIL})`
    : `service account (${getGoogleServiceAccountEmail() ?? "unknown"})`;
}

export function extractDriveIdFromUrl(input: string) {
  const trimmed = input.trim();

  if (!trimmed) {
    return null;
  }

  if (!trimmed.includes("/") && /^[a-zA-Z0-9_-]+$/.test(trimmed)) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed);
    const folderMatch = url.pathname.match(/\/folders\/([a-zA-Z0-9_-]+)/);
    const fileMatch = url.pathname.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    const documentMatch = url.pathname.match(
      /\/(?:document|spreadsheets|presentation)\/d\/([a-zA-Z0-9_-]+)/,
    );
    const queryId = url.searchParams.get("id");

    return (
      folderMatch?.[1] ??
      fileMatch?.[1] ??
      documentMatch?.[1] ??
      queryId ??
      null
    );
  } catch {
    const looseMatch = trimmed.match(/[-\w]{20,}/);
    return looseMatch?.[0] ?? null;
  }
}

export async function getDriveFile(fileId: string) {
  const errors: unknown[] = [];

  async function getFileWithClient(drive: drive_v3.Drive) {
    const response = await drive.files.get({
      fileId,
      fields:
        "id,name,mimeType,parents,size,modifiedTime,webViewLink,webContentLink",
      supportsAllDrives: true,
    });

    return response.data;
  }

  try {
    return await getFileWithClient(
      getServiceAccountDriveClient(),
    );
  } catch (error) {
    errors.push(error);
  }

  try {
    return await getFileWithClient(getOAuthDriveClient());
  } catch (error) {
    errors.push(error);
  }

  throw wrapGoogleError(
    errors[0],
    `Could not read Google Drive file ${fileId}`,
  );
}

export async function listDriveFolderChildren(folderId: string) {
  const errors: unknown[] = [];

  async function listWithClient(drive: drive_v3.Drive) {
    const files: DriveFile[] = [];
    let pageToken: string | undefined;

    do {
      const response = await drive.files.list({
        q: `'${escapeDriveQueryValue(folderId)}' in parents and trashed = false`,
        fields:
          "nextPageToken, files(id,name,mimeType,parents,size,modifiedTime,webViewLink,webContentLink)",
        includeItemsFromAllDrives: true,
        supportsAllDrives: true,
        pageSize: 1000,
        pageToken,
      });

      files.push(...(response.data.files ?? []));
      pageToken = response.data.nextPageToken ?? undefined;
    } while (pageToken);

    return files;
  }

  try {
    return await listWithClient(
      getServiceAccountDriveClient(),
    );
  } catch (error) {
    errors.push(error);
  }

  try {
    return await listWithClient(getOAuthDriveClient());
  } catch (error) {
    errors.push(error);
  }

  throw wrapGoogleError(
    errors[0],
    `Could not list Google Drive folder ${folderId}`,
  );
}

export async function findSharedDriveFoldersByName(name: string) {
  try {
    const drive = getDriveClient({ write: true });
    const files: DriveFile[] = [];
    let pageToken: string | undefined;

    do {
      const response = await drive.files.list({
        q: `mimeType = '${driveFolderMimeType}' and name = '${escapeDriveQueryValue(
          name,
        )}' and trashed = false`,
        fields:
          "nextPageToken, files(id,name,mimeType,parents,webViewLink,owners(emailAddress,displayName))",
        includeItemsFromAllDrives: true,
        supportsAllDrives: true,
        pageSize: 20,
        pageToken,
      });

      files.push(...(response.data.files ?? []));
      pageToken = response.data.nextPageToken ?? undefined;
    } while (pageToken);

    return files;
  } catch (error) {
    throw wrapGoogleError(
      error,
      `Could not search Google Drive for folder ${name}`,
    );
  }
}

export async function findDriveChildByName(
  folderId: string,
  name: string,
  mimeType?: string,
) {
  const children = await listDriveFolderChildren(folderId);

  return (
    children.find(
      (child) =>
        child.name === name && (!mimeType || child.mimeType === mimeType),
    ) ?? null
  );
}

export async function createDriveFolder(parentFolderId: string, name: string) {
  try {
    const drive = getDriveWriteClient();
    const response = await drive.files.create({
      requestBody: {
        name,
        mimeType: driveFolderMimeType,
        parents: [parentFolderId],
      },
      fields: "id,name,mimeType,parents,webViewLink",
      supportsAllDrives: true,
    });

    return response.data;
  } catch (error) {
    throw wrapGoogleError(
      error,
      `Could not create Google Drive folder ${name} using ${driveWriteAuthLabel()}`,
    );
  }
}

export async function downloadDriveFile(
  fileId: string,
  destinationFilepath: string,
) {
  const errors: unknown[] = [];

  async function downloadWithClient(drive: drive_v3.Drive) {
    const response = await drive.files.get(
      { fileId, alt: "media", supportsAllDrives: true },
      { responseType: "stream" },
    );

    await pipeline(response.data, fs.createWriteStream(destinationFilepath));
    return destinationFilepath;
  }

  try {
    return await downloadWithClient(
      getServiceAccountDriveClient(),
    );
  } catch (error) {
    errors.push(error);
  }

  try {
    return await downloadWithClient(getOAuthDriveClient());
  } catch (error) {
    errors.push(error);
  }

  throw wrapGoogleError(
    errors[0],
    `Could not read Google Drive file ${fileId}`,
  );
}

export async function uploadFileToDrive(input: {
  parentFolderId: string;
  filepath: string;
  filename: string;
  mimeType?: string;
}) {
  try {
    const drive = getDriveWriteClient();
    const response = await drive.files.create({
      requestBody: {
        name: input.filename,
        parents: [input.parentFolderId],
      },
      media: {
        mimeType: input.mimeType,
        body: fs.createReadStream(input.filepath),
      },
      fields: "id,name,mimeType,parents,webViewLink,webContentLink",
      supportsAllDrives: true,
    });

    return response.data;
  } catch (error) {
    throw wrapGoogleError(
      error,
      `Could not upload ${input.filename} to Google Drive using ${driveWriteAuthLabel()}`,
    );
  }
}

export async function setDriveFileReadableByLink(fileId: string) {
  try {
    const drive = getDriveWriteClient();

    await drive.permissions.create({
      fileId,
      requestBody: {
        role: "reader",
        type: "anyone",
      },
      supportsAllDrives: true,
    });
  } catch (error) {
    throw wrapGoogleError(
      error,
      `Could not make Google Drive file ${fileId} readable by link using ${driveWriteAuthLabel()}`,
    );
  }
}

export async function trashDriveFile(fileId: string) {
  async function trashWithClient(drive: drive_v3.Drive) {
    await drive.files.update({
      fileId,
      requestBody: {
        trashed: true,
      },
      supportsAllDrives: true,
    });
  }

  try {
    await trashWithClient(getDriveWriteClient());
  } catch (primaryError) {
    try {
      await trashWithClient(getDriveClient());
    } catch {
      throw wrapGoogleError(
        primaryError,
        `Could not move Google Drive file ${fileId} to trash using ${driveWriteAuthLabel()}`,
      );
    }
  }
}

export async function addDriveFileToFolder(fileId: string, folderId: string) {
  try {
    const drive = getDriveWriteClient();
    const existingFile = await getDriveFile(fileId);
    const response = await drive.files.update({
      fileId,
      addParents: folderId,
      removeParents: existingFile.parents?.join(","),
      fields: "id,name,mimeType,parents,webViewLink,webContentLink",
      supportsAllDrives: true,
    });

    return response.data;
  } catch (error) {
    throw wrapGoogleError(
      error,
      `Could not add Google Drive file ${fileId} to folder ${folderId} using ${driveWriteAuthLabel()}`,
    );
  }
}

export async function getDriveWebViewLink(fileId: string) {
  const file = await getDriveFile(fileId);
  return file.webViewLink ?? null;
}

export async function getDriveWebContentLink(fileId: string) {
  const file = await getDriveFile(fileId);
  return file.webContentLink ?? null;
}

export async function inspectBookDriveFolder(
  bookId: string,
): Promise<BookDriveFolderInspection> {
  const book = getBook(bookId);

  if (!book) {
    throw new Error("Book not found.");
  }

  const folderId =
    book.drive_folder_id ??
    (book.drive_folder_url ? extractDriveIdFromUrl(book.drive_folder_url) : null);

  if (!folderId) {
    throw new Error("Book Drive folder is not connected.");
  }

  const bookFolder = await getDriveFile(folderId);

  if (bookFolder.mimeType !== driveFolderMimeType) {
    throw new Error("The configured Book Drive ID does not point to a folder.");
  }

  const bookFolderChildren = await listDriveFolderChildren(folderId);
  const sourceAssets = findFolderInList(bookFolderChildren, "source-assets");
  const campaigns = findFolderInList(bookFolderChildren, "campaigns");
  const sourceAssetChildren = sourceAssets?.id
    ? await listDriveFolderChildren(sourceAssets.id)
    : [];

  const screenshots = findFolderInList(sourceAssetChildren, "screenshots");
  const backgrounds = findFolderInList(sourceAssetChildren, "backgrounds");
  const thumbnails = findFolderInList(sourceAssetChildren, "thumbnails");
  const captions = findFolderInList(sourceAssetChildren, "captions");
  const hashtags = findFolderInList(sourceAssetChildren, "hashtags");
  const cover = findFolderInList(sourceAssetChildren, "cover");
  const manuscript = findFolderInList(sourceAssetChildren, "manuscript");

  return {
    bookId,
    folderId,
    folderName: bookFolder.name ?? null,
    webViewLink: bookFolder.webViewLink ?? null,
    folders: [
      createFolderStatus("sourceAssets", "source-assets", sourceAssets),
      createFolderStatus("screenshots", "screenshots", screenshots),
      createFolderStatus("backgrounds", "backgrounds", backgrounds),
      createFolderStatus("thumbnails", "thumbnails", thumbnails),
      createFolderStatus("captions", "captions", captions),
      createFolderStatus("hashtags", "hashtags", hashtags),
      createFolderStatus("cover", "cover", cover),
      createFolderStatus("manuscript", "manuscript", manuscript),
      createFolderStatus("campaigns", "campaigns", campaigns),
    ],
  };
}

export async function ensureCampaignDriveOutputFolders(
  campaignId: string,
): Promise<CampaignDriveOutputFolders> {
  const campaign = getCampaign(campaignId);

  if (!campaign) {
    throw new Error("Campaign not found.");
  }

  if (!campaign.drive_campaign_folder_id) {
    throw new Error("Campaign Drive folder is not synced.");
  }

  const campaignFolder = await getDriveFile(campaign.drive_campaign_folder_id);

  if (campaignFolder.mimeType !== driveFolderMimeType) {
    throw new Error("The configured Campaign Drive ID does not point to a folder.");
  }

  const finalVideosFolder = await findOrCreateDriveFolder(
    campaign.drive_campaign_folder_id,
    "final-videos",
  );

  if (!finalVideosFolder.id) {
    throw new Error("Could not resolve Campaign Drive final-videos folder ID.");
  }

  updateCampaignDriveOutputFolders({
    campaignId,
    driveFinalVideosFolderId: finalVideosFolder.id,
    driveMetricoolFolderId: null,
  });

  return {
    campaignId,
    finalVideosFolderId: finalVideosFolder.id,
    metricoolFolderId: null,
  };
}

export async function createCampaignDriveFolderForBook(input: {
  bookId: string;
  slug: string;
}): Promise<CreatedCampaignDriveFolder> {
  const book = getBook(input.bookId);

  if (!book) {
    throw new Error("Selected book was not found.");
  }

  const bookDriveFolderId =
    book.drive_folder_id ??
    (book.drive_folder_url ? extractDriveIdFromUrl(book.drive_folder_url) : null);

  if (!bookDriveFolderId) {
    throw new Error("Selected book does not have a connected Drive folder.");
  }

  const bookFolder = await getDriveFile(bookDriveFolderId);

  if (bookFolder.mimeType !== driveFolderMimeType) {
    throw new Error("The configured Book Drive ID does not point to a folder.");
  }

  const campaignsFolder = await findOrCreateDriveFolder(
    bookDriveFolderId,
    "campaigns",
  );

  if (!campaignsFolder.id) {
    throw new Error("Could not resolve the book campaigns Drive folder.");
  }

  const existingCampaignFolder = await findDriveChildByName(
    campaignsFolder.id,
    input.slug,
    driveFolderMimeType,
  );
  const campaignFolder =
    existingCampaignFolder ??
    (await createDriveFolder(campaignsFolder.id, input.slug));

  if (!campaignFolder.id) {
    throw new Error("Google Drive did not return a campaign folder ID.");
  }

  const refreshedCampaignFolder = await getDriveFile(campaignFolder.id);

  return {
    folderId: campaignFolder.id,
    folderUrl:
      refreshedCampaignFolder.webViewLink ?? campaignFolder.webViewLink ?? null,
  };
}

export async function createBookDriveFolderForAuthor(input: {
  authorDriveFolderId: string;
  slug: string;
}): Promise<CreatedBookDriveFolder> {
  const authorFolder = await getDriveFile(input.authorDriveFolderId);

  if (authorFolder.mimeType !== driveFolderMimeType) {
    throw new Error("The configured Author Drive ID does not point to a folder.");
  }

  const existingBookFolder = await findDriveChildByName(
    input.authorDriveFolderId,
    input.slug,
    driveFolderMimeType,
  );
  const bookFolder =
    existingBookFolder ??
    (await createDriveFolder(input.authorDriveFolderId, input.slug));

  if (!bookFolder.id) {
    throw new Error("Google Drive did not return a book folder ID.");
  }

  const sourceAssetsFolder = await findOrCreateDriveFolder(
    bookFolder.id,
    "source-assets",
  );

  if (!sourceAssetsFolder.id) {
    throw new Error("Could not resolve source-assets Drive folder.");
  }

  const screenshotsFolder = await findOrCreateDriveFolder(
    sourceAssetsFolder.id,
    "screenshots",
  );
  const thumbnailsFolder = await findOrCreateDriveFolder(
    sourceAssetsFolder.id,
    "thumbnails",
  );
  const captionsFolder = await findOrCreateDriveFolder(
    sourceAssetsFolder.id,
    "captions",
  );
  const hashtagsFolder = await findOrCreateDriveFolder(
    sourceAssetsFolder.id,
    "hashtags",
  );
  await findOrCreateDriveFolder(sourceAssetsFolder.id, "backgrounds");
  await findOrCreateDriveFolder(sourceAssetsFolder.id, "cover");
  await findOrCreateDriveFolder(sourceAssetsFolder.id, "manuscript");
  await findOrCreateDriveFolder(bookFolder.id, "campaigns");

  if (!screenshotsFolder.id) {
    throw new Error("Could not resolve screenshots Drive folder.");
  }

  if (!thumbnailsFolder.id) {
    throw new Error("Could not resolve thumbnails Drive folder.");
  }

  if (!captionsFolder.id) {
    throw new Error("Could not resolve captions Drive folder.");
  }

  if (!hashtagsFolder.id) {
    throw new Error("Could not resolve hashtags Drive folder.");
  }

  const refreshedBookFolder = await getDriveFile(bookFolder.id);

  return {
    folderId: bookFolder.id,
    folderUrl: refreshedBookFolder.webViewLink ?? bookFolder.webViewLink ?? null,
    screenshotsFolderId: screenshotsFolder.id,
    thumbnailsFolderId: thumbnailsFolder.id,
    captionsFolderId: captionsFolder.id,
    hashtagsFolderId: hashtagsFolder.id,
  };
}

export async function uploadCompletedCampaignVideosToDrive(
  campaignId: string,
  options?: { limit?: number },
): Promise<CampaignVideoUploadSummary> {
  const campaign = getCampaign(campaignId);

  if (!campaign) {
    throw new Error("Campaign not found.");
  }

  if (!campaign.drive_final_videos_folder_id) {
    throw new Error("Campaign Drive output folders are not prepared.");
  }

  const summary = await uploadCompletedJobsToDrive({
    campaignId,
    jobs: listRenderJobs(campaignId).filter((job) => job.status === "done"),
    limit: options?.limit,
  });

  return {
    uploaded: summary.uploaded,
    skippedAlreadyUploaded: summary.skippedAlreadyUploaded,
    skippedDueToLimit: summary.skippedDueToLimit,
    remainingNotUploaded: summary.remainingNotUploaded,
    failed: summary.failed,
    errors: summary.errors,
  };
}

export async function uploadCompletedRenderBatchVideosToDrive(
  batchId: string,
): Promise<BatchVideoUploadSummary> {
  const batch = getRenderBatch(batchId);

  if (!batch) {
    throw new Error("Render batch not found.");
  }

  const summary = await uploadCompletedJobsToDrive({
    campaignId: batch.campaign_id,
    jobs: listRenderJobsByBatch(batchId).filter((job) => job.status === "done"),
    limit: 25,
  });

  return {
    campaignId: batch.campaign_id,
    batchId,
    ...summary,
  };
}

export async function uploadRenderJobVideoToDrive(jobId: string) {
  const job = getRenderJobDetails(jobId);

  if (!job) {
    throw new Error("Render job not found.");
  }

  const summary = await uploadCompletedJobsToDrive({
    campaignId: job.campaign_id,
    jobs: [job],
  });

  return summary;
}

async function uploadCompletedJobsToDrive(input: {
  campaignId: string;
  jobs: RenderJobListItem[];
  limit?: number;
}) {
  const campaign = getCampaign(input.campaignId);

  if (!campaign) {
    throw new Error("Campaign not found.");
  }

  if (!campaign.drive_final_videos_folder_id) {
    throw new Error("Campaign Drive output folders are not prepared.");
  }

  const summary: Omit<BatchVideoUploadSummary, "campaignId" | "batchId"> = {
    uploaded: 0,
    skippedAlreadyUploaded: 0,
    skippedDueToLimit: 0,
    remainingNotUploaded: 0,
    failed: 0,
    errors: [],
    videos: [],
  };
  let uploadAttempts = 0;

  for (const job of input.jobs) {
    if (job.drive_file_id) {
      summary.skippedAlreadyUploaded += 1;
      summary.videos.push(createUploadedVideoOutput(job));
      continue;
    }

    if (input.limit !== undefined && uploadAttempts >= input.limit) {
      summary.skippedDueToLimit += 1;
      summary.remainingNotUploaded += 1;
      continue;
    }

    uploadAttempts += 1;

    if (!job.output_filepath) {
      summary.failed += 1;
      summary.remainingNotUploaded += 1;
      summary.errors.push(`${job.id}: missing output filepath`);
      continue;
    }

    try {
      await fs.promises.access(job.output_filepath);

      const filename =
        job.output_filename ?? path.basename(job.output_filepath);
      const driveFile = await uploadFileToDrive({
        parentFolderId: campaign.drive_final_videos_folder_id,
        filepath: job.output_filepath,
        filename,
        mimeType: "video/mp4",
      });

      if (!driveFile.id) {
        throw new Error("Google Drive did not return an uploaded file ID.");
      }

      await setDriveFileReadableByLink(driveFile.id);

      const refreshedDriveFile = await getDriveFile(driveFile.id);
      const driveUrl =
        refreshedDriveFile.webViewLink ??
        driveFile.webViewLink ??
        refreshedDriveFile.webContentLink ??
        driveFile.webContentLink ??
        `https://drive.google.com/file/d/${driveFile.id}/view`;

      updateRenderJobDriveFile({
        jobId: job.id,
        driveFileId: driveFile.id,
        driveUrl,
      });

      summary.uploaded += 1;
      summary.videos.push(
        createUploadedVideoOutput({
          ...job,
          drive_file_id: driveFile.id,
          drive_url: driveUrl,
        }),
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown Drive upload error.";

      summary.failed += 1;
      summary.remainingNotUploaded += 1;
      summary.errors.push(`${job.id}: ${message}`);
    }
  }

  return summary;
}

function createUploadedVideoOutput(
  job: RenderJobListItem,
): UploadedVideoOutput {
  return {
    jobId: job.id,
    outputFilename: job.output_filename,
    outputFilepath: job.output_filepath,
    driveFileId: job.drive_file_id,
    driveUrl: job.drive_url,
    caption: job.caption,
    hookText: job.hook_text,
    thumbnailId: job.thumbnail_id,
    thumbnailDriveUrl: job.thumbnail_drive_url,
  };
}

function escapeDriveQueryValue(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function findFolderInList(files: DriveFile[], name: string) {
  return (
    files.find(
      (file) => file.name === name && file.mimeType === driveFolderMimeType,
    ) ?? null
  );
}

async function findOrCreateDriveFolder(parentFolderId: string, name: string) {
  const existingFolder = await findDriveChildByName(
    parentFolderId,
    name,
    driveFolderMimeType,
  );

  return existingFolder ?? createDriveFolder(parentFolderId, name);
}

function createFolderStatus(
  key: BookDriveFolderStatus["key"],
  expectedName: string,
  folder: DriveFile | null,
): BookDriveFolderStatus {
  return {
    key,
    label:
      key === "sourceAssets"
        ? "source-assets"
        : expectedName,
    expectedName,
    found: Boolean(folder?.id),
    folderId: folder?.id ?? null,
    folderName: folder?.name ?? null,
  };
}

function wrapGoogleError(error: unknown, fallbackMessage: string) {
  if (error instanceof Error) {
    return new Error(`${fallbackMessage}: ${error.message}`);
  }

  return new Error(fallbackMessage);
}
