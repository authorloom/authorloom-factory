import {
  generateRenderJobsForBatch,
  getRenderBatch,
  listRenderJobsByBatch,
  type RenderJobListItem,
} from "@/lib/db";
import { renderJob } from "@/lib/ffmpeg";
import {
  getImportedAuthorloomHandoffByBatchId,
  getImportedAuthorloomHandoffByPath,
  importAuthorloomRenderHandoffAndMark,
  markAuthorloomHandoffRendered,
  type ImportedAuthorloomHandoffRecord,
} from "@/lib/authorloom-handoff";

export type RenderImportedAuthorloomBatchInput =
  | {
      handoffPath: string;
      batchId?: never;
      forceImport?: boolean;
      allowLargeBatch?: boolean;
    }
  | {
      batchId: string;
      handoffPath?: never;
      forceImport?: never;
      allowLargeBatch?: boolean;
    };

export type RenderImportedAuthorloomBatchResult = {
  batchId: string;
  handoffPath: string | null;
  importedDuringRun: boolean;
  jobsCreated: number;
  jobsSkipped: number;
  jobsPreview: number;
  pendingBeforeRender: number;
  rendered: number;
  failed: number;
  errors: string[];
};

function requireImportedBatch(batchId: string) {
  const batch = getRenderBatch(batchId);

  if (!batch) {
    throw new Error(`Render batch not found: ${batchId}`);
  }

  const importedRecord = getImportedAuthorloomHandoffByBatchId(batchId);

  if (!importedRecord) {
    throw new Error(
      `Render batch ${batchId} is not linked to an imported Authorloom handoff.`,
    );
  }

  return importedRecord;
}

function resolveImportedHandoff(input: RenderImportedAuthorloomBatchInput) {
  if (input.batchId) {
    return {
      record: requireImportedBatch(input.batchId),
      importedDuringRun: false,
    };
  }

  const handoffPath = input.handoffPath;

  if (!handoffPath) {
    throw new Error("Authorloom handoff path is required.");
  }

  const existingRecord = getImportedAuthorloomHandoffByPath(handoffPath);

  if (existingRecord && !input.forceImport) {
    return {
      record: existingRecord,
      importedDuringRun: false,
    };
  }

  const imported = importAuthorloomRenderHandoffAndMark(handoffPath, {
    force: input.forceImport,
  });

  return {
    record: {
      handoffPath: imported.handoffPath,
      importedAt: new Date().toISOString(),
      contractVersion: imported.contractVersion,
      authorId: imported.author.id,
      bookId: imported.book.id,
      campaignId: imported.campaign.id,
      batchId: imported.batch.id,
      nextUrl: imported.nextUrl,
    } satisfies ImportedAuthorloomHandoffRecord,
    importedDuringRun: true,
  };
}

function renderJobSafely(job: RenderJobListItem) {
  return renderJob(job.id)
    .then(() => ({
      ok: true as const,
      error: null,
    }))
    .catch((error: unknown) => ({
      ok: false as const,
      error:
        error instanceof Error
          ? `Render job ${job.id} failed: ${error.message}`
          : `Render job ${job.id} failed: ${String(error)}`,
    }));
}

export async function renderImportedAuthorloomBatch(
  input: RenderImportedAuthorloomBatchInput,
): Promise<RenderImportedAuthorloomBatchResult> {
  const { record, importedDuringRun } = resolveImportedHandoff(input);
  const generated = generateRenderJobsForBatch(record.batchId, {
    allowLargeBatch: input.allowLargeBatch,
  });
  const pendingJobs = listRenderJobsByBatch(record.batchId).filter(
    (job) => job.status === "pending",
  );
  let rendered = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const job of pendingJobs) {
    const result = await renderJobSafely(job);

    if (result.ok) {
      rendered += 1;
    } else {
      failed += 1;
      errors.push(result.error);
      console.error(result.error);
    }
  }

  if (rendered > 0 || pendingJobs.length === 0) {
    markAuthorloomHandoffRendered(record.batchId);
  }

  return {
    batchId: record.batchId,
    handoffPath: record.handoffPath,
    importedDuringRun,
    jobsCreated: generated.createdCount,
    jobsSkipped: generated.skippedDuplicateCount,
    jobsPreview: generated.previewCount,
    pendingBeforeRender: pendingJobs.length,
    rendered,
    failed,
    errors,
  };
}
