import {
  claimNextVideoUploadQueueItem,
  getCampaignVideoUploadQueueStats,
  markVideoUploadQueueItemDone,
  markVideoUploadQueueItemFailed,
} from "@/lib/db";
import { uploadRenderJobVideoToDrive } from "@/lib/google";

export type DriveVideoUploadWorkerResult = {
  processed: number;
  uploaded: number;
  skippedAlreadyUploaded: number;
  failed: number;
  errors: string[];
};

export async function runDriveVideoUploadWorker(input?: {
  maxItems?: number;
  campaignId?: string;
}) {
  const result: DriveVideoUploadWorkerResult = {
    processed: 0,
    uploaded: 0,
    skippedAlreadyUploaded: 0,
    failed: 0,
    errors: [],
  };

  while (input?.maxItems === undefined || result.processed < input.maxItems) {
    const item = claimNextVideoUploadQueueItem(input?.campaignId);

    if (!item) {
      break;
    }

    result.processed += 1;

    try {
      const uploadSummary = await uploadRenderJobVideoToDrive(
        item.render_job_id,
      );

      if (uploadSummary.failed > 0) {
        const error = uploadSummary.errors.join("\n") || "Upload failed.";
        markVideoUploadQueueItemFailed(item.id, error);
        result.failed += 1;
        result.errors.push(`${item.render_job_id}: ${error}`);
        continue;
      }

      markVideoUploadQueueItemDone(item.id);
      result.uploaded += uploadSummary.uploaded;
      result.skippedAlreadyUploaded += uploadSummary.skippedAlreadyUploaded;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown upload worker error.";
      markVideoUploadQueueItemFailed(item.id, message);
      result.failed += 1;
      result.errors.push(`${item.render_job_id}: ${message}`);
    }
  }

  return {
    ...result,
    campaignQueue: input?.campaignId
      ? getCampaignVideoUploadQueueStats(input.campaignId)
      : null,
  };
}
