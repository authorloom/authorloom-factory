import fs from "node:fs";
import path from "node:path";

import { listRenderJobsByBatch } from "@/lib/db";
import { uploadCompletedRenderBatchVideosToDrive } from "@/lib/google";
import {
  getImportedAuthorloomHandoffByBatchId,
  getImportedAuthorloomHandoffByPath,
  markAuthorloomHandoffUploaded,
  updateAuthorloomHandoffRenderStatus,
} from "@/lib/authorloom-handoff";

export type UploadImportedAuthorloomBatchInput =
  | {
      handoffPath: string;
      batchId?: never;
    }
  | {
      batchId: string;
      handoffPath?: never;
    };

export type UploadImportedAuthorloomBatchResult = {
  batchId: string;
  handoffPath: string | null;
  reportPath: string | null;
  rendered: number;
  uploaded: number;
  skippedAlreadyUploaded: number;
  failed: number;
  errors: string[];
  videoCount: number;
};

function resolveImportedRecord(input: UploadImportedAuthorloomBatchInput) {
  const record = input.batchId
    ? getImportedAuthorloomHandoffByBatchId(input.batchId)
    : input.handoffPath
      ? getImportedAuthorloomHandoffByPath(input.handoffPath)
      : null;

  if (!record) {
    throw new Error(
      "Could not find an imported Authorloom handoff for this batch/path.",
    );
  }

  return record;
}

function reportPathForHandoff(handoffPath: string) {
  const parsedPath = path.parse(handoffPath);
  return path.join(parsedPath.dir, `${parsedPath.name}.booktok-report.json`);
}

export async function uploadImportedAuthorloomBatchOutputs(
  input: UploadImportedAuthorloomBatchInput,
): Promise<UploadImportedAuthorloomBatchResult> {
  const record = resolveImportedRecord(input);
  const uploadSummary = await uploadCompletedRenderBatchVideosToDrive(
    record.batchId,
  );
  const completedJobs = listRenderJobsByBatch(record.batchId).filter(
    (job) => job.status === "done",
  );
  const reportPath = record.handoffPath
    ? reportPathForHandoff(record.handoffPath)
    : null;
  const report = {
    contractVersion: "booktok.authorloom.upload_report.v1",
    createdAt: new Date().toISOString(),
    handoffPath: record.handoffPath,
    authorId: record.authorId,
    bookId: record.bookId,
    campaignId: record.campaignId,
    batchId: record.batchId,
    rendered: completedJobs.length,
    uploaded: uploadSummary.uploaded,
    skippedAlreadyUploaded: uploadSummary.skippedAlreadyUploaded,
    failed: uploadSummary.failed,
    errors: uploadSummary.errors,
    videos: uploadSummary.videos,
  };

  if (reportPath) {
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

    updateAuthorloomHandoffRenderStatus({
      handoffPath: record.handoffPath,
      rendered: completedJobs.length,
      uploaded: uploadSummary.uploaded + uploadSummary.skippedAlreadyUploaded,
      videos: uploadSummary.videos,
      reportPath,
    });
    markAuthorloomHandoffUploaded({
      batchId: record.batchId,
      reportPath,
    });
  }

  return {
    batchId: record.batchId,
    handoffPath: record.handoffPath,
    reportPath,
    rendered: completedJobs.length,
    uploaded: uploadSummary.uploaded,
    skippedAlreadyUploaded: uploadSummary.skippedAlreadyUploaded,
    failed: uploadSummary.failed,
    errors: uploadSummary.errors,
    videoCount: uploadSummary.videos.length,
  };
}
