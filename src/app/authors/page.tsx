import Link from "next/link";

import { AuthorsSearchList } from "@/components/authors-search-list";
import { PageHeader, PageShell } from "@/components/page-shell";
import {
  listAuthors,
  listBooksByAuthor,
  listCampaigns,
  listSeriesByAuthor,
} from "@/lib/db";

export const dynamic = "force-dynamic";

export default function AuthorsPage() {
  const campaigns = listCampaigns();
  const authors = listAuthors().map((author) => ({
    id: author.id,
    name: author.name,
    slug: author.slug,
    hasDriveFolder: Boolean(author.drive_folder_id || author.drive_folder_url),
    seriesCount: listSeriesByAuthor(author.id).length,
    books: listBooksByAuthor(author.id),
  })).map((author) => ({
    id: author.id,
    name: author.name,
    slug: author.slug,
    hasDriveFolder: author.hasDriveFolder,
    seriesCount: author.seriesCount,
    bookCount: author.books.length,
    campaignCount: campaigns.filter((campaign) =>
      author.books.some((book) => book.id === campaign.book_id),
    ).length,
  }));

  return (
    <PageShell>
      <PageHeader
        title="Authors"
        eyebrow="Author library"
        action={
          <Link
            href="/authors/new"
            className="inline-flex rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
          >
            Create author
          </Link>
        }
      >
        <p>
          Browse author workspaces, source libraries, and campaign activity.
        </p>
      </PageHeader>

      {authors.length > 0 ? (
        <AuthorsSearchList authors={authors} />
      ) : (
        <section className="rounded-lg border border-dashed border-zinc-300 bg-white p-8">
          <h2 className="text-lg font-semibold">No authors yet</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">
            Create a book to create its author record for the local source library.
          </p>
          <Link
            href="/authors/new"
            className="mt-5 inline-flex rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
          >
            Create author
          </Link>
        </section>
      )}
    </PageShell>
  );
}
