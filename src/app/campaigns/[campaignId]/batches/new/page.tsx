import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader, PageShell } from "@/components/page-shell";
import { SubmitButton } from "@/components/submit-button";
import { getBook, getCampaign, getLayout, listLayouts } from "@/lib/db";

import { createRenderBatchAction } from "../actions";

export const dynamic = "force-dynamic";

type NewRenderBatchPageProps = {
  params: Promise<{
    campaignId: string;
  }>;
};

export default async function NewRenderBatchPage({
  params,
}: NewRenderBatchPageProps) {
  const { campaignId } = await params;
  const campaign = getCampaign(campaignId);

  if (!campaign?.book_id) {
    notFound();
  }

  const book = getBook(campaign.book_id);

  if (!book) {
    notFound();
  }

  const layouts = listLayouts();
  const currentLayout = campaign.layout_id ? getLayout(campaign.layout_id) : null;
  const defaultLayoutId = currentLayout?.id ?? "default_video_layout";

  return (
    <PageShell>
      <PageHeader
        title="New Render Batch"
        eyebrow="Batch setup"
        action={
          <Link
            href={`/campaigns/${campaign.id}`}
            className="inline-flex rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
          >
            Back to campaign
          </Link>
        }
      >
        <p>
          Create one production run for {campaign.name}. Asset selection comes
          next on the batch detail page.
        </p>
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
        <section className="rounded-lg border border-zinc-200 bg-white p-5">
          <h2 className="text-lg font-semibold">Linked Context</h2>
          <dl className="mt-4 grid gap-4 text-sm">
            <div>
              <dt className="font-medium text-zinc-500">Campaign</dt>
              <dd className="mt-1 text-zinc-900">{campaign.name}</dd>
            </div>
            <div>
              <dt className="font-medium text-zinc-500">Book</dt>
              <dd className="mt-1 text-zinc-900">{book.title}</dd>
            </div>
            <div>
              <dt className="font-medium text-zinc-500">Campaign layout</dt>
              <dd className="mt-1 text-zinc-900">
                {currentLayout?.name ?? campaign.layout_id ?? "Not set"}
              </dd>
            </div>
          </dl>
        </section>

        <form
          action={createRenderBatchAction}
          className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm"
        >
          <input type="hidden" name="campaignId" value={campaign.id} />

          <div className="grid gap-5">
            <label className="grid gap-2">
              <span className="text-sm font-medium text-zinc-800">
                Batch name
              </span>
              <input
                name="name"
                required
                autoFocus
                className="min-h-11 rounded-md border border-zinc-300 px-3 text-base outline-none focus:border-rose-700 focus:ring-2 focus:ring-rose-100"
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-medium text-zinc-800">Layout</span>
              <select
                name="layoutId"
                defaultValue={defaultLayoutId}
                className="min-h-11 rounded-md border border-zinc-300 bg-white px-3 text-base outline-none focus:border-rose-700 focus:ring-2 focus:ring-rose-100"
              >
                {layouts.map((layout) => (
                  <option key={layout.id} value={layout.id}>
                    {layout.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Link
              href={`/campaigns/${campaign.id}`}
              className="inline-flex min-h-10 items-center justify-center rounded-md border border-zinc-300 px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
            >
              Cancel
            </Link>
            <SubmitButton pendingLabel="Creating..." savedLabel="Created">
              Create batch
            </SubmitButton>
          </div>
        </form>
      </div>
    </PageShell>
  );
}
