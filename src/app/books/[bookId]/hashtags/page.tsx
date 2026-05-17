import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader, PageShell } from "@/components/page-shell";
import { SubmitButton } from "@/components/submit-button";
import { getBook, listBookHashtags } from "@/lib/db";

import {
  addBookHashtagsAction,
  deleteBookHashtagAction,
  importBookHashtagsSheetAction,
} from "../actions";

export const dynamic = "force-dynamic";

type HashtagsPageProps = {
  params: Promise<{
    bookId: string;
  }>;
  searchParams: Promise<{
    hashtagsImport?: string;
    hashtagsImported?: string;
    hashtagsDuplicates?: string;
    hashtagsIgnored?: string;
    hashtagsError?: string | string[];
  }>;
};

export default async function HashtagsPage({
  params,
  searchParams,
}: HashtagsPageProps) {
  const { bookId } = await params;
  const importResult = await searchParams;
  const book = getBook(bookId);

  if (!book) {
    notFound();
  }

  const hashtags = listBookHashtags(book.id);
  const importErrors = Array.isArray(importResult.hashtagsError)
    ? importResult.hashtagsError
    : importResult.hashtagsError
      ? [importResult.hashtagsError]
      : [];

  return (
    <PageShell>
      <PageHeader
        title="Hashtags"
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
        <p>Import reusable hashtags from the generated Sheet or add them manually.</p>
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <section className="grid gap-4">
          <div className="rounded-lg border border-zinc-200 bg-white p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold">Google Sheet</h2>
                <p className="mt-1 text-sm leading-6 text-zinc-600">
                  Keep hashtag ideas in the generated hashtags Sheet. Imported
                  hashtags are cleaned and normalized before saving.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {book.hashtags_sheet_url ? (
                  <a
                    href={book.hashtags_sheet_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-10 items-center justify-center rounded-md border border-zinc-300 px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
                  >
                    Open Sheet
                  </a>
                ) : null}
                <form action={importBookHashtagsSheetAction.bind(null, book.id)}>
                  <SubmitButton
                    pendingLabel="Importing..."
                    savedLabel="Imported"
                    disabled={!book.hashtags_sheet_url && !book.hashtags_sheet_id}
                  >
                    Import hashtags
                  </SubmitButton>
                </form>
              </div>
            </div>
            <p className="mt-4 break-all text-xs text-zinc-500">
              {book.hashtags_sheet_url ??
                book.hashtags_sheet_id ??
                "No hashtags Sheet connected."}
            </p>
            {importResult.hashtagsImport ? (
              <div
                className={`mt-4 rounded-md border px-3 py-2 text-sm ${
                  importResult.hashtagsImport === "success"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-amber-200 bg-amber-50 text-amber-800"
                }`}
              >
                <p className="font-medium">Import summary</p>
                <ul className="mt-2 grid gap-1">
                  <li>Imported: {importResult.hashtagsImported ?? "0"}</li>
                  <li>
                    Skipped duplicates:{" "}
                    {importResult.hashtagsDuplicates ?? "0"}
                  </li>
                  <li>Ignored rows: {importResult.hashtagsIgnored ?? "0"}</li>
                </ul>
                {importErrors.length > 0 ? (
                  <ul className="mt-3 grid gap-1">
                    {importErrors.map((error) => (
                      <li key={error}>{error}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </div>

          <form
            action={addBookHashtagsAction.bind(null, book.id)}
            className="rounded-lg border border-zinc-200 bg-white p-5"
          >
            <h2 className="text-lg font-semibold">Add manually</h2>
            <p className="mt-1 text-sm leading-6 text-zinc-600">
              One hashtag per line. Leading # is optional.
            </p>
            <textarea
              name="hashtags"
              rows={8}
              className="mt-4 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm leading-6 outline-none focus:border-rose-700 focus:ring-2 focus:ring-rose-100"
            />
            <div className="mt-3 flex justify-end">
              <SubmitButton pendingLabel="Saving..." savedLabel="Saved">
                Save hashtags
              </SubmitButton>
            </div>
          </form>
        </section>

        <section className="rounded-lg border border-zinc-200 bg-white p-5">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-lg font-semibold">Saved hashtags</h2>
            <span className="rounded-full border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-500">
              {hashtags.length}
            </span>
          </div>
          {hashtags.length > 0 ? (
            <ul className="mt-4 flex flex-wrap gap-2">
              {hashtags.map((hashtag) => (
                <li
                  key={hashtag.id}
                  className="flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-800"
                >
                  <span>{hashtag.hashtag}</span>
                  <form
                    action={deleteBookHashtagAction.bind(
                      null,
                      book.id,
                      hashtag.id,
                    )}
                  >
                    <button
                      type="submit"
                      className="font-medium text-rose-700 hover:text-rose-900"
                    >
                      Delete
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 rounded-md border border-dashed border-zinc-300 bg-zinc-50 p-6 text-sm text-zinc-500">
              No hashtags saved yet.
            </p>
          )}
        </section>
      </div>
    </PageShell>
  );
}
