"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import {
  createRenderBatch,
  generateRenderJobsForBatch,
  listRenderJobsByBatch,
  updateRenderBatch,
  updateRenderBatchAudioSelections,
  updateRenderBatchBackgroundSelections,
  updateRenderBatchCaptionSelections,
  updateRenderBatchHashtagSelections,
  updateRenderBatchHookSelections,
  updateRenderBatchScreenshotSelections,
  updateRenderBatchThumbnailSelections,
} from "@/lib/db";
import { renderJob } from "@/lib/ffmpeg";
import { uploadCompletedCampaignVideosToDrive } from "@/lib/google";
import {
  exportMetricoolSheet,
} from "@/lib/metricool";

const renderBatchFormSchema = z.object({
  campaignId: z.string().trim().min(1, "Campaign is required."),
  name: z.string().trim().min(1, "Batch name is required."),
  layoutId: z.string().optional(),
});

function getFormString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function getFormStrings(formData: FormData, key: string) {
  return formData
    .getAll(key)
    .filter((value): value is string => typeof value === "string");
}

function getAudioDurationOverrides(formData: FormData, audioIds: string[]) {
  return audioIds.map((audioId) => {
    const value = getFormString(formData, `renderDurationSeconds:${audioId}`);
    const parsed = value.trim() ? Number(value) : null;

    return {
      audioId,
      renderDurationSeconds:
        parsed === null || Number.isNaN(parsed) ? null : parsed,
    };
  });
}

export async function createRenderBatchAction(formData: FormData) {
  const parsed = renderBatchFormSchema.safeParse({
    campaignId: getFormString(formData, "campaignId"),
    name: getFormString(formData, "name"),
    layoutId: getFormString(formData, "layoutId"),
  });

  if (!parsed.success) {
    throw new Error(z.prettifyError(parsed.error));
  }

  const batchId = createRenderBatch(parsed.data);

  revalidatePath(`/campaigns/${parsed.data.campaignId}`);
  revalidatePath(`/campaigns/${parsed.data.campaignId}/batches/${batchId}`);
  redirect(`/campaigns/${parsed.data.campaignId}/batches/${batchId}`);
}

export async function updateRenderBatchCaptionAction(
  campaignId: string,
  batchId: string,
  formData: FormData,
) {
  updateRenderBatch({
    campaignId,
    batchId,
    caption: getFormString(formData, "caption"),
  });

  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath(`/campaigns/${campaignId}/batches/${batchId}`);
}

export async function updateRenderBatchScreenshotSelectionsAction(
  campaignId: string,
  batchId: string,
  formData: FormData,
) {
  updateRenderBatchScreenshotSelections({
    campaignId,
    batchId,
    assetIds: getFormStrings(formData, "assetIds"),
  });

  revalidatePath(`/campaigns/${campaignId}/batches/${batchId}`);
}

export async function updateRenderBatchHookSelectionsAction(
  campaignId: string,
  batchId: string,
  formData: FormData,
) {
  updateRenderBatchHookSelections({
    campaignId,
    batchId,
    assetIds: getFormStrings(formData, "assetIds"),
  });

  revalidatePath(`/campaigns/${campaignId}/batches/${batchId}`);
}

export async function updateRenderBatchBackgroundSelectionsAction(
  campaignId: string,
  batchId: string,
  formData: FormData,
) {
  updateRenderBatchBackgroundSelections({
    campaignId,
    batchId,
    assetIds: getFormStrings(formData, "assetIds"),
  });

  revalidatePath(`/campaigns/${campaignId}/batches/${batchId}`);
}

export async function updateRenderBatchAudioSelectionsAction(
  campaignId: string,
  batchId: string,
  formData: FormData,
) {
  const assetIds = getFormStrings(formData, "assetIds");

  updateRenderBatchAudioSelections({
    campaignId,
    batchId,
    assetIds,
    durationOverrides: getAudioDurationOverrides(formData, assetIds),
  });

  revalidatePath(`/campaigns/${campaignId}/batches/${batchId}`);
}

export async function updateRenderBatchCaptionSelectionsAction(
  campaignId: string,
  batchId: string,
  formData: FormData,
) {
  updateRenderBatchCaptionSelections({
    campaignId,
    batchId,
    assetIds: getFormStrings(formData, "assetIds"),
  });

  revalidatePath(`/campaigns/${campaignId}/batches/${batchId}`);
}

export async function updateRenderBatchHashtagSelectionsAction(
  campaignId: string,
  batchId: string,
  formData: FormData,
) {
  updateRenderBatchHashtagSelections({
    campaignId,
    batchId,
    assetIds: getFormStrings(formData, "assetIds"),
  });

  revalidatePath(`/campaigns/${campaignId}/batches/${batchId}`);
}

export async function updateRenderBatchThumbnailSelectionsAction(
  campaignId: string,
  batchId: string,
  formData: FormData,
) {
  updateRenderBatchThumbnailSelections({
    campaignId,
    batchId,
    assetIds: getFormStrings(formData, "assetIds"),
  });

  revalidatePath(`/campaigns/${campaignId}/batches/${batchId}`);
}

export async function generateRenderBatchJobsAction(
  campaignId: string,
  batchId: string,
  formData: FormData,
) {
  const allowLargeBatch = getFormString(formData, "allowLargeBatch") === "yes";
  let result;

  try {
    result = generateRenderJobsForBatch(batchId, { allowLargeBatch });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not generate batch jobs.";

    redirect(
      `/campaigns/${campaignId}/batches/${batchId}?jobsGenerated=error&jobsMessage=${encodeURIComponent(
        message,
      )}`,
    );
  }

  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath(`/campaigns/${campaignId}/batches/${batchId}`);

  redirect(
    `/campaigns/${campaignId}/batches/${batchId}?jobsGenerated=success&jobsCreated=${result.createdCount}&jobsSkipped=${result.skippedDuplicateCount}&jobsPreview=${result.previewCount}`,
  );
}

export async function renderPendingBatchJobsAction(
  campaignId: string,
  batchId: string,
) {
  const pendingJobs = listRenderJobsByBatch(batchId).filter(
    (job) => job.status === "pending",
  );

  for (const job of pendingJobs) {
    try {
      await renderJob(job.id);
    } catch (error) {
      console.error(`Render job ${job.id} failed.`, error);
    }
  }

  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath(`/campaigns/${campaignId}/batches/${batchId}`);
}

export async function retryFailedBatchJobsAction(
  campaignId: string,
  batchId: string,
) {
  const failedJobs = listRenderJobsByBatch(batchId).filter(
    (job) => job.status === "failed",
  );

  for (const job of failedJobs) {
    try {
      await renderJob(job.id);
    } catch (error) {
      console.error(`Render job ${job.id} failed.`, error);
    }
  }

  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath(`/campaigns/${campaignId}/batches/${batchId}`);
}

export async function runBatchEndToEndAction(
  campaignId: string,
  batchId: string,
  formData: FormData,
) {
  const allowLargeBatch = getFormString(formData, "allowLargeBatch") === "yes";
  const params = new URLSearchParams({
    workflowRun: "complete",
  });

  let generated;

  try {
    generated = generateRenderJobsForBatch(batchId, { allowLargeBatch });
    params.set("jobsCreated", String(generated.createdCount));
    params.set("jobsSkipped", String(generated.skippedDuplicateCount));
    params.set("jobsPreview", String(generated.previewCount));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not generate batch jobs.";

    redirect(
      `/campaigns/${campaignId}/batches/${batchId}?workflowRun=error&workflowMessage=${encodeURIComponent(
        message,
      )}`,
    );
  }

  const pendingJobs = listRenderJobsByBatch(batchId).filter(
    (job) => job.status === "pending",
  );
  let rendered = 0;
  let failedRenders = 0;

  for (const job of pendingJobs) {
    try {
      await renderJob(job.id);
      rendered += 1;
    } catch (error) {
      failedRenders += 1;
      console.error(`Render job ${job.id} failed.`, error);
    }
  }

  params.set("rendered", String(rendered));
  params.set("failedRenders", String(failedRenders));

  try {
    const uploadSummary = await uploadCompletedCampaignVideosToDrive(campaignId);
    params.set("videoUpload", uploadSummary.failed > 0 ? "partial" : "success");
    params.set("uploaded", String(uploadSummary.uploaded));
    params.set("uploadSkipped", String(uploadSummary.skippedAlreadyUploaded));
    params.set("uploadFailed", String(uploadSummary.failed));

    for (const error of uploadSummary.errors.slice(0, 5)) {
      params.append("uploadError", error);
    }
  } catch (error) {
    params.set("videoUpload", "error");
    params.set(
      "uploadError",
      error instanceof Error
        ? error.message
        : "Could not upload completed videos to Drive.",
    );
  }

  try {
    const sheetResult = await exportMetricoolSheet(campaignId);
    params.set("metricoolUpload", "success");
    params.set("metricoolRows", String(sheetResult.rowCount));

    if (sheetResult.spreadsheetUrl) {
      params.set("metricoolSheetUrl", sheetResult.spreadsheetUrl);
    }
  } catch (error) {
    params.set("metricoolUpload", "error");
    params.set(
      "metricoolMessage",
      error instanceof Error
        ? error.message
        : "Could not update the Metricool Google Sheet.",
    );
  }

  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath(`/campaigns/${campaignId}/batches/${batchId}`);

  redirect(`/campaigns/${campaignId}/batches/${batchId}?${params.toString()}`);
}
