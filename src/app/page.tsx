import Link from "next/link";

import { PageHeader, PageShell } from "@/components/page-shell";
import {
  getAuthor,
  getBook,
  listAuthors,
  listBooks,
  listCampaigns,
  listRenderBatchesByCampaign,
  listRenderJobs,
  type Campaign,
  type RenderJobListItem,
} from "@/lib/db";

type DayMetric = {
  key: string;
  label: string;
  activeCampaigns: number;
  completedVideos: number;
  uploadedVideos: number;
};

function sortByNumberDateDescending<T extends { created_at: number }>(
  items: T[],
) {
  return [...items].sort((a, b) => b.created_at - a.created_at);
}

function sortByStringDateDescending<T extends { created_at: string }>(
  items: T[],
) {
  return [...items].sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

function formatDate(value: string | number) {
  const date = typeof value === "number" ? new Date(value * 1000) : new Date(value);

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
  }).format(date);
}

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getLastSevenDays() {
  const today = new Date();

  today.setHours(0, 0, 0, 0);

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);

    date.setDate(today.getDate() - (6 - index));

    return {
      key: dayKey(date),
      label: new Intl.DateTimeFormat("en", { weekday: "short" }).format(date),
    };
  });
}

function getJobDateKey(job: RenderJobListItem) {
  return dayKey(new Date(job.updated_at || job.created_at));
}

function buildDayMetrics(jobs: RenderJobListItem[]): DayMetric[] {
  return getLastSevenDays().map((day) => {
    const dayJobs = jobs.filter((job) => getJobDateKey(job) === day.key);
    const activeCampaignIds = new Set(dayJobs.map((job) => job.campaign_id));
    const completedVideos = dayJobs.filter((job) => job.status === "done").length;
    const uploadedVideos = dayJobs.filter(
      (job) => job.status === "done" && (job.drive_file_id || job.drive_url),
    ).length;

    return {
      key: day.key,
      label: day.label,
      activeCampaigns: activeCampaignIds.size,
      completedVideos,
      uploadedVideos,
    };
  });
}

function maxDayMetricValue(metrics: DayMetric[]) {
  return Math.max(
    1,
    ...metrics.flatMap((metric) => [
      metric.activeCampaigns,
      metric.completedVideos,
      metric.uploadedVideos,
    ]),
  );
}

function StatCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: number | string;
  detail: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </p>
      <p className="mt-2 text-3xl font-semibold text-zinc-950">{value}</p>
      <p className="mt-2 text-sm leading-5 text-zinc-600">{detail}</p>
    </div>
  );
}

function ProductionChart({ metrics }: { metrics: DayMetric[] }) {
  const maxValue = maxDayMetricValue(metrics);

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-zinc-950">
            Production pulse
          </h2>
          <p className="mt-1 text-sm leading-6 text-zinc-600">
            Last 7 days by active campaigns, completed videos, and uploaded
            videos.
          </p>
        </div>
        <div className="flex flex-wrap gap-3 text-xs text-zinc-600">
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-zinc-900" />
            Campaigns
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-rose-700" />
            Completed
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-emerald-600" />
            Uploaded
          </span>
        </div>
      </div>

      <div className="mt-6 grid min-h-56 grid-cols-7 items-end gap-3">
        {metrics.map((metric) => (
          <div key={metric.key} className="grid gap-2">
            <div className="flex h-44 items-end justify-center gap-1 rounded-lg bg-zinc-50 px-2 py-3">
              <div
                className="w-3 rounded-t bg-zinc-900"
                style={{
                  height: `${Math.max(
                    4,
                    (metric.activeCampaigns / maxValue) * 100,
                  )}%`,
                }}
                title={`${metric.activeCampaigns} active campaigns`}
              />
              <div
                className="w-3 rounded-t bg-rose-700"
                style={{
                  height: `${Math.max(
                    4,
                    (metric.completedVideos / maxValue) * 100,
                  )}%`,
                }}
                title={`${metric.completedVideos} completed videos`}
              />
              <div
                className="w-3 rounded-t bg-emerald-600"
                style={{
                  height: `${Math.max(
                    4,
                    (metric.uploadedVideos / maxValue) * 100,
                  )}%`,
                }}
                title={`${metric.uploadedVideos} uploaded videos`}
              />
            </div>
            <div className="text-center">
              <p className="text-xs font-medium text-zinc-700">{metric.label}</p>
              <p className="mt-1 text-[11px] text-zinc-500">
                {metric.completedVideos}/{metric.uploadedVideos}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function PipelineBar({
  label,
  value,
  total,
  tone,
}: {
  label: string;
  value: number;
  total: number;
  tone: "zinc" | "amber" | "emerald" | "rose";
}) {
  const width = total > 0 ? (value / total) * 100 : 0;
  const colorClass = {
    zinc: "bg-zinc-900",
    amber: "bg-amber-500",
    emerald: "bg-emerald-600",
    rose: "bg-rose-700",
  }[tone];

  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-medium text-zinc-700">{label}</span>
        <span className="text-zinc-500">{value}</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-100">
        <div
          className={`h-full rounded-full ${colorClass}`}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}

function PipelineHealth({
  pending,
  processing,
  completed,
  failed,
}: {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
}) {
  const total = pending + processing + completed + failed;

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="text-xl font-semibold text-zinc-950">Pipeline health</h2>
      <p className="mt-1 text-sm leading-6 text-zinc-600">
        Current render job status across every campaign.
      </p>
      <div className="mt-5 grid gap-4">
        <PipelineBar label="Pending" value={pending} total={total} tone="amber" />
        <PipelineBar
          label="Processing"
          value={processing}
          total={total}
          tone="zinc"
        />
        <PipelineBar
          label="Completed"
          value={completed}
          total={total}
          tone="emerald"
        />
        <PipelineBar label="Failed" value={failed} total={total} tone="rose" />
      </div>
    </section>
  );
}

function RecentCampaigns({
  campaigns,
}: {
  campaigns: Array<Campaign & { bookTitle: string; authorName: string }>;
}) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-xl font-semibold text-zinc-950">Recent campaigns</h2>
        <Link href="/campaigns" className="text-sm font-medium text-rose-700">
          View all
        </Link>
      </div>
      {campaigns.length > 0 ? (
        <ul className="mt-4 grid gap-3">
          {campaigns.map((campaign) => (
            <li key={campaign.id}>
              <Link
                href={`/campaigns/${campaign.id}`}
                className="block rounded-lg border border-zinc-200 bg-zinc-50 p-4 transition hover:border-rose-200 hover:bg-rose-50"
              >
                <p className="font-semibold text-zinc-950">{campaign.name}</p>
                <p className="mt-1 text-sm text-zinc-600">
                  {campaign.bookTitle} · {campaign.authorName}
                </p>
                <p className="mt-2 text-xs text-zinc-500">
                  Created {formatDate(campaign.created_at)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 rounded-lg border border-dashed border-zinc-300 p-5 text-sm text-zinc-500">
          No campaigns yet.
        </p>
      )}
    </section>
  );
}

export default function Home() {
  const authors = listAuthors();
  const books = listBooks();
  const campaigns = listCampaigns();
  const batches = campaigns.flatMap((campaign) =>
    listRenderBatchesByCampaign(campaign.id),
  );
  const jobs = campaigns.flatMap((campaign) => listRenderJobs(campaign.id));
  const completedJobs = jobs.filter((job) => job.status === "done");
  const uploadedJobs = completedJobs.filter(
    (job) => job.drive_file_id || job.drive_url,
  );
  const notUploadedJobs = completedJobs.filter(
    (job) => !job.drive_file_id && !job.drive_url,
  );
  const metricoolReadyCampaigns = campaigns.filter(
    (campaign) => campaign.metricool_sheet_id || campaign.metricool_sheet_url,
  );
  const pendingJobs = jobs.filter((job) => job.status === "pending").length;
  const processingJobs = jobs.filter((job) => job.status === "running").length;
  const failedJobs = jobs.filter((job) => job.status === "failed").length;
  const dayMetrics = buildDayMetrics(jobs);
  const recentCampaigns = sortByStringDateDescending(campaigns)
    .slice(0, 5)
    .map((campaign) => {
      const book = campaign.book_id ? getBook(campaign.book_id) : null;
      const author = book ? getAuthor(book.author_id) : null;

      return {
        ...campaign,
        bookTitle: book?.title ?? "Unlinked book",
        authorName: author?.name ?? "Unknown author",
      };
    });
  const recentBooks = sortByNumberDateDescending(books).slice(0, 4);

  return (
    <PageShell>
      <PageHeader
        title="BookTok Factory"
        eyebrow="Production dashboard"
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/authors/new"
              className="inline-flex rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
            >
              Create author
            </Link>
            <Link
              href="/campaigns/new"
              className="inline-flex rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
            >
              Create campaign
            </Link>
          </div>
        }
      >
        <p>
          A live snapshot of the local content factory: source library, render
          pipeline, Drive delivery, and Metricool readiness.
        </p>
      </PageHeader>

      <div className="grid gap-6">
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <StatCard
            label="Authors"
            value={authors.length}
            detail="Source workspaces"
          />
          <StatCard label="Books" value={books.length} detail="Reusable titles" />
          <StatCard
            label="Campaigns"
            value={campaigns.length}
            detail="Output containers"
          />
          <StatCard
            label="Batches"
            value={batches.length}
            detail="Production runs"
          />
          <StatCard
            label="Videos"
            value={completedJobs.length}
            detail={`${uploadedJobs.length} uploaded`}
          />
          <StatCard
            label="To upload"
            value={notUploadedJobs.length}
            detail={`${metricoolReadyCampaigns.length} Metricool Sheets`}
          />
        </section>

        <div className="grid gap-6 xl:grid-cols-[1.5fr_0.9fr]">
          <ProductionChart metrics={dayMetrics} />
          <PipelineHealth
            pending={pendingJobs}
            processing={processingJobs}
            completed={completedJobs.length}
            failed={failedJobs}
          />
        </div>

        <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
          <RecentCampaigns campaigns={recentCampaigns} />

          <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-xl font-semibold text-zinc-950">
                Source library
              </h2>
              <Link href="/books" className="text-sm font-medium text-rose-700">
                View books
              </Link>
            </div>
            {recentBooks.length > 0 ? (
              <ul className="mt-4 grid gap-3">
                {recentBooks.map((book) => {
                  const author = getAuthor(book.author_id);

                  return (
                    <li key={book.id}>
                      <Link
                        href={`/books/${book.id}`}
                        className="block rounded-lg border border-zinc-200 bg-zinc-50 p-4 transition hover:border-rose-200 hover:bg-rose-50"
                      >
                        <p className="font-semibold text-zinc-950">
                          {book.title}
                        </p>
                        <p className="mt-1 text-sm text-zinc-600">
                          {author?.name ?? "Unknown author"}
                        </p>
                        <p className="mt-2 text-xs text-zinc-500">
                          Added {formatDate(book.created_at)}
                        </p>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="mt-4 rounded-lg border border-dashed border-zinc-300 p-5">
                <p className="text-sm text-zinc-500">
                  No books yet. Create an author, then add books from the author
                  page.
                </p>
                <Link
                  href="/authors"
                  className="mt-3 inline-flex rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
                >
                  Open authors
                </Link>
              </div>
            )}
          </section>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Link
            href="/authors"
            className="rounded-xl border border-zinc-200 bg-white p-5 font-medium text-zinc-950 shadow-sm transition hover:border-rose-200 hover:shadow"
          >
            Authors
            <p className="mt-1 text-sm font-normal text-zinc-600">
              Manage author folders and series.
            </p>
          </Link>
          <Link
            href="/books"
            className="rounded-xl border border-zinc-200 bg-white p-5 font-medium text-zinc-950 shadow-sm transition hover:border-rose-200 hover:shadow"
          >
            Books
            <p className="mt-1 text-sm font-normal text-zinc-600">
              Browse covers, assets, and hooks.
            </p>
          </Link>
          <Link
            href="/campaigns"
            className="rounded-xl border border-zinc-200 bg-white p-5 font-medium text-zinc-950 shadow-sm transition hover:border-rose-200 hover:shadow"
          >
            Campaigns
            <p className="mt-1 text-sm font-normal text-zinc-600">
              Review batches, uploads, and exports.
            </p>
          </Link>
          <Link
            href="/audio"
            className="rounded-xl border border-zinc-200 bg-white p-5 font-medium text-zinc-950 shadow-sm transition hover:border-rose-200 hover:shadow"
          >
            Audio
            <p className="mt-1 text-sm font-normal text-zinc-600">
              Preview and reuse source audio.
            </p>
          </Link>
        </section>
      </div>
    </PageShell>
  );
}
