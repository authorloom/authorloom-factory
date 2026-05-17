"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type CampaignCard = {
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
};

type CampaignGroup = {
  authorName: string;
  books: Array<{
    bookTitle: string;
    seriesName: string | null;
    campaigns: CampaignCard[];
  }>;
};

type CampaignsGroupedListProps = {
  groups: CampaignGroup[];
  legacyCampaigns: CampaignCard[];
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatCount(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function matchesCampaign(campaign: CampaignCard, query: string) {
  const haystack = [
    campaign.name,
    campaign.bookTitle ?? "",
    campaign.authorName ?? "",
    campaign.seriesName ?? "",
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(query.toLowerCase());
}

function CampaignRow({ campaign }: { campaign: CampaignCard }) {
  const needsUpload = campaign.notUploadedCount > 0;
  const hasIssues = campaign.failedCount > 0;
  const isReadyForSheet =
    campaign.completedCount > 0 && campaign.notUploadedCount === 0;

  return (
    <Link
      href={`/campaigns/${campaign.id}`}
      className="group block rounded-lg border border-zinc-200 bg-white p-4 shadow-sm transition hover:border-rose-200 hover:shadow-md"
    >
      <div className="grid gap-4 xl:grid-cols-[1.25fr_2fr] xl:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-lg font-semibold text-zinc-950 group-hover:text-rose-800">
              {campaign.name}
            </h4>
            <span
              className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                campaign.driveConnected
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-amber-200 bg-amber-50 text-amber-700"
              }`}
            >
              {campaign.driveConnected ? "Drive connected" : "Drive needed"}
            </span>
            {hasIssues ? (
              <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700">
                Render failures
              </span>
            ) : null}
          </div>
          {campaign.description ? (
            <p className="mt-1 text-sm leading-6 text-zinc-600">
              {campaign.description}
            </p>
          ) : null}
          {campaign.goal ? (
            <p className="mt-2 text-sm leading-6 text-zinc-600">
              <span className="font-medium text-zinc-800">Goal:</span>{" "}
              {campaign.goal}
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-500">
            <span>Created {formatDate(campaign.createdAt)}</span>
            {campaign.latestBatchName ? (
              <span>Latest batch: {campaign.latestBatchName}</span>
            ) : (
              <span>No batches yet</span>
            )}
          </div>
        </div>

        <div className="grid gap-3">
          <dl className="grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
            <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2">
              <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Batches
              </dt>
              <dd className="mt-1 font-semibold text-zinc-950">
                {campaign.batchCount}
              </dd>
            </div>
            <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2">
              <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Jobs
              </dt>
              <dd className="mt-1 font-semibold text-zinc-950">
                {campaign.jobCount}
              </dd>
            </div>
            <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2">
              <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Completed
              </dt>
              <dd className="mt-1 font-semibold text-zinc-950">
                {campaign.completedCount}
              </dd>
            </div>
            <div
              className={`rounded-md border px-3 py-2 ${
                needsUpload
                  ? "border-amber-200 bg-amber-50"
                  : "border-zinc-200 bg-zinc-50"
              }`}
            >
              <dt
                className={`text-xs font-medium uppercase tracking-wide ${
                  needsUpload ? "text-amber-700" : "text-zinc-500"
                }`}
              >
                Not uploaded
              </dt>
              <dd
                className={`mt-1 font-semibold ${
                  needsUpload ? "text-amber-900" : "text-zinc-950"
                }`}
              >
                {campaign.notUploadedCount}
              </dd>
            </div>
          </dl>

          <div className="grid gap-2 text-xs text-zinc-600 md:grid-cols-3">
            <div className="rounded-md border border-zinc-200 bg-white px-3 py-2">
              <span className="font-medium text-zinc-800">Queue:</span>{" "}
              {formatCount(campaign.pendingCount, "pending", "pending")},{" "}
              {formatCount(
                campaign.processingCount,
                "processing",
                "processing",
              )}
            </div>
            <div className="rounded-md border border-zinc-200 bg-white px-3 py-2">
              <span className="font-medium text-zinc-800">Drive:</span>{" "}
              {formatCount(campaign.uploadedCount, "uploaded", "uploaded")}
              {campaign.finalVideosReady ? ", folder ready" : ", no output folder"}
            </div>
            <div
              className={`rounded-md border px-3 py-2 ${
                isReadyForSheet || campaign.metricoolSheetReady
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-zinc-200 bg-white"
              }`}
            >
              <span className="font-medium">Metricool:</span>{" "}
              {campaign.metricoolSheetReady
                ? "Sheet connected"
                : isReadyForSheet
                  ? "Ready to export"
                  : "Waiting for uploads"}
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}

export function CampaignsGroupedList({
  groups,
  legacyCampaigns,
}: CampaignsGroupedListProps) {
  const [query, setQuery] = useState("");
  const filteredGroups = useMemo(() => {
    const normalizedQuery = query.trim();

    if (!normalizedQuery) {
      return groups;
    }

    return groups
      .map((group) => ({
        ...group,
        books: group.books
          .map((book) => ({
            ...book,
            campaigns: book.campaigns.filter((campaign) =>
              matchesCampaign(campaign, normalizedQuery),
            ),
          }))
          .filter((book) => book.campaigns.length > 0),
      }))
      .filter((group) => group.books.length > 0);
  }, [groups, query]);
  const filteredLegacyCampaigns = useMemo(() => {
    const normalizedQuery = query.trim();

    if (!normalizedQuery) {
      return legacyCampaigns;
    }

    return legacyCampaigns.filter((campaign) =>
      matchesCampaign(campaign, normalizedQuery),
    );
  }, [legacyCampaigns, query]);

  return (
    <div className="grid gap-6">
      <label className="grid gap-2">
        <span className="text-sm font-medium text-zinc-700">
          Search campaigns
        </span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Campaign, book, author, or series"
          className="min-h-11 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none focus:border-rose-700 focus:ring-2 focus:ring-rose-100"
        />
      </label>

      {filteredGroups.map((group) => (
        <section key={group.authorName} className="grid gap-4">
          <h2 className="text-xl font-semibold text-zinc-950">
            {group.authorName}
          </h2>
          <div className="grid gap-4">
            {group.books.map((book) => (
              <article
                key={`${group.authorName}-${book.bookTitle}`}
                className="rounded-lg border border-zinc-200 bg-zinc-50 p-4"
              >
                <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
                  <h3 className="text-lg font-semibold text-zinc-950">
                    {book.bookTitle}
                  </h3>
                  {book.seriesName ? (
                    <p className="text-sm text-zinc-500">{book.seriesName}</p>
                  ) : null}
                </div>
                <div className="mt-4 grid gap-3">
                  {book.campaigns.map((campaign) => (
                    <CampaignRow key={campaign.id} campaign={campaign} />
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}

      {filteredLegacyCampaigns.length > 0 ? (
        <section className="grid gap-4">
          <h2 className="text-xl font-semibold text-zinc-950">
            Legacy / unlinked campaigns
          </h2>
          <div className="grid gap-3">
            {filteredLegacyCampaigns.map((campaign) => (
              <CampaignRow key={campaign.id} campaign={campaign} />
            ))}
          </div>
        </section>
      ) : null}

      {filteredGroups.length === 0 && filteredLegacyCampaigns.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-300 bg-white p-5 text-sm text-zinc-500">
          No campaigns match that search.
        </p>
      ) : null}
    </div>
  );
}
