import Link from "next/link";

import { PageHeader, PageShell } from "@/components/page-shell";
import { SubmitButton } from "@/components/submit-button";
import { getAuthor, listSeriesByAuthor } from "@/lib/db";

import { createBookAction } from "../actions";

type NewBookPageProps = {
  searchParams: Promise<{
    authorId?: string;
  }>;
};

export default async function NewBookPage({ searchParams }: NewBookPageProps) {
  const { authorId } = await searchParams;
  const selectedAuthor = authorId ? getAuthor(authorId) : null;
  const authorSeries = selectedAuthor
    ? listSeriesByAuthor(selectedAuthor.id)
    : [];

  return (
    <PageShell>
      <PageHeader title="New Book" eyebrow="Source setup">
        <p>Create the reusable book record that campaigns will select later.</p>
      </PageHeader>

      <form
        action={createBookAction}
        className="max-w-2xl rounded-lg border border-zinc-200 bg-white p-6 shadow-sm"
      >
        <div className="grid gap-5">
          {selectedAuthor ? (
            <div className="grid gap-2">
              <span className="text-sm font-medium text-zinc-800">Author</span>
              <input type="hidden" name="authorId" value={selectedAuthor.id} />
              <input
                type="hidden"
                name="authorName"
                value={selectedAuthor.name}
              />
              <p className="min-h-11 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-base text-zinc-700">
                {selectedAuthor.name}
              </p>
            </div>
          ) : (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              Create or open an author first, then use “Add book for this
              author” so the app can create the book folder inside the author
              Drive folder.
            </div>
          )}

          <div className="grid gap-3 rounded-md border border-zinc-200 bg-zinc-50 p-4">
            <div>
              <h2 className="text-sm font-semibold text-zinc-950">Series</h2>
              <p className="mt-1 text-sm leading-6 text-zinc-600">
                Pick an existing series for this author, or intentionally
                create a new one. This avoids accidental duplicate series from
                typos.
              </p>
            </div>

            <label className="grid gap-2">
              <span className="text-sm font-medium text-zinc-800">
                Existing series
              </span>
              <select
                name="seriesId"
                defaultValue=""
                className="min-h-11 rounded-md border border-zinc-300 bg-white px-3 text-base outline-none focus:border-rose-700 focus:ring-2 focus:ring-rose-100"
              >
                <option value="">Standalone / no series</option>
                {authorSeries.map((series) => (
                  <option key={series.id} value={series.id}>
                    {series.name}
                  </option>
                ))}
                <option value="__new__">Create new series below</option>
              </select>
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-medium text-zinc-800">
                New series name
              </span>
              <input
                name="newSeriesName"
                placeholder="Only fill this when creating a new series"
                className="min-h-11 rounded-md border border-zinc-300 bg-white px-3 text-base outline-none focus:border-rose-700 focus:ring-2 focus:ring-rose-100"
              />
            </label>
          </div>

          <label className="grid gap-2">
            <span className="text-sm font-medium text-zinc-800">
              Book title
            </span>
            <input
              name="title"
              required
              className="min-h-11 rounded-md border border-zinc-300 px-3 text-base outline-none focus:border-rose-700 focus:ring-2 focus:ring-rose-100"
            />
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-medium text-zinc-800">
              Description
            </span>
            <textarea
              name="description"
              rows={4}
              className="rounded-md border border-zinc-300 px-3 py-2 text-base outline-none focus:border-rose-700 focus:ring-2 focus:ring-rose-100"
            />
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-medium text-zinc-800">
              Tropes
            </span>
            <input
              name="tropes"
              placeholder="enemies to lovers, forbidden romance"
              className="min-h-11 rounded-md border border-zinc-300 px-3 text-base outline-none focus:border-rose-700 focus:ring-2 focus:ring-rose-100"
            />
          </label>

          <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">
            {selectedAuthor?.drive_folder_id ? (
              <p>
                The app will create this book folder and source-assets
                structure inside the connected author Drive folder.
              </p>
            ) : (
              <p>
                Connect the author Drive folder from the author page before
                creating books.
              </p>
            )}
          </div>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Link
            href="/books"
            className="inline-flex min-h-10 items-center justify-center rounded-md border border-zinc-300 px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
          >
            Cancel
          </Link>
          <SubmitButton
            pendingLabel="Creating..."
            savedLabel="Created"
            disabled={!selectedAuthor?.drive_folder_id}
          >
            Create book
          </SubmitButton>
        </div>
      </form>
    </PageShell>
  );
}
