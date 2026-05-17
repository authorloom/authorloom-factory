import Link from "next/link";

import { CampaignsGroupedList } from "@/components/campaigns-grouped-list";
import { PageHeader, PageShell } from "@/components/page-shell";
import {
  getAuthor,
  getBook,
  getSeries,
  listCampaigns,
  listRenderBatchesByCampaign,
  listRenderJobs,
} from "@/lib/db";

export const dynamic = "force-dynamic";

export default function CampaignsPage() {
  const campaigns = listCampaigns();
  const groupedCampaigns = new Map<
    string,
    {
      authorName: string;
      books: Map<
        string,
        {
          bookTitle: string;
          seriesName: string | null;
          campaigns: Array<{
            id: string;
            name: string;
            description: string | null;
            createdAt: string;
            bookTitle: string | null;
            authorName: string | null;
            seriesName: string | null;
            goal: string | null;
            driveConnected: boolean;
            finalVideosReady: boolean;
            metricoolSheetReady: boolean;
            batchCount: number;
            jobCount: number;
            pendingCount: number;
            processingCount: number;
            completedCount: number;
            failedCount: number;
            uploadedCount: number;
            notUploadedCount: number;
            latestBatchName: string | null;
          }>;
        }
      >;
    }
  >();
  const legacyCampaigns = [];

  for (const campaign of campaigns) {
    const book = campaign.book_id ? getBook(campaign.book_id) : null;
    const author = book ? getAuthor(book.author_id) : null;
    const series = book?.series_id ? getSeries(book.series_id) : null;
    const batches = listRenderBatchesByCampaign(campaign.id);
    const jobs = listRenderJobs(campaign.id);
    const completedJobs = jobs.filter((job) => job.status === "done");
    const campaignCard = {
      id: campaign.id,
      name: campaign.name,
      description: campaign.description,
      createdAt: campaign.created_at,
      bookTitle: book?.title ?? null,
      authorName: author?.name ?? null,
      seriesName: series?.name ?? null,
      goal: campaign.goal,
      driveConnected: Boolean(
        campaign.drive_campaign_folder_id || campaign.drive_campaign_folder_url,
      ),
      finalVideosReady: Boolean(campaign.drive_final_videos_folder_id),
      metricoolSheetReady: Boolean(campaign.metricool_sheet_id),
      batchCount: batches.length,
      jobCount: jobs.length,
      pendingCount: jobs.filter((job) => job.status === "pending").length,
      processingCount: jobs.filter((job) => job.status === "running").length,
      completedCount: completedJobs.length,
      failedCount: jobs.filter((job) => job.status === "failed").length,
      uploadedCount: completedJobs.filter(
        (job) => job.drive_file_id || job.drive_url,
      ).length,
      notUploadedCount: completedJobs.filter(
        (job) => !job.drive_file_id && !job.drive_url,
      ).length,
      latestBatchName: batches[0]?.name ?? null,
    };

    if (!book || !author) {
      legacyCampaigns.push(campaignCard);
      continue;
    }

    const authorGroup = groupedCampaigns.get(author.id) ?? {
      authorName: author.name,
      books: new Map(),
    };
    const bookGroup = authorGroup.books.get(book.id) ?? {
      bookTitle: book.title,
      seriesName: series?.name ?? null,
      campaigns: [],
    };

    bookGroup.campaigns.push(campaignCard);
    authorGroup.books.set(book.id, bookGroup);
    groupedCampaigns.set(author.id, authorGroup);
  }
  const groups = Array.from(groupedCampaigns.values()).map((group) => ({
    authorName: group.authorName,
    books: Array.from(group.books.values()),
  }));

  return (
    <PageShell>
      <PageHeader
        title="Campaigns"
        eyebrow="Local workspace"
        action={
          <Link
            href="/campaigns/new"
            className="inline-flex rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
          >
            Create campaign
          </Link>
        }
      >
        <p>
          Manage local BookTok production campaigns, source links, and the
          workspace that later tickets will fill in.
        </p>
      </PageHeader>

      {campaigns.length > 0 ? (
        <CampaignsGroupedList
          groups={groups}
          legacyCampaigns={legacyCampaigns}
        />
      ) : (
        <section className="rounded-lg border border-dashed border-zinc-300 bg-white p-8">
          <h2 className="text-lg font-semibold">No campaigns yet</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">
            Create the first local campaign to start building the content
            factory workflow.
          </p>
          <Link
            href="/campaigns/new"
            className="mt-5 inline-flex rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
          >
            Create campaign
          </Link>
        </section>
      )}
    </PageShell>
  );
}
