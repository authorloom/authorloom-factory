"use server";

import fs from "node:fs/promises";

import { revalidatePath } from "next/cache";

import {
  deleteRenderBatchAndJobs,
  enqueueCampaignVideoUploads,
  getCampaign,
  listRenderJobsByBatch,
  updateCampaignDriveFolder,
} from "@/lib/db";
import {
  ensureCampaignDriveOutputFolders,
  extractDriveIdFromUrl,
  getDriveFile,
  trashDriveFile,
} from "@/lib/google";
import { startDriveVideoUploadWorker } from "@/lib/drive-video-upload-runner";
import { exportMetricoolSheet } from "@/lib/metricool";
import { redirect } from "next/navigation";

function getTextAreaValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function isNonEmptyString(value: string | null): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export async function syncCampaignDriveFolderAction(
  campaignId: string,
  formData: FormData,
) {
  const campaign = getCampaign(campaignId);

  if (!campaign) {
    throw new Error("Campaign not found.");
  }

  const driveCampaignFolderUrl = getTextAreaValue(
    formData,
    "driveCampaignFolderUrl",
  );
  const driveCampaignFolderId = extractDriveIdFromUrl(driveCampaignFolderUrl);

  if (!driveCampaignFolderUrl.trim() || !driveCampaignFolderId) {
    redirect(
      `/campaigns/${campaignId}?driveSync=error&message=${encodeURIComponent(
        "Enter a Google Drive campaign folder URL before syncing.",
      )}`,
    );
  }

  let driveFolderName = driveCampaignFolderId;

  try {
    const driveFile = await getDriveFile(driveCampaignFolderId);

    if (driveFile.mimeType !== "application/vnd.google-apps.folder") {
      throw new Error("The Drive URL points to a file, not a folder.");
    }

    driveFolderName = driveFile.name ?? driveCampaignFolderId;

    updateCampaignDriveFolder({
      campaignId,
      driveCampaignFolderUrl,
      driveCampaignFolderId,
    });

    revalidatePath(`/campaigns/${campaignId}`);
    revalidatePath("/campaigns");
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Could not verify the Google Drive campaign folder.";

    redirect(
      `/campaigns/${campaignId}?driveSync=error&message=${encodeURIComponent(
        message,
      )}`,
    );
  }

  redirect(
    `/campaigns/${campaignId}?driveSync=success&message=${encodeURIComponent(
      `Connected Drive folder: ${driveFolderName}`,
    )}`,
  );
}

export async function prepareCampaignDriveOutputFoldersAction(
  campaignId: string,
) {
  let outputFolders;

  try {
    outputFolders = await ensureCampaignDriveOutputFolders(campaignId);

    revalidatePath(`/campaigns/${campaignId}`);
    revalidatePath("/campaigns");
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Could not prepare Campaign Drive output folders.";

    redirect(
      `/campaigns/${campaignId}?outputSync=error&outputMessage=${encodeURIComponent(
        message,
      )}`,
    );
  }

  redirect(
    `/campaigns/${campaignId}?outputSync=success&outputMessage=${encodeURIComponent(
      `Prepared Drive output folder. final-videos: ${outputFolders.finalVideosFolderId}`,
    )}`,
  );
}

export async function uploadCompletedCampaignVideosToDriveAction(
  campaignId: string,
) {
  let params = new URLSearchParams();

  try {
    const summary = enqueueCampaignVideoUploads(campaignId);
    const worker = await startDriveVideoUploadWorker(campaignId);

    params = new URLSearchParams({
      videoUpload: "queued",
      queued: String(summary.inserted),
      requeued: String(summary.requeued),
      eligible: String(summary.eligible),
      workerStarted: String(worker.started),
      workerAlreadyRunning: String(worker.alreadyRunning),
      workerMessage: worker.message,
    });

    if (worker.pid) {
      params.set("workerPid", String(worker.pid));
    }

    if (worker.logPath) {
      params.set("workerLog", worker.logPath);
    }

    revalidatePath(`/campaigns/${campaignId}`);
    revalidatePath("/campaigns");
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Could not upload completed campaign videos to Drive.";

    redirect(
      `/campaigns/${campaignId}?videoUpload=error&uploadError=${encodeURIComponent(
        message,
      )}`,
    );
  }

  redirect(`/campaigns/${campaignId}?${params.toString()}`);
}

export async function deleteRenderBatchAction(
  campaignId: string,
  batchId: string,
) {
  const jobs = listRenderJobsByBatch(batchId).filter(
    (job) => job.campaign_id === campaignId,
  );
  const params = new URLSearchParams();
  const errors: string[] = [];
  let driveFilesTrashed = 0;
  let localFilesDeleted = 0;

  for (const driveFileId of [
    ...new Set(jobs.map((job) => job.drive_file_id).filter(isNonEmptyString)),
  ]) {
    try {
      await trashDriveFile(driveFileId);
      driveFilesTrashed += 1;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Could not move uploaded Drive video to trash.";

      errors.push(message);
    }
  }

  for (const outputFilepath of [
    ...new Set(jobs.map((job) => job.output_filepath).filter(isNonEmptyString)),
  ]) {
    try {
      await fs.rm(outputFilepath, { force: true });
      localFilesDeleted += 1;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Could not delete local rendered video.";

      errors.push(`${outputFilepath}: ${message}`);
    }
  }

  try {
    const result = deleteRenderBatchAndJobs({ campaignId, batchId });

    params.set("batchDelete", errors.length > 0 ? "partial" : "success");
    params.set("deletedBatchName", result.batch.name);
    params.set("deletedJobs", String(result.deletedRenderJobs));
    params.set("deletedLocalFiles", String(localFilesDeleted));
    params.set("trashedDriveFiles", String(driveFilesTrashed));

    for (const error of errors) {
      params.append("batchDeleteError", error);
    }

    revalidatePath(`/campaigns/${campaignId}`);
    revalidatePath("/campaigns");
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not delete render batch.";

    params.set("batchDelete", "error");
    params.append("batchDeleteError", message);
  }

  redirect(`/campaigns/${campaignId}?${params.toString()}`);
}

export async function exportMetricoolSheetAction(campaignId: string) {
  let sheetResult;

  try {
    sheetResult = await exportMetricoolSheet(campaignId);

    revalidatePath(`/campaigns/${campaignId}`);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Could not update the Metricool Google Sheet.";

    redirect(
      `/campaigns/${campaignId}?metricoolUpload=error&metricoolMessage=${encodeURIComponent(
        message,
      )}`,
    );
  }

  const params = new URLSearchParams({
    metricoolUpload: "success",
    metricoolRows: String(sheetResult.rowCount),
    metricoolSheetId: sheetResult.spreadsheetId,
  });

  if (sheetResult.spreadsheetUrl) {
    params.set("metricoolSheetUrl", sheetResult.spreadsheetUrl);
  }

  redirect(`/campaigns/${campaignId}?${params.toString()}`);
}
