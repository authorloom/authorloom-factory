import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  deleteAuthorSeriesAction,
  findSharedAuthorDriveFolderAction,
  syncAuthorDriveFolderAction,
} from "@/app/authors/actions";
import { PageHeader, PageShell } from "@/components/page-shell";
import { SubmitButton } from "@/components/submit-button";
import {
  getAuthor,
  listBookBackgrounds,
  listBookHooks,
  listBookScreenshots,
  listBooksByAuthor,
  listSeriesByAuthor,
  type Book,
  type Series,
} from "@/lib/db";
import { getGoogleServiceAccountEmail } from "@/lib/google";

export const dynamic = "force-dynamic";

type AuthorPageProps = {
  params: Promise<{
    authorId: string;
  }>;
  searchParams: Promise<{
    driveSync?: string;
    seriesDelete?: string;
    message?: string;
  }>;
};

function formatDate(value: number) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
  }).format(new Date(value * 1000));
}

function truncateDescription(description: string) {
  return description.length > 190
    ? `${description.slice(0, 187).trim()}...`
    : description;
}

function BookCard({ book }: { book: Book }) {
  const screenshotCount = listBookScreenshots(book.id).length;
  const hookCount = listBookHooks(book.id).length;
  const backgroundCount = listBookBackgrounds(book.id).length;

  return (
    <Link
      href={`/books/${book.id}`}
      className="group grid gap-4 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm transition hover:border-rose-200 hover:shadow-md sm:grid-cols-[112px_1fr]"
    >
      <div className="aspect-[2/3] w-28 overflow-hidden rounded-md border border-zinc-200 bg-zinc-100">
        {book.cover_filepath ? (
          <Image
            src={`/api/books/covers/${book.id}`}
            alt={`${book.title} cover`}
            width={224}
            height={336}
            unoptimized
            className="h-full w-full object-cover transition group-hover:scale-[1.02]"
          />
        ) : (
          <div className="flex h-full items-center justify-center px-3 text-center text-xs font-medium text-zinc-400">
            No cover
          </div>
        )}
      </div>

      <div className="min-w-0">
        <h4 className="text-base font-semibold leading-6 text-zinc-950 group-hover:text-rose-800">
          {book.title}
        </h4>
        {book.description ? (
          <p className="mt-2 text-sm leading-6 text-zinc-600">
            {truncateDescription(book.description)}
          </p>
        ) : (
          <p className="mt-2 text-sm leading-6 text-zinc-500">
            No description yet.
          </p>
        )}
        <dl className="mt-4 grid grid-cols-3 gap-2 text-xs">
          <div className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-2">
            <dt className="font-medium uppercase text-zinc-500">Shots</dt>
            <dd className="mt-1 text-sm font-semibold text-zinc-950">
              {screenshotCount}
            </dd>
          </div>
          <div className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-2">
            <dt className="font-medium uppercase text-zinc-500">Hooks</dt>
            <dd className="mt-1 text-sm font-semibold text-zinc-950">
              {hookCount}
            </dd>
          </div>
          <div className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-2">
            <dt className="font-medium uppercase text-zinc-500">Bgs</dt>
            <dd className="mt-1 text-sm font-semibold text-zinc-950">
              {backgroundCount}
            </dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-zinc-500">
          Added {formatDate(book.created_at)}
        </p>
      </div>
    </Link>
  );
}

function SeriesSection({
  authorId,
  seriesRecord,
  books,
}: {
  authorId: string;
  seriesRecord: Series;
  books: Book[];
}) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Series
          </p>
          <h3 className="mt-1 text-xl font-semibold text-zinc-950">
            {seriesRecord.name}
          </h3>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-fit rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-500">
            {books.length} {books.length === 1 ? "book" : "books"}
          </span>
          {books.length === 0 ? (
            <form
              action={deleteAuthorSeriesAction.bind(
                null,
                authorId,
                seriesRecord.id,
              )}
            >
              <SubmitButton
                pendingLabel="Deleting..."
                savedLabel="Deleted"
                className="inline-flex min-h-8 items-center justify-center rounded-md border border-rose-200 bg-white px-3 text-xs font-medium text-rose-700 transition hover:bg-rose-50 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60"
              >
                Delete empty series
              </SubmitButton>
            </form>
          ) : null}
        </div>
      </div>

      {books.length > 0 ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {books.map((book) => (
            <BookCard key={book.id} book={book} />
          ))}
        </div>
      ) : (
        <p className="mt-4 rounded-lg border border-dashed border-zinc-300 bg-white p-4 text-sm text-zinc-500">
          No books in this series yet.
        </p>
      )}
    </section>
  );
}

export default async function AuthorPage({
  params,
  searchParams,
}: AuthorPageProps) {
  const { authorId } = await params;
  const { driveSync, seriesDelete, message } = await searchParams;
  const author = getAuthor(authorId);

  if (!author) {
    notFound();
  }

  const series = listSeriesByAuthor(author.id);
  const books = listBooksByAuthor(author.id);
  const standaloneBooks = books.filter((book) => !book.series_id);
  const connectedBooks = books.filter(
    (book) => book.drive_folder_id || book.drive_folder_url,
  );
  const bookStats = books.reduce(
    (stats, book) => ({
      screenshots: stats.screenshots + listBookScreenshots(book.id).length,
      hooks: stats.hooks + listBookHooks(book.id).length,
      backgrounds: stats.backgrounds + listBookBackgrounds(book.id).length,
    }),
    {
      screenshots: 0,
      hooks: 0,
      backgrounds: 0,
    },
  );
  const serviceAccountEmail =
    getGoogleServiceAccountEmail() ??
    "booktok-factory-bot@adroit-solstice-494617-v3.iam.gserviceaccount.com";

  return (
    <PageShell>
      <PageHeader
        title={author.name}
        eyebrow="Author dashboard"
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/authors"
              className="inline-flex rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
            >
              Back to authors
            </Link>
            <Link
              href={`/books/new?authorId=${author.id}`}
              className="inline-flex rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
            >
              Add book for this author
            </Link>
          </div>
        }
      >
        <p>
          A tidy source library for this author: books, series, Drive setup,
          and the assets feeding your campaign batches.
        </p>
      </PageHeader>

      <div className="grid gap-6">
        {seriesDelete && message ? (
          <p
            className={`rounded-md border px-3 py-2 text-sm ${
              seriesDelete === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-rose-200 bg-rose-50 text-rose-800"
            }`}
          >
            {message}
          </p>
        ) : null}

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="rounded-lg border border-zinc-200 bg-white p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Books
            </p>
            <p className="mt-2 text-3xl font-semibold text-zinc-950">
              {books.length}
            </p>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Series
            </p>
            <p className="mt-2 text-3xl font-semibold text-zinc-950">
              {series.length}
            </p>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Screenshots
            </p>
            <p className="mt-2 text-3xl font-semibold text-zinc-950">
              {bookStats.screenshots}
            </p>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Hooks
            </p>
            <p className="mt-2 text-3xl font-semibold text-zinc-950">
              {bookStats.hooks}
            </p>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Drive books
            </p>
            <p className="mt-2 text-3xl font-semibold text-zinc-950">
              {connectedBooks.length}
            </p>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-xl border border-zinc-200 bg-white p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold">Author workspace</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">
                  Keep this author organized from one place. Add books, connect
                  Drive once, then let each book create its own source folders.
                </p>
              </div>
              <span
                className={`w-fit rounded-full border px-3 py-1 text-xs font-medium ${
                  author.drive_folder_id
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-amber-200 bg-amber-50 text-amber-700"
                }`}
              >
                {author.drive_folder_id ? "Drive connected" : "Drive needed"}
              </span>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <Link
                href={`/books/new?authorId=${author.id}`}
                className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 transition hover:border-rose-200 hover:bg-rose-50"
              >
                <p className="font-medium text-zinc-950">Add book</p>
                <p className="mt-1 text-sm leading-5 text-zinc-600">
                  Create folders and the hooks Sheet for the next title.
                </p>
              </Link>
              <Link
                href="/campaigns/new"
                className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 transition hover:border-rose-200 hover:bg-rose-50"
              >
                <p className="font-medium text-zinc-950">Create campaign</p>
                <p className="mt-1 text-sm leading-5 text-zinc-600">
                  Build a batch once the book assets are ready.
                </p>
              </Link>
              <Link
                href="/audio"
                className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 transition hover:border-rose-200 hover:bg-rose-50"
              >
                <p className="font-medium text-zinc-950">Audio library</p>
                <p className="mt-1 text-sm leading-5 text-zinc-600">
                  Reuse imported sounds across this author&apos;s campaigns.
                </p>
              </Link>
            </div>
          </div>

          <form
            action={syncAuthorDriveFolderAction.bind(null, author.id)}
            className="rounded-xl border border-zinc-200 bg-white p-5"
          >
            <h2 className="text-lg font-semibold">Drive setup</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-600">
              Create a Google Drive folder named{" "}
              <span className="font-mono font-medium text-zinc-900">
                {author.slug}
              </span>
              , share it with{" "}
              <span className="font-medium text-zinc-900">
                {serviceAccountEmail}
              </span>{" "}
              and{" "}
              <span className="font-medium text-zinc-900">
                kaynebrennan1982@gmail.com
              </span>{" "}
              as Editor, then paste the folder URL here.
            </p>
            <dl className="mt-4 grid gap-2 text-sm">
              <div>
                <dt className="font-medium text-zinc-500">Author slug</dt>
                <dd className="mt-1 font-mono text-zinc-900">
                  {author.slug}
                </dd>
              </div>
              {author.drive_folder_url ? (
                <div>
                  <dt className="font-medium text-zinc-500">Drive folder</dt>
                  <dd className="mt-1 break-all">
                    <a
                      href={author.drive_folder_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-rose-700 underline"
                    >
                      Open author folder
                    </a>
                  </dd>
                </div>
              ) : null}
            </dl>
            <label className="mt-4 grid gap-2">
              <span className="text-sm font-medium text-zinc-800">
                Author Drive Folder URL
              </span>
              <input
                name="driveFolderUrl"
                defaultValue={author.drive_folder_url ?? ""}
                placeholder="https://drive.google.com/drive/folders/..."
                className="min-h-11 rounded-md border border-zinc-300 px-3 text-base outline-none focus:border-rose-700 focus:ring-2 focus:ring-rose-100"
              />
            </label>
            <div className="mt-4 flex justify-end">
              <SubmitButton pendingLabel="Checking..." savedLabel="Checked">
                Check folder
              </SubmitButton>
            </div>
            <div className="mt-3 border-t border-zinc-200 pt-3">
              <form
                action={findSharedAuthorDriveFolderAction.bind(null, author.id)}
              >
                <SubmitButton
                  pendingLabel="Searching..."
                  savedLabel="Connected"
                  className="inline-flex min-h-10 w-full items-center justify-center rounded-md border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-800 transition hover:bg-zinc-100 active:translate-y-px active:bg-zinc-200 disabled:cursor-not-allowed disabled:border-zinc-200 disabled:bg-zinc-100 disabled:text-zinc-400 disabled:active:translate-y-0"
                >
                  Find shared Drive folder named {author.slug}
                </SubmitButton>
              </form>
              <p className="mt-2 text-xs leading-5 text-zinc-500">
                Use this after sharing the folder. Manual URL entry stays here
                as the fallback when more than one matching folder exists.
              </p>
            </div>
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
          </form>
        </section>

        <section className="rounded-xl border border-zinc-200 bg-white p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-zinc-950">
                Books by series
              </h2>
              <p className="mt-2 text-sm leading-6 text-zinc-600">
                Click any cover card to open the book dashboard, manage source
                assets, or create a campaign.
              </p>
            </div>
            <Link
              href={`/books/new?authorId=${author.id}`}
              className="inline-flex w-fit rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
            >
              Add book
            </Link>
          </div>

          {books.length > 0 ? (
            <div className="mt-5 grid gap-5">
              {series.map((seriesRecord) => {
                const seriesBooks = books.filter(
                  (book) => book.series_id === seriesRecord.id,
                );

                return (
                  <SeriesSection
                    key={seriesRecord.id}
                    authorId={author.id}
                    seriesRecord={seriesRecord}
                    books={seriesBooks}
                  />
                );
              })}

              {standaloneBooks.length > 0 ? (
                <section className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-4 sm:p-5">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                        Standalone
                      </p>
                      <h3 className="mt-1 text-xl font-semibold text-zinc-950">
                        Books outside a series
                      </h3>
                    </div>
                    <span className="w-fit rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-500">
                      {standaloneBooks.length}{" "}
                      {standaloneBooks.length === 1 ? "book" : "books"}
                    </span>
                  </div>
                  <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    {standaloneBooks.map((book) => (
                      <BookCard key={book.id} book={book} />
                    ))}
                  </div>
                </section>
              ) : null}
            </div>
          ) : (
            <div className="mt-5 rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-8 text-center">
              <h3 className="text-lg font-semibold text-zinc-950">
                No books for this author yet
              </h3>
              <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-zinc-600">
                Add the first book to create its Drive folder, source-assets
                structure, and hooks Sheet.
              </p>
              <Link
                href={`/books/new?authorId=${author.id}`}
                className="mt-4 inline-flex rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
              >
                Add first book
              </Link>
            </div>
          )}
        </section>
      </div>
    </PageShell>
  );
}
