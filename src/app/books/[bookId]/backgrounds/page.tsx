import Link from "next/link";
import { notFound } from "next/navigation";

import { BookAssetUploadPanel } from "@/components/book-asset-upload-panel";
import { PageHeader, PageShell } from "@/components/page-shell";
import { SubmitButton } from "@/components/submit-button";
import { getBook, listBookBackgrounds } from "@/lib/db";

import { importBookBackgroundsFromDriveAction } from "../actions";

export const dynamic = "force-dynamic";

type BackgroundsPageProps = {
  params: Promise<{
    bookId: string;
  }>;
  searchParams: Promise<{
    driveImport?: string;
    downloaded?: string;
    duplicates?: string;
    unsupported?: string;
    error?: string | string[];
  }>;
};

function formatDate(value: number) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value * 1000));
}

export default async function BackgroundsPage({
  params,
  searchParams,
}: BackgroundsPageProps) {
  const { bookId } = await params;
  const importResult = await searchParams;
  const book = getBook(bookId);

  if (!book) {
    notFound();
  }

  const backgrounds = listBookBackgrounds(book.id);
  const importErrors = Array.isArray(importResult.error)
    ? importResult.error
    : importResult.error
      ? [importResult.error]
      : [];
  const hasDriveImportSummary = Boolean(importResult.driveImport);

  return (
    <PageShell>
      <PageHeader
        title="Background Videos"
        eyebrow={book.title}
        action={
          <Link
            href={`/books/${book.id}`}
            className="inline-flex rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
          >
            Back to book
          </Link>
        }
      >
        <p>Upload and preview reusable background videos for this book.</p>
      </PageHeader>

      <section className="border-b border-zinc-200 pb-8">
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <h2 className="text-lg font-semibold">Upload background video</h2>
            <BookAssetUploadPanel
              bookId={book.id}
              assetType="backgrounds"
              label="Background video file"
              accept=".mp4,.mov,.m4v,video/mp4,video/quicktime"
              helpText="Supported: mp4, mov, m4v. Max 500MB."
            />
          </div>

          <section className="rounded-lg border border-zinc-200 bg-white p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold">
                  Import from Google Drive
                </h2>
                <p className="mt-1 text-sm leading-6 text-zinc-600">
                  Pull supported videos from source-assets/backgrounds in the
                  connected book Drive folder.
                </p>
              </div>
              <form
                action={importBookBackgroundsFromDriveAction.bind(
                  null,
                  book.id,
                )}
              >
                <SubmitButton
                  pendingLabel="Importing..."
                  savedLabel="Imported"
                  disabled={!book.drive_folder_url && !book.drive_folder_id}
                >
                  Import backgrounds from Drive
                </SubmitButton>
              </form>
            </div>

            <dl className="mt-4 grid gap-2 text-sm">
              <div>
                <dt className="font-medium text-zinc-500">Drive folder</dt>
                <dd className="mt-1 break-all text-zinc-800">
                  {book.drive_folder_id ??
                    book.drive_folder_url ??
                    "Not connected"}
                </dd>
              </div>
            </dl>

            {hasDriveImportSummary ? (
              <div
                className={`mt-4 rounded-md border px-3 py-2 text-sm ${
                  importResult.driveImport === "success"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-amber-200 bg-amber-50 text-amber-800"
                }`}
              >
                <p className="font-medium">Drive import summary</p>
                <ul className="mt-2 grid gap-1">
                  <li>Downloaded: {importResult.downloaded ?? "0"}</li>
                  <li>
                    Skipped duplicates: {importResult.duplicates ?? "0"}
                  </li>
                  <li>
                    Skipped unsupported: {importResult.unsupported ?? "0"}
                  </li>
                </ul>
                {importErrors.length > 0 ? (
                  <div className="mt-3">
                    <p className="font-medium">Errors</p>
                    <ul className="mt-1 grid gap-1">
                      {importErrors.map((error) => (
                        <li key={error}>{error}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>
        </div>
      </section>

      <section className="pt-8">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">Uploaded backgrounds</h2>
          <span className="rounded-full border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-500">
            {backgrounds.length}
          </span>
        </div>

        {backgrounds.length > 0 ? (
          <div className="mt-4 grid gap-4">
            {backgrounds.map((background) => (
              <article
                key={background.id}
                className="grid gap-4 rounded-lg border border-zinc-200 bg-white p-4 sm:grid-cols-[1fr_160px] sm:items-start"
              >
                <div className="min-w-0">
                  <h3 className="font-medium text-zinc-950">
                    {background.filename}
                  </h3>
                  <dl className="mt-3 grid gap-3 text-sm">
                    <div>
                      <dt className="font-medium text-zinc-500">Uploaded</dt>
                      <dd className="mt-1 text-zinc-900">
                        {formatDate(background.created_at)}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-medium text-zinc-500">File path</dt>
                      <dd className="mt-1 break-all text-xs text-zinc-600">
                        {background.filepath}
                      </dd>
                    </div>
                  </dl>
                </div>
                <video
                  controls
                  preload="metadata"
                  className="aspect-[9/16] w-full max-w-[160px] rounded-md border border-zinc-200 bg-zinc-950 object-contain sm:justify-self-end"
                >
                  <source
                    src={`/api/books/backgrounds/${book.id}?backgroundId=${background.id}`}
                  />
                </video>
              </article>
            ))}
          </div>
        ) : (
          <section className="mt-4 rounded-lg border border-dashed border-zinc-300 bg-white p-8">
            <h3 className="text-lg font-semibold">No background videos yet</h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">
              Upload reusable background videos here before selecting them for
              book-based campaigns.
            </p>
          </section>
        )}
      </section>
    </PageShell>
  );
}
