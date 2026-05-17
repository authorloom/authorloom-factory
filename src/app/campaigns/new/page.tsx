import Link from "next/link";

import { createCampaignAction } from "@/app/campaigns/actions";
import { CampaignSlugPreview } from "@/components/campaign-slug-preview";
import { PageHeader, PageShell } from "@/components/page-shell";
import { SubmitButton } from "@/components/submit-button";
import { listBooks, listLayouts } from "@/lib/db";

type NewCampaignPageProps = {
  searchParams: Promise<{
    bookId?: string;
    error?: string;
  }>;
};

export default async function NewCampaignPage({
  searchParams,
}: NewCampaignPageProps) {
  const { bookId, error } = await searchParams;
  const books = listBooks();
  const layouts = listLayouts();
  const selectedBookId = books.some((book) => book.id === bookId) ? bookId : "";
  const customLayouts = layouts.filter(
    (layout) => layout.id !== "default_video_layout",
  );

  return (
    <PageShell>
      <PageHeader title="New Campaign" eyebrow="Setup">
        <p>Create a campaign from a reusable book and render layout.</p>
      </PageHeader>

      {error ? (
        <div className="mb-4 max-w-2xl rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      <form
        action={createCampaignAction}
        className="max-w-2xl rounded-lg border border-zinc-200 bg-white p-6 shadow-sm"
      >
        <div className="grid gap-5">
          <label className="grid gap-2">
            <span className="text-sm font-medium text-zinc-800">
              Campaign name
            </span>
            <input
              name="name"
              required
              autoFocus
              className="min-h-11 rounded-md border border-zinc-300 px-3 text-base outline-none focus:border-rose-700 focus:ring-2 focus:ring-rose-100"
            />
            <CampaignSlugPreview inputName="name" />
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
              Book
            </span>
            <select
              name="bookId"
              defaultValue={selectedBookId}
              className="min-h-11 rounded-md border border-zinc-300 px-3 text-base outline-none focus:border-rose-700 focus:ring-2 focus:ring-rose-100"
            >
              <option value="">No book selected</option>
              {books.map((book) => (
                <option key={book.id} value={book.id}>
                  {book.title}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-medium text-zinc-800">
              Layout
            </span>
            <select
              name="layoutId"
              className="min-h-11 rounded-md border border-zinc-300 px-3 text-base outline-none focus:border-rose-700 focus:ring-2 focus:ring-rose-100"
            >
              <option value="">Default Video Layout</option>
              {customLayouts.map((layout) => (
                <option key={layout.id} value={layout.id}>
                  {layout.name}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-medium text-zinc-800">Goal</span>
            <textarea
              name="goal"
              rows={3}
              className="rounded-md border border-zinc-300 px-3 py-2 text-base outline-none focus:border-rose-700 focus:ring-2 focus:ring-rose-100"
            />
          </label>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Link
            href="/campaigns"
            className="inline-flex min-h-10 items-center justify-center rounded-md border border-zinc-300 px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
          >
            Cancel
          </Link>
          <SubmitButton pendingLabel="Creating..." savedLabel="Created">
            Create campaign
          </SubmitButton>
        </div>
      </form>
    </PageShell>
  );
}
