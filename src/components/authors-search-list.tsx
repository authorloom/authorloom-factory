"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type AuthorListItem = {
  id: string;
  name: string;
  slug: string;
  hasDriveFolder: boolean;
  seriesCount: number;
  bookCount: number;
  campaignCount: number;
};

type AuthorsSearchListProps = {
  authors: AuthorListItem[];
};

function formatCount(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function AuthorsSearchList({ authors }: AuthorsSearchListProps) {
  const [query, setQuery] = useState("");
  const filteredAuthors = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return authors;
    }

    return authors.filter((author) =>
      author.name.toLowerCase().includes(normalizedQuery),
    );
  }, [authors, query]);

  return (
    <div className="grid gap-4">
      <label className="grid gap-2">
        <span className="text-sm font-medium text-zinc-700">
          Search authors
        </span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Author name"
          className="min-h-11 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none focus:border-rose-700 focus:ring-2 focus:ring-rose-100"
        />
      </label>

      {filteredAuthors.length > 0 ? (
        <div className="grid gap-3">
          {filteredAuthors.map((author) => (
            <Link
              key={author.id}
              href={`/authors/${author.id}`}
              className="group grid gap-4 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm transition hover:border-rose-200 hover:shadow-md md:grid-cols-[1.5fr_3fr] md:items-center"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold text-zinc-950 group-hover:text-rose-800">
                    {author.name}
                  </h2>
                  <span
                    className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                      author.hasDriveFolder
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-amber-200 bg-amber-50 text-amber-700"
                    }`}
                  >
                    {author.hasDriveFolder ? "Drive connected" : "Drive needed"}
                  </span>
                </div>
                <p className="mt-1 font-mono text-xs text-zinc-500">
                  {author.slug}
                </p>
              </div>

              <dl className="grid grid-cols-3 gap-2 text-sm">
                <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2">
                  <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                    Series
                  </dt>
                  <dd className="mt-1 font-semibold text-zinc-950">
                    {formatCount(author.seriesCount, "series", "series")}
                  </dd>
                </div>
                <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2">
                  <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                    Books
                  </dt>
                  <dd className="mt-1 font-semibold text-zinc-950">
                    {formatCount(author.bookCount, "book", "books")}
                  </dd>
                </div>
                <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2">
                  <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                    Campaigns
                  </dt>
                  <dd className="mt-1 font-semibold text-zinc-950">
                    {formatCount(
                      author.campaignCount,
                      "campaign",
                      "campaigns",
                    )}
                  </dd>
                </div>
              </dl>

            </Link>
          ))}
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-zinc-300 bg-white p-5 text-sm text-zinc-500">
          No authors match that search.
        </p>
      )}
    </div>
  );
}
