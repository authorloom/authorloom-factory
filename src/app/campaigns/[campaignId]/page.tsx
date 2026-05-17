import Link from "next/link";
import { notFound } from "next/navigation";

import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { PageHeader, PageShell } from "@/components/page-shell";
import { SubmitButton } from "@/components/submit-button";
import {
  getCampaign,
  getBook,
  getLayout,
  getCampaignVideoUploadQueueStats,
  listRenderBatchesByCampaign,
  listRenderJobsByBatch,
  listRenderJobs,
  getRenderBatchMatrixStats,
  type RenderBatch,
  type RenderBatchMatrixStats,
} from "@/lib/db";
import {
  deleteRenderBatchAction,
  exportMetricoolSheetAction,
  prepareCampaignDriveOutputFoldersAction,
  syncCampaignDriveFolderAction,
  uploadCompletedCampaignVideosToDriveAction,
} from "./actions";

export const dynamic = "force-dynamic";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function googleDriveFolderUrl(folderId: string) {
  return `https://drive.google.com/drive/folders/${folderId}`;
}

function CampaignSummaryCards({
  cards,
}: {
  cards: Array<[string, number]>;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-5">
      {cards.map(([label, value]) => (
        <div
          key={label}
          className="rounded-lg border border-zinc-200 bg-white p-4"
        >
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            {label}
          </p>
          <p className="mt-2 text-2xl font-semibold text-zinc-950">{value}</p>
        </div>
      ))}
    </div>
  );
}

function RenderBatchesTable({
  campaignId,
  batches,
  batchStats,
  batchRenderJobCounts,
}: {
  campaignId: string;
  batches: RenderBatch[];
  batchStats: Map<string, RenderBatchMatrixStats>;
  batchRenderJobCounts: Map<string, number>;
}) {
  if (batches.length === 0) {
    return (
      <div className="mt-4 rounded-lg border border-dashed border-zinc-300 bg-white p-5">
        <p className="text-sm text-zinc-500">
          No render batches created yet. Create a batch to choose reusable book
          assets, audio, and caption overrides for a production run.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4 overflow-hidden rounded-md border border-zinc-200">
      <table className="w-full text-left text-sm">
        <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-500">
          <tr>
            <th className="px-3 py-2 font-semibold">Batch</th>
            <th className="px-3 py-2 font-semibold">Status</th>
            <th className="px-3 py-2 font-semibold">Created</th>
            <th className="px-3 py-2 font-semibold">Selected</th>
            <th className="px-3 py-2 font-semibold">Jobs</th>
            <th className="px-3 py-2 font-semibold">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-200 bg-white">
          {batches.map((batch) => {
            const stats = batchStats.get(batch.id);
            const renderJobCount = batchRenderJobCounts.get(batch.id) ?? 0;

            return (
              <tr key={batch.id}>
                <td className="px-3 py-3 font-medium text-zinc-900">
                  {batch.name}
                </td>
                <td className="px-3 py-3">
                  <span className="rounded-full border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-600">
                    {batch.status}
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-zinc-600">
                  {formatDate(batch.created_at)}
                </td>
                <td className="px-3 py-3 text-zinc-600">
                  {stats
                    ? `${stats.screenshotCount} screenshots, ${stats.hookCount} hooks, ${stats.backgroundCount} backgrounds, ${stats.audioCount} audio`
                    : "Not loaded"}
                </td>
                <td className="px-3 py-3 text-zinc-600">
                  {stats
                    ? `${renderJobCount} generated / ${stats.previewCount} preview`
                    : renderJobCount}
                </td>
                <td className="px-3 py-3">
                  <div className="flex flex-wrap items-center gap-3">
                  <Link
                    href={`/campaigns/${campaignId}/batches/${batch.id}`}
                    className="font-medium text-rose-700 hover:text-rose-900"
                  >
                    Open batch
                  </Link>
                    <form
                      action={deleteRenderBatchAction.bind(
                        null,
                        campaignId,
                        batch.id,
                      )}
                    >
                      <input
                        className="sr-only"
                        type="checkbox"
                        name="confirmBatchDelete"
                        checked
                        readOnly
                      />
                      <ConfirmSubmitButton
                        confirmWhenCheckedName="confirmBatchDelete"
                        confirmMessage={`Delete "${batch.name}"? This will remove the batch, its render jobs, local MP4 outputs, and any uploaded Drive videos for this batch. This cannot be undone.`}
                        pendingLabel="Deleting..."
                        savedLabel="Deleted"
                        className="inline-flex min-h-8 items-center justify-center rounded-md border border-rose-200 px-3 text-xs font-medium text-rose-700 transition hover:bg-rose-50 active:translate-y-px disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-400"
                      >
                        Delete
                      </ConfirmSubmitButton>
                    </form>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MetricoolExportPanel({
  campaignId,
  sheetNeedsUpdate,
  sheetStatus,
  uploadStatus,
  metricoolSheetId,
  metricoolSheetUrl,
}: {
  campaignId: string;
  sheetNeedsUpdate: boolean;
  sheetStatus: string;
  metricoolSheetId: string | null;
  metricoolSheetUrl: string | null;
  uploadStatus?: {
    status?: string;
    message?: string;
    rows?: string;
    sheetId?: string;
    sheetUrl?: string;
  };
}) {
  return (
    <div className="mt-4 grid gap-4">
      <div
        className={`rounded-md border px-3 py-2 text-sm ${
          sheetNeedsUpdate
            ? "border-amber-200 bg-amber-50 text-amber-800"
            : "border-zinc-200 bg-white text-zinc-700"
        }`}
      >
        {sheetStatus}
      </div>
      {metricoolSheetId || metricoolSheetUrl ? (
        <div className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm">
          <p className="font-medium text-zinc-900">Metricool Sheet</p>
          {metricoolSheetUrl ? (
            <a
              href={metricoolSheetUrl}
              className="mt-1 block break-all text-rose-700 underline"
              target="_blank"
              rel="noreferrer"
            >
              {metricoolSheetUrl}
            </a>
          ) : (
            <p className="mt-1 break-all font-mono text-xs text-zinc-700">
              {metricoolSheetId}
            </p>
          )}
        </div>
      ) : null}
      <form action={exportMetricoolSheetAction.bind(null, campaignId)}>
        <SubmitButton
          disabled={!sheetNeedsUpdate}
          pendingLabel="Exporting..."
          savedLabel="Exported"
        >
          Export/update Metricool Sheet
        </SubmitButton>
      </form>
      {uploadStatus?.status ? (
        <div
          className={`rounded-md border px-3 py-2 text-sm ${
            uploadStatus.status === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-800"
          }`}
        >
          {uploadStatus.status === "success" ? (
            <>
              <p className="font-medium">Metricool export updated</p>
              <dl className="mt-2 grid gap-1">
                <div>
                  <dt className="font-medium">Rows</dt>
                  <dd>{uploadStatus.rows}</dd>
                </div>
                <div>
                  <dt className="font-medium">Sheet ID</dt>
                  <dd className="break-all">{uploadStatus.sheetId}</dd>
                </div>
                {uploadStatus.sheetUrl ? (
                  <div>
                    <dt className="font-medium">Sheet link</dt>
                    <dd>
                      <a
                        href={uploadStatus.sheetUrl}
                        className="break-all underline"
                        target="_blank"
                        rel="noreferrer"
                      >
                        {uploadStatus.sheetUrl}
                      </a>
                    </dd>
                  </div>
                ) : null}
              </dl>
            </>
          ) : (
            <>
              <p className="font-medium">Metricool Sheet update failed</p>
              <p className="mt-1 break-words">{uploadStatus.message}</p>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

type CampaignWorkspacePageProps = {
  params: Promise<{
    campaignId: string;
  }>;
  searchParams: Promise<{
    driveSync?: string;
    message?: string;
    outputSync?: string;
    outputMessage?: string;
    videoUpload?: string;
    uploaded?: string;
    skipped?: string;
    skippedLimit?: string;
    remaining?: string;
    failed?: string;
    uploadLimit?: string;
    queued?: string;
    requeued?: string;
    eligible?: string;
    workerStarted?: string;
    workerAlreadyRunning?: string;
    workerMessage?: string;
    workerPid?: string;
    workerLog?: string;
    uploadError?: string | string[];
    metricoolUpload?: string;
    metricoolMessage?: string;
    metricoolRows?: string;
    metricoolSheetId?: string;
    metricoolSheetUrl?: string;
    batchDelete?: string;
    deletedBatchName?: string;
    deletedJobs?: string;
    deletedLocalFiles?: string;
    trashedDriveFiles?: string;
    batchDeleteError?: string | string[];
  }>;
};

export default async function CampaignWorkspacePage({
  params,
  searchParams,
}: CampaignWorkspacePageProps) {
  const { campaignId } = await params;
  const {
    driveSync,
    message,
    outputSync,
    outputMessage,
    videoUpload,
    uploaded,
    skipped,
    skippedLimit,
    remaining,
    failed,
    uploadLimit,
    queued,
    requeued,
    eligible,
    workerStarted,
    workerAlreadyRunning,
    workerMessage,
    workerPid,
    workerLog,
    uploadError,
    metricoolUpload,
    metricoolMessage,
    metricoolRows,
    metricoolSheetId,
    metricoolSheetUrl,
    batchDelete,
    deletedBatchName,
    deletedJobs,
    deletedLocalFiles,
    trashedDriveFiles,
    batchDeleteError,
  } = await searchParams;
  const campaign = getCampaign(campaignId);

  if (!campaign) {
    notFound();
  }

  const renderJobs = listRenderJobs(campaignId);
  const linkedBook = campaign.book_id ? getBook(campaign.book_id) : null;
  const linkedLayout = campaign.layout_id ? getLayout(campaign.layout_id) : null;
  const renderBatches = listRenderBatchesByCampaign(campaignId);
  const uploadQueueStats = getCampaignVideoUploadQueueStats(campaignId);
  const batchStats = new Map(
    renderBatches.map((batch) => [
      batch.id,
      getRenderBatchMatrixStats(batch.id),
    ]),
  );
  const batchRenderJobCounts = new Map(
    renderBatches.map((batch) => [
      batch.id,
      listRenderJobsByBatch(batch.id).length,
    ]),
  );
  const renderJobStatusCounts = {
    pending: 0,
    running: 0,
    done: 0,
    failed: 0,
  };

  for (const job of renderJobs) {
    renderJobStatusCounts[job.status] += 1;
  }
  const completedRenderJobs = renderJobs.filter((job) => job.status === "done");
  const uploadedRenderJobs = completedRenderJobs.filter(
    (job) => job.drive_file_id || job.drive_url,
  );
  const uploadPendingRenderCount = completedRenderJobs.filter(
    (job) => !job.drive_file_id && !job.drive_url && job.output_filepath,
  ).length;
  const uploadBlockedRenderCount = completedRenderJobs.filter(
    (job) => !job.drive_file_id && !job.drive_url && !job.output_filepath,
  ).length;
  const metricoolSheetSyncedAt = campaign.metricool_sheet_updated_at
    ? new Date(campaign.metricool_sheet_updated_at).getTime()
    : 0;
  const uploadQueueInProgressCount =
    uploadQueueStats.queued + uploadQueueStats.running;
  const metricoolSheetBlockedByUploads =
    uploadPendingRenderCount > 0 || uploadQueueInProgressCount > 0;
  const latestUploadedVideoAt = uploadedRenderJobs.reduce((latest, job) => {
    const timestamp = new Date(job.updated_at).getTime();
    return Number.isNaN(timestamp) ? latest : Math.max(latest, timestamp);
  }, 0);
  const latestBatchCaptionUpdateAt = renderBatches.reduce((latest, batch) => {
    const hasUploadedJob = uploadedRenderJobs.some(
      (job) => job.batch_id === batch.id,
    );

    if (!hasUploadedJob) {
      return latest;
    }

    const timestamp = new Date(batch.updated_at).getTime();
    return Number.isNaN(timestamp) ? latest : Math.max(latest, timestamp);
  }, 0);
  const metricoolSheetNeedsUpdate =
    !metricoolSheetBlockedByUploads &&
    uploadedRenderJobs.length > 0 &&
    (!campaign.metricool_sheet_updated_at ||
      latestUploadedVideoAt > metricoolSheetSyncedAt ||
      latestBatchCaptionUpdateAt > metricoolSheetSyncedAt);
  const metricoolSheetStatus =
    metricoolSheetBlockedByUploads
      ? `${uploadPendingRenderCount} completed video${
          uploadPendingRenderCount === 1 ? "" : "s"
        } still need Google Drive URLs before Metricool can be updated. Queue uploads and wait for the background worker to finish first.`
      : uploadedRenderJobs.length === 0
      ? "Upload completed videos before updating the Metricool Sheet."
      : metricoolSheetNeedsUpdate
        ? "Metricool Sheet needs an update from the latest uploaded videos or batch captions."
        : "Metricool Sheet is up to date with the uploaded videos.";
  const uploadErrors = Array.isArray(uploadError)
    ? uploadError
    : uploadError
      ? [uploadError]
      : [];
  const batchDeleteErrors = Array.isArray(batchDeleteError)
    ? batchDeleteError
    : batchDeleteError
      ? [batchDeleteError]
      : [];
  const summaryCards: Array<[string, number]> = [
    ["Batches", renderBatches.length],
    ["Pending", renderJobStatusCounts.pending],
    ["Processing", renderJobStatusCounts.running],
    ["Completed", renderJobStatusCounts.done],
    ["Failed", renderJobStatusCounts.failed],
  ];

  return (
    <PageShell>
      <PageHeader
        title={campaign.name}
        eyebrow="Campaign workspace"
        action={
          <Link
            href="/campaigns"
            className="inline-flex rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
          >
            Back to campaigns
          </Link>
        }
      >
        {campaign.description ? <p>{campaign.description}</p> : null}
      </PageHeader>

      <div className="grid gap-5">
        {batchDelete ? (
          <div
            className={`rounded-md border px-3 py-2 text-sm ${
              batchDelete === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : batchDelete === "partial"
                  ? "border-amber-200 bg-amber-50 text-amber-800"
                  : "border-rose-200 bg-rose-50 text-rose-800"
            }`}
          >
            <p className="font-medium">
              {batchDelete === "success"
                ? "Render batch deleted."
                : batchDelete === "partial"
                  ? "Render batch deleted with cleanup warnings."
                  : "Render batch delete failed."}
            </p>
            {batchDelete !== "error" ? (
              <ul className="mt-2 grid gap-1">
                <li>Batch: {deletedBatchName ?? "Deleted batch"}</li>
                <li>Render jobs removed: {deletedJobs ?? "0"}</li>
                <li>Local MP4 files removed: {deletedLocalFiles ?? "0"}</li>
                <li>Drive videos moved to trash: {trashedDriveFiles ?? "0"}</li>
              </ul>
            ) : null}
            {batchDeleteErrors.length > 0 ? (
              <div className="mt-3">
                <p className="font-medium">Warnings</p>
                <ul className="mt-1 grid gap-1">
                  {batchDeleteErrors.map((error) => (
                    <li key={error}>{error}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}

        <section className="border-b border-zinc-200 pb-6">
          <h2 className="text-lg font-semibold">Campaign details</h2>
          <dl className="mt-4 grid gap-4 text-sm md:grid-cols-2">
            <div>
              <dt className="font-medium text-zinc-500">Book</dt>
              <dd className="mt-1 text-zinc-900">
                {linkedBook ? (
                  <Link
                    href={`/books/${linkedBook.id}`}
                    className="font-medium text-rose-700 hover:text-rose-900"
                  >
                    {linkedBook.title}
                  </Link>
                ) : (
                  "Not set"
                )}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-zinc-500">Layout</dt>
              <dd className="mt-1 text-zinc-900">
                {linkedLayout?.name ?? campaign.layout_id ?? "Not set"}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-zinc-500">Slug</dt>
              <dd className="mt-1 font-mono text-zinc-900">
                {campaign.slug ?? "Not set"}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-zinc-500">Goal</dt>
              <dd className="mt-1 whitespace-pre-wrap text-zinc-900">
                {campaign.goal ?? "Not set"}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-zinc-500">Created</dt>
              <dd className="mt-1 text-zinc-900">
                {formatDate(campaign.created_at)}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-zinc-500">Updated</dt>
              <dd className="mt-1 text-zinc-900">
                {formatDate(campaign.updated_at)}
              </dd>
            </div>
            <div>
              <dt className="flex items-center gap-2 font-medium text-zinc-500">
                Campaign Drive Folder ID
                <form
                  action={syncCampaignDriveFolderAction.bind(null, campaign.id)}
                >
                  <input
                    type="hidden"
                    name="driveCampaignFolderUrl"
                    value={campaign.drive_campaign_folder_url ?? ""}
                  />
                  <SubmitButton
                    disabled={!campaign.drive_campaign_folder_url}
                    pendingLabel="..."
                    savedLabel="✓"
                    className="inline-flex size-7 items-center justify-center rounded-md border border-zinc-300 text-sm text-zinc-600 transition hover:bg-zinc-100 active:translate-y-px disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-400"
                  >
                    ↻
                  </SubmitButton>
                </form>
              </dt>
              <dd className="mt-1 break-words text-zinc-900">
                {campaign.drive_campaign_folder_id ?? "Not synced"}
              </dd>
            </div>
            <div>
              <dt className="flex items-center gap-2 font-medium text-zinc-500">
                Drive output folder
                {campaign.drive_final_videos_folder_id ? (
                  <a
                    href={googleDriveFolderUrl(
                      campaign.drive_final_videos_folder_id,
                    )}
                    className="inline-flex size-7 items-center justify-center rounded-md border border-zinc-300 text-sm text-zinc-600 transition hover:bg-zinc-100"
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Open final-videos folder"
                  >
                    ↗
                  </a>
                ) : null}
              </dt>
              <dd className="mt-1 break-words text-zinc-900">
                {campaign.drive_final_videos_folder_id ?? "Not prepared"}
              </dd>
            </div>
          </dl>

          {message ? (
            <p
              className={`mt-6 rounded-md border px-3 py-2 text-sm ${
                driveSync === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-rose-200 bg-rose-50 text-rose-800"
              }`}
            >
              {message}
            </p>
          ) : null}

          {!campaign.drive_final_videos_folder_id ? (
            <form
              action={prepareCampaignDriveOutputFoldersAction.bind(
                null,
                campaign.id,
              )}
              className="mt-4 rounded-lg border border-zinc-200 bg-white p-4"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="font-medium text-zinc-950">
                    Drive output folders
                  </h3>
                  <p className="mt-1 text-sm text-zinc-500">
                    Find or create final-videos inside the synced campaign slug
                    folder. Metricool Sheets are created beside final-videos.
                  </p>
                </div>
                <SubmitButton
                  pendingLabel="Preparing..."
                  savedLabel="Prepared"
                  disabled={!campaign.drive_campaign_folder_id}
                >
                  Prepare Drive output folders
                </SubmitButton>
              </div>
              {outputMessage ? (
                <p
                  className={`mt-4 rounded-md border px-3 py-2 text-sm ${
                    outputSync === "success"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border-rose-200 bg-rose-50 text-rose-800"
                  }`}
                >
                  {outputMessage}
                </p>
              ) : null}
            </form>
          ) : null}

        </section>

        <section className="border-b border-zinc-200 py-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">Campaign summary</h2>
              <p className="mt-1 text-sm text-zinc-500">
                This campaign uses reusable book assets, render batches, and
                global audio selections.
              </p>
            </div>
            <span className="rounded-full border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-500">
              Book-based
            </span>
          </div>

          <div className="mt-4">
            <CampaignSummaryCards cards={summaryCards} />
          </div>
        </section>

        <section className="border-b border-zinc-200 py-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Render batches</h2>
              <p className="mt-1 text-sm text-zinc-500">
                Each batch is one production run with its own selected assets,
                audio, caption, and render jobs.
              </p>
            </div>
            <Link
              href={`/campaigns/${campaignId}/batches/new`}
              className="inline-flex min-h-10 items-center justify-center rounded-md bg-zinc-950 px-4 text-sm font-medium text-white hover:bg-zinc-800"
            >
              Create render batch
            </Link>
          </div>
          <RenderBatchesTable
            campaignId={campaignId}
            batches={renderBatches}
            batchStats={batchStats}
            batchRenderJobCounts={batchRenderJobCounts}
          />
        </section>

        <section className="border-b border-zinc-200 py-6">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-lg font-semibold">Drive delivery and exports</h2>
            <span className="rounded-full border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-500">
              Metricool
            </span>
          </div>
          <div className="mt-4 grid gap-4">
            <form
              action={uploadCompletedCampaignVideosToDriveAction.bind(
                null,
                campaign.id,
              )}
              className="rounded-lg border border-zinc-200 bg-white p-4"
            >
              <div className="grid gap-3 sm:grid-cols-4">
                <div className="rounded-md border border-zinc-200 px-3 py-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                    Not uploaded
                  </p>
                  <p className="mt-1 text-xl font-semibold text-zinc-900">
                    {uploadPendingRenderCount}
                  </p>
                </div>
                <div className="rounded-md border border-zinc-200 px-3 py-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                    Uploaded
                  </p>
                  <p className="mt-1 text-xl font-semibold text-zinc-900">
                    {uploadedRenderJobs.length}
                  </p>
                </div>
                <div className="rounded-md border border-zinc-200 px-3 py-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                    Queued
                  </p>
                  <p className="mt-1 text-xl font-semibold text-zinc-900">
                    {uploadQueueStats.queued + uploadQueueStats.running}
                  </p>
                </div>
                <div className="rounded-md border border-zinc-200 px-3 py-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                    Queue failed
                  </p>
                  <p className="mt-1 text-xl font-semibold text-zinc-900">
                    {uploadQueueStats.failed}
                  </p>
                </div>
              </div>
              <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="font-medium text-zinc-950">
                    Upload rendered videos
                  </h3>
                  <p className="mt-1 text-sm text-zinc-500">
                    Queue completed local MP4 renders for the background Drive
                    upload worker. The queue runs in the background, so you can
                    leave this page while videos upload.
                  </p>
                  {uploadBlockedRenderCount > 0 ? (
                    <p className="mt-1 text-sm text-amber-700">
                      {uploadBlockedRenderCount} completed render
                      {uploadBlockedRenderCount === 1 ? "" : "s"} cannot upload
                      because the local output filepath is missing.
                    </p>
                  ) : null}
                </div>
                <SubmitButton
                  pendingLabel="Uploading..."
                  savedLabel="Uploaded"
                  disabled={
                    !campaign.drive_final_videos_folder_id ||
                    uploadPendingRenderCount === 0
                  }
                >
                  Queue and start uploads
                </SubmitButton>
              </div>
              {videoUpload ? (
                <div
                  className={`mt-4 rounded-md border px-3 py-2 text-sm ${
                    videoUpload === "success"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border-amber-200 bg-amber-50 text-amber-800"
                  }`}
                >
                  <p className="font-medium">Drive video upload summary</p>
                  {videoUpload === "queued" ? (
                    <ul className="mt-2 grid gap-1">
                      <li>Eligible videos: {eligible ?? "0"}</li>
                      <li>Newly queued: {queued ?? "0"}</li>
                      <li>Requeued failed items: {requeued ?? "0"}</li>
                      <li>
                        Worker:{" "}
                        {workerMessage ??
                          (workerStarted === "true"
                            ? "Drive upload worker started."
                            : workerAlreadyRunning === "true"
                              ? "Drive upload worker is already running."
                              : "Drive upload worker was not started.")}
                      </li>
                      {workerPid ? <li>PID: {workerPid}</li> : null}
                      {workerLog ? <li>Log: {workerLog}</li> : null}
                    </ul>
                  ) : (
                    <ul className="mt-2 grid gap-1">
                      <li>Uploaded: {uploaded ?? "0"}</li>
                      <li>Skipped already uploaded: {skipped ?? "0"}</li>
                      <li>Skipped this run: {skippedLimit ?? "0"}</li>
                      <li>Still not uploaded: {remaining ?? "0"}</li>
                      <li>Failed: {failed ?? "0"}</li>
                    </ul>
                  )}
                  {uploadLimit && videoUpload !== "queued" ? (
                    <p className="mt-2">
                      This run attempted up to {uploadLimit} new upload
                      {uploadLimit === "1" ? "" : "s"}.
                    </p>
                  ) : null}
                  {uploadErrors.length > 0 ? (
                    <div className="mt-3">
                      <p className="font-medium">Errors</p>
                      <ul className="mt-1 grid gap-1">
                        {uploadErrors.map((error) => (
                          <li key={error}>{error}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </form>
          </div>
          <MetricoolExportPanel
            campaignId={campaignId}
            sheetNeedsUpdate={metricoolSheetNeedsUpdate}
            sheetStatus={metricoolSheetStatus}
            metricoolSheetId={campaign.metricool_sheet_id}
            metricoolSheetUrl={campaign.metricool_sheet_url}
            uploadStatus={{
              status: metricoolUpload,
              message: metricoolMessage,
              rows: metricoolRows,
              sheetId: metricoolSheetId,
              sheetUrl: metricoolSheetUrl,
            }}
          />
        </section>
      </div>
    </PageShell>
  );
}
