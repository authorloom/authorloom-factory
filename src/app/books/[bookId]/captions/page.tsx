import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader, PageShell } from "@/components/page-shell";
import { SubmitButton } from "@/components/submit-button";
import { getBook, listBookCaptions } from "@/lib/db";

import {
  addBookCaptionsAction,
  deleteBookCaptionAction,
  importBookCaptionsSheetAction,
} from "../actions";

export const dynamic = "force-dynamic";

type CaptionsPageProps = {
  params: Promise<{
    bookId: string;
  }>;
  searchParams: Promise<{
    captionsImport?: string;
    captionsImported?: string;
    captionsDuplicates?: string;
    captionsIgnored?: string;
    captionsError?: string | string[];
  }>;
};

export default async function CaptionsPage({
  params,
  searchParams,
}: CaptionsPageProps) {
  const { bookId } = await params;
  const importResult = await searchParams;
  const book = getBook(bookId);

  if (!book) {
    notFound();
  }

  const captions = listBookCaptions(book.id);
  const importErrors = Array.isArray(importResult.captionsError)
    ? importResult.captionsError
    : importResult.captionsError
      ? [importResult.captionsError]
      : [];

  return (
    <PageShell>
      <PageHeader
        title="Captions"
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
        <p>Import reusable captions from the generated Sheet or add them manually.</p>
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <section className="grid gap-4">
          <div className="rounded-lg border border-zinc-200 bg-white p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold">Google Sheet</h2>
                <p className="mt-1 text-sm leading-6 text-zinc-600">
                  Keep campaign caption copy in the generated captions Sheet,
                  then pull it into the local library.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {book.captions_sheet_url ? (
                  <a
                    href={book.captions_sheet_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-10 items-center justify-center rounded-md border border-zinc-300 px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
                  >
                    Open Sheet
                  </a>
                ) : null}
                <form action={importBookCaptionsSheetAction.bind(null, book.id)}>
                  <SubmitButton
                    pendingLabel="Importing..."
                    savedLabel="Imported"
                    disabled={!book.captions_sheet_url && !book.captions_sheet_id}
                  >
                    Import captions
                  </SubmitButton>
                </form>
              </div>
            </div>
            <p className="mt-4 break-all text-xs text-zinc-500">
              {book.captions_sheet_url ??
                book.captions_sheet_id ??
                "No captions Sheet connected."}
            </p>
            {importResult.captionsImport ? (
              <div
                className={`mt-4 rounded-md border px-3 py-2 text-sm ${
                  importResult.captionsImport === "success"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-amber-200 bg-amber-50 text-amber-800"
                }`}
              >
                <p className="font-medium">Import summary</p>
                <ul className="mt-2 grid gap-1">
                  <li>Imported: {importResult.captionsImported ?? "0"}</li>
                  <li>
                    Skipped duplicates:{" "}
                    {importResult.captionsDuplicates ?? "0"}
                  </li>
                  <li>Ignored rows: {importResult.captionsIgnored ?? "0"}</li>
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
            action={addBookCaptionsAction.bind(null, book.id)}
            className="rounded-lg border border-zinc-200 bg-white p-5"
          >
            <h2 className="text-lg font-semibold">Add manually</h2>
            <p className="mt-1 text-sm leading-6 text-zinc-600">
              Add one full caption at a time. Line breaks, emojis, links, and
              hashtags are preserved.
            </p>
            <textarea
              name="caption"
              rows={16}
              placeholder={`Paste or write one complete caption here.\n\nExample:\nBook title and short pitch\n\nTropes and notes\n\nGrab your copy: https://...\n\n#booktok #romancebooks`}
              className="mt-4 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm leading-6 outline-none focus:border-rose-700 focus:ring-2 focus:ring-rose-100"
            />
            <div className="mt-3 flex justify-end">
              <SubmitButton pendingLabel="Saving..." savedLabel="Saved">
                Save caption
              </SubmitButton>
            </div>
          </form>
        </section>

        <section className="rounded-lg border border-zinc-200 bg-white p-5">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-lg font-semibold">Saved captions</h2>
            <span className="rounded-full border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-500">
              {captions.length}
            </span>
          </div>
          {captions.length > 0 ? (
            <ul className="mt-4 grid gap-3">
              {captions.map((caption) => (
                <li
                  key={caption.id}
                  className="rounded-md border border-zinc-200 bg-zinc-50 p-3"
                >
                  <p className="whitespace-pre-wrap text-sm leading-6 text-zinc-800">
                    {caption.text}
                  </p>
                  <form
                    action={deleteBookCaptionAction.bind(
                      null,
                      book.id,
                      caption.id,
                    )}
                    className="mt-3"
                  >
                    <SubmitButton
                      pendingLabel="Deleting..."
                      savedLabel="Deleted"
                      className="inline-flex min-h-8 items-center justify-center rounded-md border border-rose-200 bg-white px-3 text-xs font-medium text-rose-700 transition hover:bg-rose-50 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Delete
                    </SubmitButton>
                  </form>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 rounded-md border border-dashed border-zinc-300 bg-zinc-50 p-6 text-sm text-zinc-500">
              No captions saved yet.
            </p>
          )}
        </section>
      </div>
    </PageShell>
  );
}
