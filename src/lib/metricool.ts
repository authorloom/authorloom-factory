import fs from "node:fs/promises";
import path from "node:path";

import {
  getCampaign,
  getRenderBatch,
  listRenderJobs,
  listRenderJobsByBatch,
  updateCampaignMetricoolSheet,
  type RenderJobListItem,
} from "@/lib/db";
import {
  addDriveFileToFolder,
  getDriveFile,
  setDriveFileReadableByLink,
  uploadFileToDrive,
} from "@/lib/google";
import { paths } from "@/lib/paths";
import {
  clearSheetRows,
  createSpreadsheet,
  type SheetRow,
  writeSheetRows,
} from "@/lib/sheets";

export type MetricoolExportResult = {
  filepath: string;
  filename: string;
  rowCount: number;
};

export type MetricoolDriveUploadResult = {
  driveFileId: string;
  driveUrl: string | null;
};

export type MetricoolSheetExportResult = {
  spreadsheetId: string;
  spreadsheetUrl: string | null;
  rowCount: number;
  title: string;
};

function escapeCsvValue(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function formatTimestamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function campaignExportDirectory(campaignId: string) {
  return path.join(paths.exportsDirectory, campaignId);
}

async function writeMetricoolCsv({
  exportDirectory,
  filename,
  rows,
}: {
  exportDirectory: string;
  filename: string;
  rows: string[];
}) {
  const filepath = path.join(exportDirectory, filename);

  await fs.mkdir(exportDirectory, { recursive: true });
  await fs.writeFile(filepath, ["caption,video_url", ...rows].join("\n"), {
    encoding: "utf8",
  });

  return filepath;
}

function metricoolRowsForCompletedJobs(jobs: RenderJobListItem[]) {
  return metricoolRowValuesForCompletedJobs(jobs).map(([caption, videoUrl]) =>
    [escapeCsvValue(String(caption)), escapeCsvValue(String(videoUrl))].join(","),
  );
}

function metricoolRowValuesForCompletedJobs(
  jobs: RenderJobListItem[],
  options?: { requireDriveUrl?: boolean },
) {
  return jobs
    .filter(
      (job) =>
        job.status === "done" &&
        (options?.requireDriveUrl ? job.drive_url : job.drive_url || job.output_filepath),
    )
    .map((job) => {
      const videoUrl = job.drive_url ?? job.output_filepath ?? "";
      const caption = job.caption;

      return [caption, videoUrl] satisfies SheetRow;
    });
}

export async function exportMetricoolCsv(
  campaignId: string,
): Promise<MetricoolExportResult> {
  const exportDirectory = campaignExportDirectory(campaignId);
  const filename = `metricool-export-${formatTimestamp()}.csv`;
  const rows = metricoolRowsForCompletedJobs(listRenderJobs(campaignId));
  const filepath = await writeMetricoolCsv({
    exportDirectory,
    filename,
    rows,
  });

  return {
    filepath,
    filename,
    rowCount: rows.length,
  };
}

export async function exportMetricoolCsvForBatch(
  campaignId: string,
  batchId: string,
): Promise<MetricoolExportResult> {
  const batch = getRenderBatch(batchId);

  if (!batch || batch.campaign_id !== campaignId) {
    throw new Error("Render batch was not found for this campaign.");
  }

  const exportDirectory = campaignExportDirectory(campaignId);
  const filename = `batch-${batchId}-metricool-export-${formatTimestamp()}.csv`;
  const rows = metricoolRowsForCompletedJobs(listRenderJobsByBatch(batchId));
  const filepath = await writeMetricoolCsv({
    exportDirectory,
    filename,
    rows,
  });

  return {
    filepath,
    filename,
    rowCount: rows.length,
  };
}

export async function uploadMetricoolCsvToDrive(
  campaignId: string,
  exportResult: MetricoolExportResult,
): Promise<MetricoolDriveUploadResult> {
  const campaign = getCampaign(campaignId);

  if (!campaign) {
    throw new Error("Campaign not found.");
  }

  if (!campaign.drive_campaign_folder_id) {
    throw new Error("Campaign Drive folder is not synced.");
  }

  const driveFile = await uploadFileToDrive({
    parentFolderId: campaign.drive_campaign_folder_id,
    filepath: exportResult.filepath,
    filename: exportResult.filename,
    mimeType: "text/csv",
  });

  if (!driveFile.id) {
    throw new Error("Google Drive did not return an uploaded CSV file ID.");
  }

  await setDriveFileReadableByLink(driveFile.id);

  const refreshedDriveFile = await getDriveFile(driveFile.id);
  const driveUrl =
    refreshedDriveFile.webViewLink ??
    driveFile.webViewLink ??
    refreshedDriveFile.webContentLink ??
    driveFile.webContentLink ??
    null;

  return {
    driveFileId: driveFile.id,
    driveUrl,
  };
}

export async function exportMetricoolSheet(
  campaignId: string,
): Promise<MetricoolSheetExportResult> {
  const campaign = getCampaign(campaignId);

  if (!campaign) {
    throw new Error("Campaign not found.");
  }

  return exportMetricoolSheetForJobs({
    campaignId,
    title: campaign.slug
      ? `${campaign.slug}-metricool`
      : `campaign-${campaignId}-metricool`,
    jobs: listRenderJobs(campaignId),
    existingSpreadsheetId: campaign.metricool_sheet_id,
    existingSpreadsheetUrl: campaign.metricool_sheet_url,
  });
}

export async function exportMetricoolSheetForBatch(
  campaignId: string,
  batchId: string,
): Promise<MetricoolSheetExportResult> {
  const batch = getRenderBatch(batchId);

  if (!batch || batch.campaign_id !== campaignId) {
    throw new Error("Render batch was not found for this campaign.");
  }

  return exportMetricoolSheetForJobs({
    campaignId,
    title: `batch-${batchId}-metricool-export-${formatTimestamp()}`,
    jobs: listRenderJobsByBatch(batchId),
  });
}

async function exportMetricoolSheetForJobs(input: {
  campaignId: string;
  title: string;
  jobs: RenderJobListItem[];
  existingSpreadsheetId?: string | null;
  existingSpreadsheetUrl?: string | null;
}): Promise<MetricoolSheetExportResult> {
  const campaign = getCampaign(input.campaignId);

  if (!campaign) {
    throw new Error("Campaign not found.");
  }

  if (!campaign.drive_campaign_folder_id) {
    throw new Error("Campaign Drive folder is not synced.");
  }

  const completedJobs = input.jobs.filter((job) => job.status === "done");
  const completedJobsMissingDriveUrl = completedJobs.filter(
    (job) => !job.drive_url,
  );

  if (completedJobsMissingDriveUrl.length > 0) {
    throw new Error(
      `Metricool Sheet cannot be updated yet. ${completedJobsMissingDriveUrl.length} completed video${
        completedJobsMissingDriveUrl.length === 1 ? " is" : "s are"
      } still missing Google Drive URLs. Queue the Drive upload and wait for the background worker to finish before updating Metricool.`,
    );
  }

  const rows = metricoolRowValuesForCompletedJobs(input.jobs, {
    requireDriveUrl: true,
  });
  let spreadsheetId = input.existingSpreadsheetId ?? null;
  let spreadsheetUrl = input.existingSpreadsheetUrl ?? null;

  if (!spreadsheetId) {
    const spreadsheet = await createSpreadsheet({
      title: input.title,
      sheetTitle: "Metricool",
    });

    if (!spreadsheet.spreadsheetId) {
      throw new Error("Google Sheets did not return a spreadsheet ID.");
    }

    spreadsheetId = spreadsheet.spreadsheetId;
    spreadsheetUrl = spreadsheet.spreadsheetUrl ?? null;

    await addDriveFileToFolder(spreadsheetId, campaign.drive_campaign_folder_id);
    await setDriveFileReadableByLink(spreadsheetId);
  }

  await clearSheetRows({
    spreadsheetId,
    range: "Metricool!A:Z",
  });
  await writeSheetRows({
    spreadsheetId,
    range: "Metricool!A:B",
    rows: [["caption", "video_url"], ...rows],
  });

  const driveFile = await getDriveFile(spreadsheetId);
  spreadsheetUrl = spreadsheetUrl ?? driveFile.webViewLink ?? null;

  if (
    campaign.metricool_sheet_id !== spreadsheetId ||
    campaign.metricool_sheet_url !== spreadsheetUrl ||
    !campaign.metricool_sheet_updated_at
  ) {
    updateCampaignMetricoolSheet({
      campaignId: input.campaignId,
      metricoolSheetId: spreadsheetId,
      metricoolSheetUrl: spreadsheetUrl,
      metricoolSheetUpdatedAt: new Date().toISOString(),
    });
  } else {
    updateCampaignMetricoolSheet({
      campaignId: input.campaignId,
      metricoolSheetUpdatedAt: new Date().toISOString(),
    });
  }

  return {
    spreadsheetId,
    spreadsheetUrl,
    rowCount: rows.length,
    title: input.title,
  };
}

export async function getLatestMetricoolExportFilepath(campaignId: string) {
  const exportDirectory = campaignExportDirectory(campaignId);

  try {
    const entries = await fs.readdir(exportDirectory, {
      withFileTypes: true,
    });
    const exportFiles = entries
      .filter(
        (entry) =>
          entry.isFile() &&
          entry.name.startsWith("metricool-export-") &&
          entry.name.endsWith(".csv"),
      )
      .map((entry) => entry.name)
      .sort((a, b) => b.localeCompare(a));

    return exportFiles[0] ? path.join(exportDirectory, exportFiles[0]) : null;
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return null;
    }

    throw error;
  }
}
