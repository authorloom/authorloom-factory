import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BatchAudioSelectionPanel } from "@/components/batch-audio-selection-panel";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { PageHeader, PageShell } from "@/components/page-shell";
import { SubmitButton } from "@/components/submit-button";
import {
  getBook,
  getCampaign,
  getLayout,
  getRenderBatch,
  getRenderBatchMatrixStats,
  listAllAudioAssets,
  listBookBackgrounds,
  listBookCaptions,
  listBookHashtags,
  listBookHooks,
  listBookScreenshots,
  listBookThumbnails,
  listRenderBatchAudioSelections,
  listRenderBatchBackgroundSelections,
  listRenderBatchCaptionSelections,
  listRenderBatchHashtagSelections,
  listRenderBatchHookSelections,
  listRenderBatchScreenshotSelections,
  listRenderBatchThumbnailSelections,
  listRenderJobsByBatch,
  type BookBackground,
  type BookCaption,
  type BookHashtag,
  type BookHook,
  type BookScreenshot,
  type BookThumbnail,
  type RenderJobListItem,
} from "@/lib/db";

import {
  generateRenderBatchJobsAction,
  renderPendingBatchJobsAction,
  retryFailedBatchJobsAction,
  runBatchEndToEndAction,
  updateRenderBatchAudioSelectionsAction,
  updateRenderBatchBackgroundSelectionsAction,
  updateRenderBatchCaptionSelectionsAction,
  updateRenderBatchHashtagSelectionsAction,
  updateRenderBatchHookSelectionsAction,
  updateRenderBatchScreenshotSelectionsAction,
  updateRenderBatchThumbnailSelectionsAction,
} from "../actions";

export const dynamic = "force-dynamic";

type RenderBatchPageProps = {
  params: Promise<{
    campaignId: string;
    batchId: string;
  }>;
  searchParams: Promise<{
    jobsGenerated?: string;
    jobsCreated?: string;
    jobsSkipped?: string;
    jobsPreview?: string;
    jobsMessage?: string;
    workflowRun?: string;
    workflowMessage?: string;
    rendered?: string;
    failedRenders?: string;
    videoUpload?: string;
    uploaded?: string;
    uploadSkipped?: string;
    uploadFailed?: string;
    uploadError?: string | string[];
    metricoolUpload?: string;
    metricoolRows?: string;
    metricoolMessage?: string;
    metricoolSheetUrl?: string;
  }>;
};

type SelectionItem = {
  id: string;
  title: string;
  detail?: string;
  preview?: React.ReactNode;
};

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-5">
      <p className="text-3xl font-semibold text-zinc-950">{value}</p>
      <p className="mt-1 text-sm text-zinc-500">{label}</p>
    </div>
  );
}

function queryValues(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value;
  }

  return value ? [value] : [];
}

function BatchSizeWarning({ previewCount }: { previewCount: number }) {
  if (previewCount <= 100) {
    return (
      <p className="batch-size-toast fixed right-4 top-4 z-40 max-w-sm rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 shadow-lg xl:left-3 xl:right-auto xl:top-[31rem] xl:w-[170px]">
        This batch size is in the normal range.
      </p>
    );
  }

  if (previewCount <= 200) {
    return (
      <p className="batch-size-toast fixed right-4 top-4 z-40 max-w-sm rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 shadow-lg xl:left-3 xl:right-auto xl:top-[31rem] xl:w-[170px]">
        This will create {previewCount} render jobs. Keep an eye on batch size.
      </p>
    );
  }

  if (previewCount <= 1000) {
    return (
      <p className="batch-size-toast fixed right-4 top-4 z-40 max-w-sm rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 shadow-lg xl:left-3 xl:right-auto xl:top-[31rem] xl:w-[170px]">
        Strong warning: this will create {previewCount} render jobs. Consider
        splitting this into smaller batches if you want easier recovery.
      </p>
    );
  }

  return (
    <div className="batch-size-toast fixed right-4 top-4 z-40 max-w-sm rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 shadow-lg xl:left-3 xl:right-auto xl:top-[31rem] xl:w-[170px]">
      <p className="font-medium">This batch is very large.</p>
      <p className="mt-1">
        It would create {previewCount} render jobs. Generation is blocked unless
        you tick the override checkbox.
      </p>
    </div>
  );
}

function BatchStickyStats({
  screenshotCount,
  hookCount,
  backgroundCount,
  audioCount,
  captionCount,
  hashtagCount,
  thumbnailCount,
  previewCount,
}: {
  screenshotCount: number;
  hookCount: number;
  backgroundCount: number;
  audioCount: number;
  captionCount: number;
  hashtagCount: number;
  thumbnailCount: number;
  previewCount: number;
}) {
  const tone =
    previewCount <= 100
      ? {
          label: "Good",
          border: "border-emerald-200",
          bg: "bg-emerald-50",
          text: "text-emerald-800",
        }
      : previewCount <= 200
        ? {
            label: "Watch",
            border: "border-amber-200",
            bg: "bg-amber-50",
            text: "text-amber-800",
          }
        : {
            label: "High",
            border: "border-rose-200",
            bg: "bg-rose-50",
            text: "text-rose-800",
  };
  const stats = [
    ["Screenshots", screenshotCount],
    ["Hooks", hookCount],
    ["Backgrounds", backgroundCount],
    ["Thumb", thumbnailCount],
    ["Audio", audioCount],
    ["Captions", captionCount],
    ["Tags", hashtagCount],
  ] as const;

  return (
    <aside className="fixed left-3 top-24 z-30 hidden w-[170px] xl:block">
      <div
        className={`rounded-xl border ${tone.border} ${tone.bg} p-3 shadow-lg`}
      >
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
          Batch size
        </p>
        <p className={`mt-2 text-4xl font-semibold ${tone.text}`}>
          {previewCount}
        </p>
        <p className={`mt-1 text-xs font-semibold uppercase ${tone.text}`}>
          {tone.label}
        </p>
        <dl className="mt-4 grid gap-2 text-xs">
          {stats.map(([label, value]) => (
            <div
              key={label}
              className="flex items-center justify-between gap-2 rounded-md bg-white/75 px-2 py-1.5"
            >
              <dt className="font-medium text-zinc-500">{label}</dt>
              <dd className="font-semibold text-zinc-950">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </aside>
  );
}

function BatchActionSummary({
  query,
}: {
  query: Awaited<RenderBatchPageProps["searchParams"]>;
}) {
  const uploadErrors = queryValues(query.uploadError);

  if (query.jobsGenerated === "error") {
    return (
      <p className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
        {query.jobsMessage ?? "Could not generate batch jobs."}
      </p>
    );
  }

  if (query.jobsGenerated === "success") {
    return (
      <p className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
        Jobs generated: {query.jobsCreated ?? "0"} created,{" "}
        {query.jobsSkipped ?? "0"} skipped duplicates from{" "}
        {query.jobsPreview ?? "0"} possible renders.
      </p>
    );
  }

  if (query.workflowRun === "error") {
    return (
      <p className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
        {query.workflowMessage ?? "Could not run the batch end-to-end."}
      </p>
    );
  }

  if (query.workflowRun !== "complete") {
    return null;
  }

  return (
    <div className="mt-4 rounded-md border border-zinc-200 bg-zinc-50 p-4 text-sm">
      <h3 className="font-semibold text-zinc-950">End-to-end run summary</h3>
      <dl className="mt-3 grid gap-2 md:grid-cols-2">
        <div>
          <dt className="font-medium text-zinc-500">Jobs</dt>
          <dd className="mt-1 text-zinc-900">
            {query.jobsCreated ?? "0"} created, {query.jobsSkipped ?? "0"} skipped
          </dd>
        </div>
        <div>
          <dt className="font-medium text-zinc-500">Renders</dt>
          <dd className="mt-1 text-zinc-900">
            {query.rendered ?? "0"} rendered, {query.failedRenders ?? "0"} failed
          </dd>
        </div>
        <div>
          <dt className="font-medium text-zinc-500">Drive upload</dt>
          <dd className="mt-1 text-zinc-900">
            {query.videoUpload === "error"
              ? query.uploadError ?? "Upload failed"
              : `${query.uploaded ?? "0"} uploaded, ${
                  query.uploadSkipped ?? "0"
                } skipped, ${query.uploadFailed ?? "0"} failed`}
          </dd>
        </div>
        <div>
          <dt className="font-medium text-zinc-500">Metricool Sheet</dt>
          <dd className="mt-1 text-zinc-900">
            {query.metricoolUpload === "success"
              ? `${query.metricoolRows ?? "0"} rows updated`
              : query.metricoolMessage ?? "Sheet update failed"}
          </dd>
        </div>
      </dl>
      {query.metricoolSheetUrl ? (
        <a
          href={query.metricoolSheetUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex text-sm font-medium text-rose-700 hover:text-rose-900"
        >
          Open Metricool Sheet
        </a>
      ) : null}
      {uploadErrors.length > 0 ? (
        <ul className="mt-3 grid gap-1 text-xs text-rose-700">
          {uploadErrors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function RenderJobStatusCounts({
  statusCounts,
}: {
  statusCounts: Record<RenderJobListItem["status"], number>;
}) {
  const labels: Record<RenderJobListItem["status"], string> = {
    pending: "Pending",
    running: "Processing",
    done: "Completed",
    failed: "Failed",
  };

  return (
    <div className="grid gap-2 sm:grid-cols-4">
      {(["pending", "running", "done", "failed"] as const).map((status) => (
        <div
          key={status}
          className="rounded-md border border-zinc-200 bg-white px-3 py-2"
        >
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            {labels[status]}
          </p>
          <p className="mt-1 text-xl font-semibold text-zinc-900">
            {statusCounts[status]}
          </p>
        </div>
      ))}
    </div>
  );
}

function BatchRenderJobsList({
  campaignId,
  batchId,
  renderJobs,
  statusCounts,
}: {
  campaignId: string;
  batchId: string;
  renderJobs: RenderJobListItem[];
  statusCounts: Record<RenderJobListItem["status"], number>;
}) {
  const hasPendingJobs = statusCounts.pending > 0;
  const hasFailedJobs = statusCounts.failed > 0;
  const showManualControls = hasPendingJobs || hasFailedJobs;

  return (
    <div className="mt-4 grid gap-4">
      {renderJobs.length > 0 ? (
        <RenderJobStatusCounts statusCounts={statusCounts} />
      ) : null}

      {showManualControls ? (
        <div className="grid gap-3 rounded-md border border-zinc-200 bg-zinc-50 p-3">
          <div>
            <p className="text-sm font-medium text-zinc-900">
              Manual job controls
            </p>
            <p className="mt-1 text-sm text-zinc-500">
              Use these for jobs that already exist. They render or retry local
              videos only, without uploading to Drive or updating Metricool.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            {hasPendingJobs ? (
              <form
                action={renderPendingBatchJobsAction.bind(
                  null,
                  campaignId,
                  batchId,
                )}
              >
                <SubmitButton
                  pendingLabel="Rendering..."
                  savedLabel="Rendered"
                  className="inline-flex min-h-9 items-center justify-center rounded-md bg-zinc-900 px-4 text-sm font-medium text-white transition hover:bg-zinc-700 active:translate-y-px active:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-500 disabled:active:translate-y-0"
                >
                  Render generated jobs only
                </SubmitButton>
              </form>
            ) : null}
            {hasFailedJobs ? (
              <form
                action={retryFailedBatchJobsAction.bind(
                  null,
                  campaignId,
                  batchId,
                )}
              >
                <SubmitButton
                  pendingLabel="Retrying..."
                  savedLabel="Retried"
                  className="inline-flex min-h-9 items-center justify-center rounded-md border border-zinc-300 px-4 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 active:translate-y-px active:bg-zinc-200 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-400 disabled:active:translate-y-0"
                >
                  Retry failed renders
                </SubmitButton>
              </form>
            ) : null}
          </div>
        </div>
      ) : null}

      {renderJobs.length === 0 ? (
        <p className="text-sm text-zinc-500">No batch render jobs generated yet.</p>
      ) : (
        <div className="overflow-hidden rounded-md border border-zinc-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-3 py-2 font-semibold">Job</th>
                <th className="px-3 py-2 font-semibold">Status</th>
                <th className="px-3 py-2 font-semibold">Output</th>
                <th className="px-3 py-2 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 bg-white">
              {renderJobs.map((job) => (
                <tr key={job.id}>
                  <td className="px-3 py-3 font-mono text-xs text-zinc-700">
                    {job.id.slice(0, 8)}
                  </td>
                  <td className="px-3 py-3">
                    <span className="rounded-full border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-600">
                      {job.status}
                    </span>
                  </td>
                  <td className="max-w-xs break-words px-3 py-3 font-mono text-xs text-zinc-600">
                    {job.output_filepath ? (
                      <a
                        href={`file://${job.output_filepath}`}
                        className="font-medium text-rose-700 hover:text-rose-900"
                      >
                        Open output
                      </a>
                    ) : job.error ? (
                      "Failed"
                    ) : (
                      "Not rendered"
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <details className="group">
                      <summary className="cursor-pointer font-medium text-rose-700 hover:text-rose-900">
                        Details
                      </summary>
                      <dl className="mt-3 grid max-w-3xl gap-3 rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm">
                        <div>
                          <dt className="font-medium text-zinc-500">
                            Background
                          </dt>
                          <dd className="mt-1 text-zinc-900">
                            {job.background_filename}
                          </dd>
                        </div>
                        <div>
                          <dt className="font-medium text-zinc-500">
                            Screenshot
                          </dt>
                          <dd className="mt-1 text-zinc-900">
                            {job.screenshot_filename}
                          </dd>
                        </div>
                        <div>
                          <dt className="font-medium text-zinc-500">Hook</dt>
                          <dd className="mt-1 whitespace-pre-wrap text-zinc-900">
                            {job.hook_text}
                          </dd>
                        </div>
                        <div>
                          <dt className="font-medium text-zinc-500">Audio</dt>
                          <dd className="mt-1 text-zinc-900">
                            {job.audio_title ?? "No audio"}
                          </dd>
                        </div>
                        <div>
                          <dt className="font-medium text-zinc-500">
                            Thumbnail
                          </dt>
                          <dd className="mt-1 text-zinc-900">
                            {job.thumbnail_filename ?? "No thumbnail"}
                          </dd>
                        </div>
                        <div>
                          <dt className="font-medium text-zinc-500">Caption</dt>
                          <dd className="mt-1 whitespace-pre-wrap text-zinc-900">
                            {job.caption}
                          </dd>
                        </div>
                        <div>
                          <dt className="font-medium text-zinc-500">
                            Output or error
                          </dt>
                          <dd className="mt-1 break-all font-mono text-xs text-zinc-700">
                            {job.error ?? job.output_filepath ?? "Not rendered"}
                          </dd>
                        </div>
                      </dl>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SelectionPanel({
  title,
  emptyText,
  items,
  selectedIds,
  action,
}: {
  title: string;
  emptyText: string;
  items: SelectionItem[];
  selectedIds: Set<string>;
  action: (formData: FormData) => void | Promise<void>;
}) {
  const hasPreviews = items.some((item) => Boolean(item.preview));
  const useTwoColumnTextGrid = title === "Captions";

  if (items.length === 0) {
    return (
      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <span className="rounded-full border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-500">
            0 selected
          </span>
        </div>
        <p className="mt-3 text-sm leading-6 text-zinc-500">{emptyText}</p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold">{title}</h2>
        <span className="rounded-full border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-500">
          {selectedIds.size} selected
        </span>
      </div>
      <form action={action} className="mt-4 grid gap-4">
        {hasPreviews ? (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {items.map((item) => {
              const isSelected = selectedIds.has(item.id);

              return (
                <li key={item.id}>
                  <label
                    className={`block cursor-pointer overflow-hidden rounded-lg border bg-white shadow-sm transition hover:border-rose-200 hover:shadow ${
                      isSelected
                        ? "border-rose-300 ring-2 ring-rose-100"
                        : "border-zinc-200"
                    }`}
                  >
                    <div className="relative bg-zinc-100">
                      <input
                        type="checkbox"
                        name="assetIds"
                        value={item.id}
                        defaultChecked={isSelected}
                        className="absolute left-3 top-3 z-10 size-5 rounded border-zinc-300 bg-white text-rose-700 shadow-sm focus:ring-rose-700"
                      />
                      <div className="flex min-h-[220px] items-center justify-center p-3">
                        {item.preview}
                      </div>
                    </div>
                    <span className="block truncate border-t border-zinc-100 px-3 py-2 text-sm font-medium text-zinc-900">
                      {item.title}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        ) : (
          <div
            className={
              useTwoColumnTextGrid
                ? "rounded-md border border-zinc-200 p-3"
                : "overflow-hidden rounded-md border border-zinc-200"
            }
          >
            <ul
              className={
                useTwoColumnTextGrid
                  ? "grid gap-3 md:grid-cols-2"
                  : "divide-y divide-zinc-200"
              }
            >
              {items.map((item) => (
                <li
                  key={item.id}
                  className={
                    useTwoColumnTextGrid
                      ? "rounded-md border border-zinc-100 bg-zinc-50 p-3"
                      : "p-3"
                  }
                >
                  <label className="flex h-full items-start gap-3">
                    <input
                      type="checkbox"
                      name="assetIds"
                      value={item.id}
                      defaultChecked={selectedIds.has(item.id)}
                      className="mt-1 size-4 rounded border-zinc-300 text-rose-700 focus:ring-rose-700"
                    />
                    <span className="grid min-w-0 gap-1">
                      <span className="text-sm font-medium text-zinc-900">
                        {item.title}
                      </span>
                      {item.detail ? (
                        <span className="whitespace-pre-wrap text-xs leading-5 text-zinc-500">
                          {item.detail}
                        </span>
                      ) : null}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex justify-end">
          <SubmitButton>
            Save {title.toLowerCase()}
          </SubmitButton>
        </div>
      </form>
    </section>
  );
}

function HookSelectionPanel({
  bookId,
  campaignId,
  batchId,
  selectedScreenshotIds,
  selectedHookIds,
  screenshots,
  hooks,
}: {
  bookId: string;
  campaignId: string;
  batchId: string;
  selectedScreenshotIds: Set<string>;
  selectedHookIds: Set<string>;
  screenshots: BookScreenshot[];
  hooks: BookHook[];
}) {
  const selectedScreenshots = screenshots.filter((screenshot) =>
    selectedScreenshotIds.has(screenshot.id),
  );

  if (selectedScreenshots.length === 0) {
    return (
      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">Hooks</h2>
          <span className="rounded-full border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-500">
            {selectedHookIds.size} selected
          </span>
        </div>
        <p className="mt-3 text-sm leading-6 text-zinc-500">
          Select screenshots first, then choose hooks for those screenshots.
        </p>
      </section>
    );
  }

  const hooksByScreenshot = new Map<string, BookHook[]>();

  for (const hook of hooks) {
    const screenshotHooks = hooksByScreenshot.get(hook.screenshot_id) ?? [];
    screenshotHooks.push(hook);
    hooksByScreenshot.set(hook.screenshot_id, screenshotHooks);
  }

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold">Hooks</h2>
        <span className="rounded-full border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-500">
          {selectedHookIds.size} selected
        </span>
      </div>
      <form
        action={updateRenderBatchHookSelectionsAction.bind(
          null,
          campaignId,
          batchId,
        )}
        className="mt-4 grid gap-4"
      >
        <div className="grid gap-4">
          {selectedScreenshots.map((screenshot) => {
            const screenshotHooks = hooksByScreenshot.get(screenshot.id) ?? [];

            return (
              <article
                key={screenshot.id}
                className="grid gap-4 rounded-md border border-zinc-200 bg-zinc-50 p-4 lg:grid-cols-[minmax(220px,30%)_minmax(0,70%)]"
              >
                <div>
                  <Image
                    src={`/api/books/screenshots/${bookId}?screenshotId=${screenshot.id}`}
                    alt={screenshot.filename}
                    width={640}
                    height={900}
                    unoptimized
                    className="max-h-[520px] w-full rounded-md border border-zinc-200 bg-white object-contain"
                  />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-zinc-900">
                      Hooks for this screenshot
                    </h3>
                    <span className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-500">
                      {screenshotHooks.length} hooks
                    </span>
                  </div>
                  {screenshotHooks.length > 0 ? (
                    <ul className="mt-3 grid max-h-[340px] gap-2 overflow-auto pr-1">
                      {screenshotHooks.map((hook) => (
                        <li key={hook.id}>
                          <label className="flex items-start gap-3 rounded-md bg-white p-3">
                            <input
                              type="checkbox"
                              name="assetIds"
                              value={hook.id}
                              defaultChecked={selectedHookIds.has(hook.id)}
                              className="mt-1 size-4 rounded border-zinc-300 text-rose-700 focus:ring-rose-700"
                            />
                            <span className="text-sm leading-6 text-zinc-800">
                              {hook.text}
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-3 text-sm text-zinc-500">
                      No hooks saved for this screenshot yet.
                    </p>
                  )}
                </div>
              </article>
            );
          })}
        </div>
        <div className="flex justify-end">
          <SubmitButton>
            Save hooks
          </SubmitButton>
        </div>
      </form>
    </section>
  );
}

function screenshotItems(bookId: string, screenshots: BookScreenshot[]) {
  return screenshots.map((screenshot) => ({
    id: screenshot.id,
    title: screenshot.filename,
    preview: (
      <Image
        src={`/api/books/screenshots/${bookId}?screenshotId=${screenshot.id}`}
        alt={screenshot.filename}
        width={320}
        height={420}
        unoptimized
        className="max-h-[260px] w-full rounded-md bg-white object-contain"
      />
    ),
  }));
}

function backgroundItems(campaignId: string, backgrounds: BookBackground[]) {
  return backgrounds.map((background) => ({
    id: background.id,
    title: background.filename,
    preview: (
      <video
        controls
        preload="metadata"
        className="aspect-[9/16] max-h-[260px] w-full rounded-md bg-zinc-950 object-contain"
        src={`/api/books/backgrounds/${campaignId}?backgroundId=${background.id}`}
      />
    ),
  }));
}

function captionItems(captions: BookCaption[]) {
  return captions.map((caption) => ({
    id: caption.id,
    title:
      caption.text.length > 100
        ? `${caption.text.slice(0, 97).trim()}...`
        : caption.text,
    detail: caption.text,
  }));
}

function hashtagItems(hashtags: BookHashtag[]) {
  return hashtags.map((hashtag) => ({
    id: hashtag.id,
    title: hashtag.hashtag,
    detail: hashtag.original_text
      ? `Original: ${hashtag.original_text}`
      : undefined,
  }));
}

function thumbnailItems(bookId: string, thumbnails: BookThumbnail[]) {
  return thumbnails.map((thumbnail) => ({
    id: thumbnail.id,
    title: thumbnail.filename,
    preview: (
      <Image
        src={`/api/books/thumbnails/${bookId}?thumbnailId=${thumbnail.id}`}
        alt={thumbnail.filename}
        width={320}
        height={180}
        unoptimized
        className="max-h-[220px] w-full rounded-md bg-white object-contain"
      />
    ),
  }));
}

export default async function RenderBatchPage({
  params,
  searchParams,
}: RenderBatchPageProps) {
  const { campaignId, batchId } = await params;
  const query = await searchParams;
  const campaign = getCampaign(campaignId);
  const batch = getRenderBatch(batchId);

  if (!campaign?.book_id || !batch || batch.campaign_id !== campaign.id) {
    notFound();
  }

  const book = getBook(campaign.book_id);

  if (!book) {
    notFound();
  }

  const layout = batch.layout_id
    ? getLayout(batch.layout_id)
    : campaign.layout_id
      ? getLayout(campaign.layout_id)
      : null;
  const screenshots = listBookScreenshots(book.id);
  const hooks = listBookHooks(book.id);
  const captions = listBookCaptions(book.id);
  const hashtags = listBookHashtags(book.id);
  const thumbnails = listBookThumbnails(book.id);
  const backgrounds = listBookBackgrounds(book.id);
  const globalAudioAssets = listAllAudioAssets().filter(
    (audio) => !audio.campaign_id,
  );
  const selectedScreenshotIds = new Set(
    listRenderBatchScreenshotSelections(batch.id).map(
      (selection) => selection.screenshot_id,
    ),
  );
  const selectedHookIds = new Set(
    listRenderBatchHookSelections(batch.id).map((selection) => selection.hook_id),
  );
  const selectedBackgroundIds = new Set(
    listRenderBatchBackgroundSelections(batch.id).map(
      (selection) => selection.background_id,
    ),
  );
  const selectedAudioSelections = listRenderBatchAudioSelections(batch.id);
  const selectedAudioIds = new Set(
    selectedAudioSelections.map((selection) => selection.audio_id),
  );
  const selectedAudioDurationOverrides = Object.fromEntries(
    selectedAudioSelections.map((selection) => [
      selection.audio_id,
      selection.render_duration_seconds,
    ]),
  );
  const selectedCaptionIds = new Set(
    listRenderBatchCaptionSelections(batch.id).map(
      (selection) => selection.caption_id,
    ),
  );
  const selectedHashtagIds = new Set(
    listRenderBatchHashtagSelections(batch.id).map(
      (selection) => selection.hashtag_id,
    ),
  );
  const selectedThumbnailIds = new Set(
    listRenderBatchThumbnailSelections(batch.id).map(
      (selection) => selection.thumbnail_id,
    ),
  );
  const matrixStats = getRenderBatchMatrixStats(batch.id);
  const renderJobs = listRenderJobsByBatch(batch.id);
  const renderJobStatusCounts = {
    pending: 0,
    running: 0,
    done: 0,
    failed: 0,
  };

  for (const job of renderJobs) {
    renderJobStatusCounts[job.status] += 1;
  }
  const hasGeneratedJobsNeedingAttention =
    renderJobStatusCounts.pending > 0 || renderJobStatusCounts.failed > 0;

  return (
    <PageShell>
      <PageHeader
        title={batch.name}
        eyebrow="Render batch"
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/campaigns/${campaign.id}/batches/new`}
              className="inline-flex rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
            >
              New batch
            </Link>
            <Link
              href={`/campaigns/${campaign.id}`}
              className="inline-flex rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
            >
              Back to campaign
            </Link>
          </div>
        }
      >
        <p>
          This batch is one production run inside {campaign.name}. Asset
          selection and job generation come next.
        </p>
      </PageHeader>

      <BatchStickyStats
        screenshotCount={matrixStats.screenshotCount}
        hookCount={matrixStats.hookCount}
        backgroundCount={matrixStats.backgroundCount}
        audioCount={matrixStats.audioCount}
        captionCount={matrixStats.captionCount}
        hashtagCount={matrixStats.hashtagCount}
        thumbnailCount={matrixStats.thumbnailCount}
        previewCount={matrixStats.previewCount}
      />

      <div className="grid gap-6">
          <section className="rounded-lg border border-zinc-200 bg-white p-5">
            <h2 className="text-lg font-semibold">Batch Details</h2>
            <dl className="mt-4 grid gap-4 text-sm md:grid-cols-2">
              <div>
                <dt className="font-medium text-zinc-500">Status</dt>
                <dd className="mt-1 text-zinc-900">{batch.status}</dd>
              </div>
              <div>
                <dt className="font-medium text-zinc-500">Campaign</dt>
                <dd className="mt-1">
                  <Link
                    href={`/campaigns/${campaign.id}`}
                    className="font-medium text-rose-700 hover:text-rose-900"
                  >
                    {campaign.name}
                  </Link>
                </dd>
              </div>
              <div>
                <dt className="font-medium text-zinc-500">Book</dt>
                <dd className="mt-1">
                  <Link
                    href={`/books/${book.id}`}
                    className="font-medium text-rose-700 hover:text-rose-900"
                  >
                    {book.title}
                  </Link>
                </dd>
              </div>
              <div>
                <dt className="font-medium text-zinc-500">Layout</dt>
                <dd className="mt-1 text-zinc-900">
                  {layout?.name ??
                    batch.layout_id ??
                    campaign.layout_id ??
                    "Not set"}
                </dd>
              </div>
            </dl>
          </section>

        <section>
          <h2 className="text-lg font-semibold">Render Matrix Preview</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-3 xl:grid-cols-8">
            <SummaryCard
              label="Selected screenshots"
              value={matrixStats.screenshotCount}
            />
            <SummaryCard
              label="Selected hooks"
              value={matrixStats.hookCount}
            />
            <SummaryCard
              label="Selected backgrounds"
              value={matrixStats.backgroundCount}
            />
          <SummaryCard
            label="Selected audio"
            value={matrixStats.audioCount}
          />
          <SummaryCard
            label="Selected captions"
            value={matrixStats.captionCount}
          />
          <SummaryCard
            label="Selected hashtags"
            value={matrixStats.hashtagCount}
          />
          <SummaryCard
            label="Selected thumbnails"
            value={matrixStats.thumbnailCount}
          />
          <SummaryCard
            label="Preview renders"
            value={matrixStats.previewCount}
          />
          </div>
          <BatchSizeWarning previewCount={matrixStats.previewCount} />
        </section>

        <div className="grid gap-4">
          <SelectionPanel
            title="Screenshots"
            emptyText="No screenshots are available for the linked book yet."
            items={screenshotItems(book.id, screenshots)}
            selectedIds={selectedScreenshotIds}
            action={updateRenderBatchScreenshotSelectionsAction.bind(
              null,
              campaign.id,
              batch.id,
            )}
          />

          <HookSelectionPanel
            bookId={book.id}
            campaignId={campaign.id}
            batchId={batch.id}
            selectedScreenshotIds={selectedScreenshotIds}
            selectedHookIds={selectedHookIds}
            screenshots={screenshots}
            hooks={hooks}
          />

          <SelectionPanel
            title="Backgrounds"
            emptyText="No background videos are available for the linked book yet."
            items={backgroundItems(book.id, backgrounds)}
            selectedIds={selectedBackgroundIds}
            action={updateRenderBatchBackgroundSelectionsAction.bind(
              null,
              campaign.id,
              batch.id,
            )}
          />

          <SelectionPanel
            title="Thumbnails"
            emptyText="No thumbnails are available for the linked book yet."
            items={thumbnailItems(book.id, thumbnails)}
            selectedIds={selectedThumbnailIds}
            action={updateRenderBatchThumbnailSelectionsAction.bind(
              null,
              campaign.id,
              batch.id,
            )}
          />

          <BatchAudioSelectionPanel
            audioAssets={globalAudioAssets}
            selectedIds={Array.from(selectedAudioIds)}
            durationOverrides={selectedAudioDurationOverrides}
            action={updateRenderBatchAudioSelectionsAction.bind(
              null,
              campaign.id,
              batch.id,
            )}
          />

          <SelectionPanel
            title="Captions"
            emptyText="No reusable captions are available for the linked book yet."
            items={captionItems(captions)}
            selectedIds={selectedCaptionIds}
            action={updateRenderBatchCaptionSelectionsAction.bind(
              null,
              campaign.id,
              batch.id,
            )}
          />

          <SelectionPanel
            title="Hashtags"
            emptyText="No reusable hashtags are available for the linked book yet."
            items={hashtagItems(hashtags)}
            selectedIds={selectedHashtagIds}
            action={updateRenderBatchHashtagSelectionsAction.bind(
              null,
              campaign.id,
              batch.id,
            )}
          />
        </div>

        <section className="rounded-lg border border-zinc-200 bg-white p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">Render Jobs</h2>
              <p className="mt-1 text-sm text-zinc-500">
                Create pending jobs from the current batch selections.
              </p>
            </div>
            <span className="rounded-full border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-500">
              {renderJobs.length}
            </span>
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <form
              action={generateRenderBatchJobsAction.bind(
                null,
                campaign.id,
                batch.id,
              )}
              className="grid gap-3 rounded-md border border-zinc-200 bg-zinc-50 p-3"
            >
              <div>
                <h3 className="text-sm font-semibold text-zinc-950">
                  Generate jobs only
                </h3>
                <p className="mt-1 text-sm leading-6 text-zinc-600">
                  Create any missing render jobs from the current selections,
                  then stop.
                </p>
              </div>
              {matrixStats.previewCount > 1000 ? (
                <label className="flex items-start gap-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                  <input
                    type="checkbox"
                    name="allowLargeBatch"
                    value="yes"
                    className="mt-1 size-4 rounded border-rose-300 text-rose-700 focus:ring-rose-700"
                  />
                  <span>
                    Override the 1000-job guardrail and generate this large
                    batch.
                  </span>
                </label>
              ) : null}
              <ConfirmSubmitButton
                disabled={matrixStats.previewCount === 0}
                pendingLabel="Generating..."
                savedLabel="Generated"
                confirmWhenCheckedName="allowLargeBatch"
                confirmMessage={`This will generate ${matrixStats.previewCount} render jobs. Are you absolutely sure you want to continue?`}
              >
                Generate batch jobs
              </ConfirmSubmitButton>
            </form>
            {!hasGeneratedJobsNeedingAttention ? (
              <form
                action={runBatchEndToEndAction.bind(null, campaign.id, batch.id)}
                className="grid gap-3 rounded-md border border-zinc-200 bg-zinc-50 p-3"
              >
                <div>
                  <h3 className="text-sm font-semibold text-zinc-950">
                    Run batch end-to-end
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-zinc-600">
                    Generate missing jobs, render pending jobs, upload completed
                    videos, then update the campaign Metricool Sheet.
                  </p>
                </div>
              <SubmitButton
                disabled={matrixStats.previewCount === 0}
                pendingLabel="Running..."
                savedLabel="Run complete"
                className="inline-flex min-h-10 items-center justify-center rounded-md bg-rose-700 px-4 text-sm font-medium text-white transition hover:bg-rose-800 active:translate-y-px active:bg-rose-900 disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-500 disabled:active:translate-y-0"
              >
                Run batch end-to-end
              </SubmitButton>
              </form>
            ) : (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900">
                <h3 className="font-semibold">Generated jobs need attention</h3>
                <p className="mt-1">
                  This batch already has pending or failed jobs, so the
                  end-to-end button is hidden. Use the manual controls below to
                  render or retry them first.
                </p>
              </div>
            )}
          </div>
          <BatchActionSummary query={query} />
          <BatchRenderJobsList
            campaignId={campaign.id}
            batchId={batch.id}
            renderJobs={renderJobs}
            statusCounts={renderJobStatusCounts}
          />
        </section>
      </div>
    </PageShell>
  );
}
