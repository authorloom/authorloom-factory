import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BookAssetUploadPanel } from "@/components/book-asset-upload-panel";
import { PageHeader, PageShell } from "@/components/page-shell";
import { SubmitButton } from "@/components/submit-button";
import {
  getBook,
  getBookHookCountsByScreenshot,
  listBookScreenshots,
} from "@/lib/db";

import {
  importBookHooksSheetAction,
  importBookScreenshotsFromDriveAction,
  saveBookHooksSheetAction,
} from "../actions";

export const dynamic = "force-dynamic";

type ScreenshotsPageProps = {
  params: Promise<{
    bookId: string;
  }>;
  searchParams: Promise<{
    driveImport?: string;
    downloaded?: string;
    duplicates?: string;
    unsupported?: string;
    error?: string | string[];
    hookImport?: string;
    imported?: string;
    unmatched?: string;
    ignored?: string;
    unmatchedRow?: string | string[];
    hookError?: string | string[];
  }>;
};

function formatDate(value: number) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value * 1000));
}

export default async function ScreenshotsPage({
  params,
  searchParams,
}: ScreenshotsPageProps) {
  const { bookId } = await params;
  const importResult = await searchParams;
  const book = getBook(bookId);

  if (!book) {
    notFound();
  }

  const screenshots = listBookScreenshots(book.id);
  const hookCounts = getBookHookCountsByScreenshot(book.id);
  const importErrors = Array.isArray(importResult.error)
    ? importResult.error
    : importResult.error
      ? [importResult.error]
      : [];
  const unmatchedRows = Array.isArray(importResult.unmatchedRow)
    ? importResult.unmatchedRow
    : importResult.unmatchedRow
      ? [importResult.unmatchedRow]
      : [];
  const hookImportErrors = Array.isArray(importResult.hookError)
    ? importResult.hookError
    : importResult.hookError
      ? [importResult.hookError]
      : [];
  const hasDriveImportSummary = Boolean(importResult.driveImport);
  const hasHookImportSummary = Boolean(importResult.hookImport);

  return (
    <PageShell>
      <PageHeader
        title="Screenshots"
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
        <p>Upload screenshots and open each one to manage its hooks.</p>
      </PageHeader>

      <section className="border-b border-zinc-200 pb-8">
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <h2 className="text-lg font-semibold">Upload screenshot</h2>
            <BookAssetUploadPanel
              bookId={book.id}
              assetType="screenshots"
              label="Screenshot file"
              accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
              helpText="Supported: png, jpg, jpeg, webp. Max 25MB."
            />
          </div>

          <section className="rounded-lg border border-zinc-200 bg-white p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold">
                  Import from Google Drive
                </h2>
                <p className="mt-1 text-sm leading-6 text-zinc-600">
                  Pull supported images from
                  source-assets/screenshots in the connected book Drive folder.
                </p>
              </div>
              <form
                action={importBookScreenshotsFromDriveAction.bind(
                  null,
                  book.id,
                )}
              >
                <SubmitButton
                  pendingLabel="Importing..."
                  savedLabel="Imported"
                  disabled={!book.drive_folder_url && !book.drive_folder_id}
                >
                  Import screenshots from Drive
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

          <section className="rounded-lg border border-zinc-200 bg-white p-5 lg:col-span-2">
            <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold">
                    Import hooks from Google Sheet
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-zinc-600">
                    Add hook and screenshot_url rows to the generated hooks
                    Sheet, then import them after screenshots have been pulled
                    from Drive.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {book.hooks_sheet_url ? (
                    <a
                      href={book.hooks_sheet_url}
                      className="inline-flex min-h-10 items-center justify-center rounded-md border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open hooks Sheet
                    </a>
                  ) : null}
                  <form action={importBookHooksSheetAction.bind(null, book.id)}>
                    <SubmitButton
                      pendingLabel="Importing..."
                      savedLabel="Imported"
                      disabled={!book.hooks_sheet_url && !book.hooks_sheet_id}
                    >
                      Import hooks from Sheet
                    </SubmitButton>
                  </form>
                </div>
              </div>
              <dl className="mt-4 grid gap-1 text-xs text-zinc-500">
                <div>
                  <dt className="font-medium">Hooks Sheet status</dt>
                  <dd className="break-all">
                    {book.hooks_sheet_url ? (
                      <a
                        href={book.hooks_sheet_url}
                        className="text-rose-700 underline"
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open hooks Sheet
                      </a>
                    ) : (
                      (book.hooks_sheet_id ?? "Not connected")
                    )}
                  </dd>
                </div>
              </dl>
              {!book.hooks_sheet_url && !book.hooks_sheet_id ? (
                <form
                  action={saveBookHooksSheetAction.bind(null, book.id)}
                  className="mt-4 grid gap-3 rounded-md border border-amber-200 bg-amber-50 p-4"
                >
                  <p className="text-sm leading-6 text-amber-800">
                    This older book does not have a stored hooks Sheet yet. Add
                    the Sheet URL once, then future imports will use it
                    automatically.
                  </p>
                  <label className="grid gap-2">
                    <span className="text-sm font-medium text-zinc-800">
                      Hooks Google Sheet URL
                    </span>
                    <input
                      name="hooksSheetUrl"
                      type="url"
                      placeholder="https://docs.google.com/spreadsheets/d/..."
                      className="min-h-11 rounded-md border border-zinc-300 bg-white px-3 text-base outline-none focus:border-rose-700 focus:ring-2 focus:ring-rose-100"
                    />
                  </label>
                  <div>
                    <SubmitButton
                      pendingLabel="Saving..."
                      savedLabel="Saved"
                      className="inline-flex min-h-10 items-center justify-center rounded-md border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-800 transition hover:bg-zinc-100 active:translate-y-px active:bg-zinc-200 disabled:cursor-not-allowed disabled:border-zinc-200 disabled:bg-zinc-100 disabled:text-zinc-400 disabled:active:translate-y-0"
                    >
                      Save Sheet URL
                    </SubmitButton>
                  </div>
                </form>
              ) : null}
            </div>

            {hasHookImportSummary ? (
              <div
                className={`mt-4 rounded-md border px-3 py-2 text-sm ${
                  importResult.hookImport === "success"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-amber-200 bg-amber-50 text-amber-800"
                }`}
              >
                <p className="font-medium">Hooks import summary</p>
                <ul className="mt-2 grid gap-1">
                  <li>Imported: {importResult.imported ?? "0"}</li>
                  <li>
                    Skipped duplicates: {importResult.duplicates ?? "0"}
                  </li>
                  <li>Ignored empty rows: {importResult.ignored ?? "0"}</li>
                  <li>Unmatched rows: {importResult.unmatched ?? "0"}</li>
                </ul>
                {unmatchedRows.length > 0 ? (
                  <div className="mt-3">
                    <p className="font-medium">Unmatched rows</p>
                    <ul className="mt-1 grid gap-1">
                      {unmatchedRows.map((row) => (
                        <li key={row}>{row}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {hookImportErrors.length > 0 ? (
                  <div className="mt-3">
                    <p className="font-medium">Errors</p>
                    <ul className="mt-1 grid gap-1">
                      {hookImportErrors.map((error) => (
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
          <h2 className="text-lg font-semibold">Uploaded screenshots</h2>
          <span className="rounded-full border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-500">
            {screenshots.length}
          </span>
        </div>

        {screenshots.length > 0 ? (
          <div className="mt-4 overflow-hidden rounded-lg border border-zinc-200 bg-white">
            <div className="grid divide-y divide-zinc-200">
              {screenshots.map((screenshot) => {
                const hookCount = hookCounts.get(screenshot.id) ?? 0;

                return (
                  <Link
                    key={screenshot.id}
                    href={`/books/${book.id}/screenshots/${screenshot.id}`}
                    className="grid gap-4 p-4 transition hover:bg-zinc-50 sm:grid-cols-[96px_1fr_auto] sm:items-center"
                  >
                    <Image
                      src={`/api/books/screenshots/${book.id}?screenshotId=${screenshot.id}`}
                      alt={screenshot.filename}
                      width={96}
                      height={128}
                      unoptimized
                      className="aspect-[3/4] w-24 rounded-md border border-zinc-200 bg-zinc-100 object-cover"
                    />
                    <div className="min-w-0">
                      <p className="font-medium text-zinc-950">
                        {screenshot.filename}
                      </p>
                      <p className="mt-1 break-all text-xs text-zinc-500">
                        {screenshot.filepath}
                      </p>
                      <p className="mt-2 text-xs text-zinc-500">
                        Uploaded {formatDate(screenshot.created_at)}
                      </p>
                    </div>
                    <span className="w-fit rounded-full border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-500">
                      {hookCount} {hookCount === 1 ? "hook" : "hooks"}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        ) : (
          <section className="mt-4 rounded-lg border border-dashed border-zinc-300 bg-white p-8">
            <h3 className="text-lg font-semibold">No screenshots yet</h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">
              Upload screenshots here before adding hooks or generating
              book-based campaign matrices.
            </p>
          </section>
        )}
      </section>
    </PageShell>
  );
}
