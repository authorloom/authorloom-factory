import path from "node:path";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BookAssetUploadPanel } from "@/components/book-asset-upload-panel";
import {
  BookBlurbEditor,
  BookHeaderEditor,
} from "@/components/book-details-editor";
import { PageShell } from "@/components/page-shell";
import { SubmitButton } from "@/components/submit-button";
import {
  getAuthor,
  getBook,
  getSeries,
  listBookBackgrounds,
  listBookCaptions,
  listBookHashtags,
  listBookHooks,
  listBookScreenshots,
  listBookThumbnails,
  listBookTropes,
  listCampaigns,
  listRenderBatchesByCampaign,
  listRenderJobs,
  listSeriesByAuthor,
  type Campaign,
} from "@/lib/db";
import { inspectBookDriveFolder } from "@/lib/google";

import {
  importBookCoverFromDriveAction,
  importBookManuscriptFromDriveAction,
  syncBookDriveFolderFromBookPageAction,
  updateBookDescriptionAction,
  updateBookSeriesAction,
  updateBookTitleAction,
  updateBookTropesAction,
} from "./actions";

export const dynamic = "force-dynamic";

type BookPageProps = {
  params: Promise<{
    bookId: string;
  }>;
  searchParams: Promise<{
    driveSync?: string;
    message?: string;
    coverImport?: string;
    coverStatus?: string;
    coverError?: string | string[];
    manuscriptImport?: string;
    manuscriptStatus?: string;
    manuscriptError?: string | string[];
  }>;
};

type CampaignSnapshot = {
  campaign: Campaign;
  batchCount: number;
  jobCount: number;
  completedCount: number;
  uploadedCount: number;
  failedCount: number;
};

function formatDate(value: string | number) {
  const date = typeof value === "number" ? new Date(value * 1000) : new Date(value);

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
  }).format(date);
}

function SummaryCard({
  label,
  value,
  href,
}: {
  label: string;
  value: number;
  href?: string;
}) {
  const content = (
    <>
      <p className="text-2xl font-semibold text-zinc-950">{value}</p>
      <p className="mt-1 text-xs font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </p>
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm transition hover:border-rose-200 hover:shadow"
      >
        {content}
      </Link>
    );
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
      {content}
    </div>
  );
}

function queryErrors(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value;
  }

  return value ? [value] : [];
}

function CampaignSnapshotCard({ snapshot }: { snapshot: CampaignSnapshot }) {
  const notUploadedCount = snapshot.completedCount - snapshot.uploadedCount;

  return (
    <Link
      href={`/campaigns/${snapshot.campaign.id}`}
      className="block rounded-lg border border-zinc-200 bg-white p-4 shadow-sm transition hover:border-rose-200 hover:shadow-md"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="font-semibold text-zinc-950">
            {snapshot.campaign.name}
          </h3>
          {snapshot.campaign.goal ? (
            <p className="mt-1 text-sm leading-6 text-zinc-600">
              {snapshot.campaign.goal}
            </p>
          ) : null}
          <p className="mt-2 text-xs text-zinc-500">
            Created {formatDate(snapshot.campaign.created_at)}
          </p>
        </div>
        <span
          className={`w-fit rounded-full border px-2.5 py-1 text-xs font-medium ${
            snapshot.campaign.metricool_sheet_id
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-zinc-200 bg-zinc-50 text-zinc-500"
          }`}
        >
          {snapshot.campaign.metricool_sheet_id ? "Metricool ready" : "No Sheet"}
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-2 text-sm md:grid-cols-5">
        <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2">
          <dt className="text-xs font-medium uppercase text-zinc-500">
            Batches
          </dt>
          <dd className="mt-1 font-semibold text-zinc-950">
            {snapshot.batchCount}
          </dd>
        </div>
        <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2">
          <dt className="text-xs font-medium uppercase text-zinc-500">Jobs</dt>
          <dd className="mt-1 font-semibold text-zinc-950">
            {snapshot.jobCount}
          </dd>
        </div>
        <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2">
          <dt className="text-xs font-medium uppercase text-zinc-500">
            Done
          </dt>
          <dd className="mt-1 font-semibold text-zinc-950">
            {snapshot.completedCount}
          </dd>
        </div>
        <div
          className={`rounded-md border px-3 py-2 ${
            notUploadedCount > 0
              ? "border-amber-200 bg-amber-50"
              : "border-zinc-200 bg-zinc-50"
          }`}
        >
          <dt
            className={`text-xs font-medium uppercase ${
              notUploadedCount > 0 ? "text-amber-700" : "text-zinc-500"
            }`}
          >
            Upload
          </dt>
          <dd
            className={`mt-1 font-semibold ${
              notUploadedCount > 0 ? "text-amber-900" : "text-zinc-950"
            }`}
          >
            {notUploadedCount}
          </dd>
        </div>
        <div
          className={`rounded-md border px-3 py-2 ${
            snapshot.failedCount > 0
              ? "border-rose-200 bg-rose-50"
              : "border-zinc-200 bg-zinc-50"
          }`}
        >
          <dt
            className={`text-xs font-medium uppercase ${
              snapshot.failedCount > 0 ? "text-rose-700" : "text-zinc-500"
            }`}
          >
            Failed
          </dt>
          <dd
            className={`mt-1 font-semibold ${
              snapshot.failedCount > 0 ? "text-rose-900" : "text-zinc-950"
            }`}
          >
            {snapshot.failedCount}
          </dd>
        </div>
      </dl>
    </Link>
  );
}

export default async function BookPage({ params, searchParams }: BookPageProps) {
  const { bookId } = await params;
  const query = await searchParams;
  const { driveSync, message } = query;
  const book = getBook(bookId);

  if (!book) {
    notFound();
  }

  const author = getAuthor(book.author_id);
  const series = book.series_id ? getSeries(book.series_id) : null;
  const authorSeries = author ? listSeriesByAuthor(author.id) : [];
  const tropes = listBookTropes(book.id);
  const screenshots = listBookScreenshots(book.id);
  const backgrounds = listBookBackgrounds(book.id);
  const thumbnails = listBookThumbnails(book.id);
  const hooks = listBookHooks(book.id);
  const captions = listBookCaptions(book.id);
  const hashtags = listBookHashtags(book.id);
  const campaigns = listCampaigns().filter(
    (campaign) => campaign.book_id === book.id,
  );
  const campaignSnapshots = campaigns.map((campaign) => {
    const batches = listRenderBatchesByCampaign(campaign.id);
    const jobs = listRenderJobs(campaign.id);
    const completedJobs = jobs.filter((job) => job.status === "done");

    return {
      campaign,
      batchCount: batches.length,
      jobCount: jobs.length,
      completedCount: completedJobs.length,
      uploadedCount: completedJobs.filter(
        (job) => job.drive_file_id || job.drive_url,
      ).length,
      failedCount: jobs.filter((job) => job.status === "failed").length,
    };
  });
  const totalVideos = campaignSnapshots.reduce(
    (sum, snapshot) => sum + snapshot.completedCount,
    0,
  );
  const manuscriptFilename = book.manuscript_filepath
    ? path.basename(book.manuscript_filepath)
    : null;
  const driveInspection =
    book.drive_folder_url || book.drive_folder_id
      ? await inspectBookDriveFolder(book.id)
          .then((result) => ({ result, error: null }))
          .catch((error) => ({
            result: null,
            error:
              error instanceof Error
                ? error.message
                : "Could not inspect the Google Drive folder.",
          }))
      : null;
  const missingDriveFolders =
    driveInspection?.result?.folders.filter((folder) => !folder.found).length ??
    0;
  const driveConnected = Boolean(driveInspection?.result);
  const coverErrors = queryErrors(query.coverError);
  const manuscriptErrors = queryErrors(query.manuscriptError);

  return (
    <PageShell>
      <div className="mb-6 flex flex-col gap-5 border-b border-zinc-200 pb-6 lg:flex-row lg:items-start lg:justify-between">
        <BookHeaderEditor
          title={book.title}
          description={book.description}
          author={author ? { id: author.id, name: author.name } : null}
          seriesId={book.series_id}
          seriesName={series?.name ?? null}
          seriesOptions={authorSeries.map((seriesRecord) => ({
            id: seriesRecord.id,
            name: seriesRecord.name,
          }))}
          tropes={tropes.map((trope) => ({
            id: trope.id,
            trope: trope.trope,
          }))}
          updateTitleAction={updateBookTitleAction.bind(null, book.id)}
          updateSeriesAction={updateBookSeriesAction.bind(null, book.id)}
          updateTropesAction={updateBookTropesAction.bind(null, book.id)}
          updateDescriptionAction={updateBookDescriptionAction.bind(
            null,
            book.id,
          )}
        />
        <div className="shrink-0">
          <div className="flex flex-wrap gap-2">
            <Link
              href="/books"
              className="inline-flex rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
            >
              Back to books
            </Link>
            <Link
              href={`/campaigns/new?bookId=${book.id}`}
              className="inline-flex rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
            >
              Create campaign
            </Link>
          </div>
        </div>
      </div>

      <div className="grid gap-6">
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
          <SummaryCard
            label="Screenshots"
            value={screenshots.length}
            href={`/books/${book.id}/screenshots`}
          />
          <SummaryCard
            label="Hooks"
            value={hooks.length}
            href={`/books/${book.id}/screenshots`}
          />
          <SummaryCard
            label="Backgrounds"
            value={backgrounds.length}
            href={`/books/${book.id}/backgrounds`}
          />
          <SummaryCard
            label="Thumbnails"
            value={thumbnails.length}
            href={`/books/${book.id}/thumbnails`}
          />
          <SummaryCard
            label="Captions"
            value={captions.length}
            href={`/books/${book.id}/captions`}
          />
          <SummaryCard
            label="Hashtags"
            value={hashtags.length}
            href={`/books/${book.id}/hashtags`}
          />
          <SummaryCard label="Campaigns" value={campaigns.length} />
          <SummaryCard label="Videos" value={totalVideos} />
        </section>

        <section className="grid gap-6 xl:grid-cols-[260px_1fr]">
          <div className="grid gap-4">
            {book.cover_filepath ? (
              <div className="rounded-lg border border-zinc-200 bg-white p-3 shadow-sm">
                <Image
                  src={`/api/books/covers/${book.id}`}
                  alt={`${book.title} cover`}
                  width={520}
                  height={780}
                  unoptimized
                  className="aspect-[2/3] w-full rounded-md bg-white object-cover"
                />
                <p className="mt-3 text-xs text-zinc-500">
                  Replace cover by uploading locally or pulling from Drive.
                </p>
              </div>
            ) : (
              <div className="flex aspect-[2/3] w-full items-center justify-center rounded-lg border border-dashed border-zinc-300 bg-white text-sm text-zinc-500">
                No cover yet
              </div>
            )}

            <div className="rounded-lg border border-zinc-200 bg-white p-4 text-sm shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-zinc-950">Cover</p>
                  <p className="mt-1 text-xs leading-5 text-zinc-500">
                    Upload locally or pull the first supported image from
                    source-assets/cover.
                  </p>
                </div>
                <form action={importBookCoverFromDriveAction.bind(null, book.id)}>
                  <SubmitButton
                    pendingLabel="Pulling..."
                    savedLabel="Pulled"
                    disabled={!book.drive_folder_url && !book.drive_folder_id}
                    className="inline-flex min-h-9 items-center justify-center rounded-md border border-zinc-300 px-3 text-sm font-medium text-zinc-800 transition hover:bg-zinc-100 active:translate-y-px active:bg-zinc-200 disabled:cursor-not-allowed disabled:border-zinc-200 disabled:bg-zinc-100 disabled:text-zinc-400 disabled:active:translate-y-0"
                  >
                    {book.cover_filepath ? "Pull new" : "Pull"}
                  </SubmitButton>
                </form>
              </div>
              <BookAssetUploadPanel
                bookId={book.id}
                assetType="covers"
                label={book.cover_filepath ? "Replace cover" : "Upload cover"}
                accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
                helpText="png, jpg, jpeg, webp. Max 25MB."
              />
              {query.coverImport ? (
                <div
                  className={`mt-3 rounded-md border px-3 py-2 text-xs ${
                    query.coverImport === "success"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border-amber-200 bg-amber-50 text-amber-800"
                  }`}
                >
                  <p>{query.coverStatus ?? "Cover import complete."}</p>
                  {coverErrors.map((error) => (
                    <p key={error} className="mt-1">
                      {error}
                    </p>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="rounded-lg border border-zinc-200 bg-white p-4 text-sm shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-zinc-950">Manuscript</p>
                  <p className="mt-1 text-xs leading-5 text-zinc-500">
                    Store the local copy for context and future extraction.
                  </p>
                </div>
                <form
                  action={importBookManuscriptFromDriveAction.bind(
                    null,
                    book.id,
                  )}
                >
                  <SubmitButton
                    pendingLabel="Pulling..."
                    savedLabel="Pulled"
                    disabled={!book.drive_folder_url && !book.drive_folder_id}
                    className="inline-flex min-h-9 items-center justify-center rounded-md border border-zinc-300 px-3 text-sm font-medium text-zinc-800 transition hover:bg-zinc-100 active:translate-y-px active:bg-zinc-200 disabled:cursor-not-allowed disabled:border-zinc-200 disabled:bg-zinc-100 disabled:text-zinc-400 disabled:active:translate-y-0"
                  >
                    {book.manuscript_filepath ? "Pull new" : "Pull"}
                  </SubmitButton>
                </form>
              </div>
              {manuscriptFilename ? (
                <a
                  href={`/api/books/manuscripts/${book.id}`}
                  className="mt-3 block break-all text-sm font-medium text-rose-700 underline"
                >
                  {manuscriptFilename}
                </a>
              ) : (
                <p className="mt-3 text-sm text-zinc-500">
                  No manuscript stored yet.
                </p>
              )}
              <BookAssetUploadPanel
                bookId={book.id}
                assetType="manuscripts"
                label={
                  book.manuscript_filepath
                    ? "Replace manuscript"
                    : "Upload manuscript"
                }
                accept=".pdf,.doc,.docx,.txt,application/pdf,text/plain,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                helpText="pdf, doc, docx, txt. Max 100MB."
              />
              {query.manuscriptImport ? (
                <div
                  className={`mt-3 rounded-md border px-3 py-2 text-xs ${
                    query.manuscriptImport === "success"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border-amber-200 bg-amber-50 text-amber-800"
                  }`}
                >
                  <p>{query.manuscriptStatus ?? "Manuscript import complete."}</p>
                  {manuscriptErrors.map((error) => (
                    <p key={error} className="mt-1">
                      {error}
                    </p>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="rounded-lg border border-zinc-200 bg-white p-4 text-sm shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold text-zinc-950">Drive</p>
                <span
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                    driveConnected && missingDriveFolders === 0
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : driveConnected
                        ? "border-amber-200 bg-amber-50 text-amber-700"
                        : "border-zinc-200 bg-zinc-50 text-zinc-500"
                  }`}
                >
                  {driveConnected
                    ? missingDriveFolders === 0
                      ? "Ready"
                      : `${missingDriveFolders} missing`
                    : "Not synced"}
                </span>
              </div>
              {book.drive_folder_url ? (
                <a
                  href={book.drive_folder_url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 block break-all text-xs text-rose-700 underline"
                >
                  Open book folder
                </a>
              ) : null}
              <form
                action={syncBookDriveFolderFromBookPageAction.bind(
                  null,
                  book.id,
                )}
                className="mt-3 grid gap-2"
              >
                <label className="grid gap-1">
                  <span className="text-xs font-medium text-zinc-500">
                    Book Drive folder URL
                  </span>
                  <input
                    name="driveFolderUrl"
                    defaultValue={book.drive_folder_url ?? ""}
                    placeholder="https://drive.google.com/drive/folders/..."
                    className="min-h-9 rounded-md border border-zinc-300 bg-white px-3 text-xs text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-rose-500 focus:ring-2 focus:ring-rose-100"
                  />
                </label>
                <SubmitButton
                  pendingLabel="Syncing..."
                  savedLabel="Synced"
                  className="inline-flex min-h-9 items-center justify-center rounded-md border border-zinc-300 px-3 text-sm font-medium text-zinc-800 transition hover:bg-zinc-100 active:translate-y-px active:bg-zinc-200 disabled:cursor-not-allowed disabled:border-zinc-200 disabled:bg-zinc-100 disabled:text-zinc-400 disabled:active:translate-y-0"
                >
                  Save and refresh Drive status
                </SubmitButton>
              </form>
            </div>
          </div>

          <div className="grid gap-4">
            <BookBlurbEditor
              title={book.title}
              description={book.description}
              author={author ? { id: author.id, name: author.name } : null}
              seriesId={book.series_id}
              seriesName={series?.name ?? null}
              seriesOptions={authorSeries.map((seriesRecord) => ({
                id: seriesRecord.id,
                name: seriesRecord.name,
              }))}
              tropes={tropes.map((trope) => ({
                id: trope.id,
                trope: trope.trope,
              }))}
              updateTitleAction={updateBookTitleAction.bind(null, book.id)}
              updateSeriesAction={updateBookSeriesAction.bind(null, book.id)}
              updateTropesAction={updateBookTropesAction.bind(null, book.id)}
              updateDescriptionAction={updateBookDescriptionAction.bind(
                null,
                book.id,
              )}
            />

            <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-zinc-950">
                    Campaign output
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-zinc-600">
                    Production activity for campaigns linked to this book.
                  </p>
                </div>
                <Link
                  href={`/campaigns/new?bookId=${book.id}`}
                  className="inline-flex w-fit rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
                >
                  Create campaign
                </Link>
              </div>

              {campaignSnapshots.length > 0 ? (
                <div className="mt-4 grid gap-3">
                  {campaignSnapshots.map((snapshot) => (
                    <CampaignSnapshotCard
                      key={snapshot.campaign.id}
                      snapshot={snapshot}
                    />
                  ))}
                </div>
              ) : (
                <div className="mt-4 rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-6">
                  <h3 className="font-semibold text-zinc-950">
                    No campaigns yet
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-zinc-600">
                    Once this book has screenshots, hooks, backgrounds, and
                    audio ready, create a campaign and batch from here.
                  </p>
                </div>
              )}
            </section>
          </div>
        </section>

        <section className="grid gap-4">
          <details className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
            <summary className="cursor-pointer text-lg font-semibold text-zinc-950">
              Drive folder details
            </summary>
            {message ? (
              <p
                className={`mt-4 rounded-md border px-3 py-2 text-sm ${
                  driveSync === "success"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-rose-200 bg-rose-50 text-rose-800"
                }`}
              >
                {message}
              </p>
            ) : null}

            {!book.drive_folder_url && !book.drive_folder_id ? (
              <p className="mt-4 text-sm text-zinc-500">
                No book Drive folder is connected.
              </p>
            ) : driveInspection?.error ? (
              <p className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                {driveInspection.error}
              </p>
            ) : driveInspection?.result ? (
              <div className="mt-4 grid gap-3 text-sm">
                <div>
                  <p className="font-medium text-zinc-500">Folder</p>
                  <p className="mt-1 break-all text-zinc-900">
                    {driveInspection.result.folderName ??
                      driveInspection.result.folderId}
                  </p>
                </div>
                {driveInspection.result.folders.map((folder) => (
                  <div
                    key={folder.key}
                    className="flex items-center justify-between gap-3 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2"
                  >
                    <div>
                      <p className="font-medium text-zinc-900">
                        {folder.expectedName}/
                      </p>
                      <p className="break-all text-xs text-zinc-500">
                        {folder.folderId ?? "Missing"}
                      </p>
                    </div>
                    <span
                      className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                        folder.found
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-amber-200 bg-amber-50 text-amber-700"
                      }`}
                    >
                      {folder.found ? "Found" : "Missing"}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
          </details>
        </section>
      </div>
    </PageShell>
  );
}
