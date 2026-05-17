import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BookAssetUploadPanel } from "@/components/book-asset-upload-panel";
import { PageHeader, PageShell } from "@/components/page-shell";
import { SubmitButton } from "@/components/submit-button";
import { getBook, listBookThumbnails } from "@/lib/db";

import { importBookThumbnailsFromDriveAction } from "../actions";

export const dynamic = "force-dynamic";

type ThumbnailsPageProps = {
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

export default async function ThumbnailsPage({
  params,
  searchParams,
}: ThumbnailsPageProps) {
  const { bookId } = await params;
  const importResult = await searchParams;
  const book = getBook(bookId);

  if (!book) {
    notFound();
  }

  const thumbnails = listBookThumbnails(book.id);
  const importErrors = Array.isArray(importResult.error)
    ? importResult.error
    : importResult.error
      ? [importResult.error]
      : [];
  const hasDriveImportSummary = Boolean(importResult.driveImport);

  return (
    <PageShell>
      <PageHeader
        title="Thumbnails"
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
        <p>
          Import and manage reusable thumbnail images for rendered videos and
          future publishing workflows.
        </p>
      </PageHeader>

      <section className="border-b border-zinc-200 pb-8">
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <h2 className="text-lg font-semibold">Upload thumbnail</h2>
            <BookAssetUploadPanel
              bookId={book.id}
              assetType="thumbnails"
              label="Thumbnail image file"
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
                  Pull supported images from source-assets/thumbnails in the
                  connected book Drive folder.
                </p>
              </div>
              <form
                action={importBookThumbnailsFromDriveAction.bind(
                  null,
                  book.id,
                )}
              >
                <SubmitButton
                  pendingLabel="Importing..."
                  savedLabel="Imported"
                  disabled={!book.drive_folder_url && !book.drive_folder_id}
                >
                  Import thumbnails from Drive
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
          <h2 className="text-lg font-semibold">Saved thumbnails</h2>
          <span className="rounded-full border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-500">
            {thumbnails.length}
          </span>
        </div>

        {thumbnails.length > 0 ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {thumbnails.map((thumbnail) => (
              <article
                key={thumbnail.id}
                className="rounded-lg border border-zinc-200 bg-white p-4"
              >
                <div className="aspect-video overflow-hidden rounded-md border border-zinc-200 bg-zinc-100">
                  <Image
                    src={`/api/books/thumbnails/${book.id}?thumbnailId=${thumbnail.id}`}
                    alt={thumbnail.filename}
                    width={480}
                    height={270}
                    unoptimized
                    className="h-full w-full object-contain"
                  />
                </div>
                <h3 className="mt-3 truncate font-medium text-zinc-950">
                  {thumbnail.filename}
                </h3>
                <dl className="mt-3 grid gap-2 text-sm">
                  <div>
                    <dt className="font-medium text-zinc-500">Saved</dt>
                    <dd className="mt-1 text-zinc-900">
                      {formatDate(thumbnail.created_at)}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-medium text-zinc-500">Drive</dt>
                    <dd className="mt-1">
                      {thumbnail.drive_url ? (
                        <a
                          href={thumbnail.drive_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-rose-700 underline"
                        >
                          Open Drive file
                        </a>
                      ) : (
                        <span className="text-zinc-500">Local only</span>
                      )}
                    </dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        ) : (
          <section className="mt-4 rounded-lg border border-dashed border-zinc-300 bg-white p-8">
            <h3 className="text-lg font-semibold">No thumbnails yet</h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">
              Import thumbnail images from Drive or upload them locally before
              assigning them to render batches.
            </p>
          </section>
        )}
      </section>
    </PageShell>
  );
}
