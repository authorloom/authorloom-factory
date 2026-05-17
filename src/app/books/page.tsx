import { BooksCardGrid } from "@/components/books-card-grid";
import { PageHeader, PageShell } from "@/components/page-shell";
import { getAuthor, getSeries, listBooks } from "@/lib/db";

export const dynamic = "force-dynamic";

export default function BooksPage() {
  const books = listBooks().map((book) => {
    const author = getAuthor(book.author_id);
    const series = book.series_id ? getSeries(book.series_id) : null;

    return {
      id: book.id,
      title: book.title,
      authorName: author?.name ?? "Unknown author",
      seriesName: series?.name ?? null,
      description: book.description,
      hasCover: Boolean(book.cover_filepath),
    };
  });

  return (
    <PageShell>
      <PageHeader
        title="Books"
        eyebrow="Source library"
      >
        <p>
          Browse reusable book source records. Add new books from an author page
          so the correct author and Drive folder are already selected.
        </p>
      </PageHeader>

      {books.length > 0 ? (
        <BooksCardGrid books={books} />
      ) : (
        <section className="rounded-lg border border-dashed border-zinc-300 bg-white p-8">
          <h2 className="text-lg font-semibold">No books yet</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">
            Create an author first, then add books from the author page so the
            app can place each book in the right Drive workspace.
          </p>
        </section>
      )}
    </PageShell>
  );
}
