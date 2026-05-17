"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";

type BookCardItem = {
  id: string;
  title: string;
  authorName: string;
  seriesName: string | null;
  description: string | null;
  hasCover: boolean;
};

type BooksCardGridProps = {
  books: BookCardItem[];
};

function matchesSearch(book: BookCardItem, query: string) {
  const haystack = [book.title, book.authorName, book.seriesName ?? ""]
    .join(" ")
    .toLowerCase();

  return haystack.includes(query.toLowerCase());
}

function truncateDescription(description: string) {
  return description.length > 150
    ? `${description.slice(0, 147).trim()}...`
    : description;
}

export function BooksCardGrid({ books }: BooksCardGridProps) {
  const [query, setQuery] = useState("");
  const filteredBooks = useMemo(() => {
    const normalizedQuery = query.trim();

    if (!normalizedQuery) {
      return books;
    }

    return books.filter((book) => matchesSearch(book, normalizedQuery));
  }, [books, query]);

  return (
    <div className="grid gap-5">
      <label className="grid gap-2">
        <span className="text-sm font-medium text-zinc-700">Search books</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Book title, author, or series"
          className="min-h-11 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none focus:border-rose-700 focus:ring-2 focus:ring-rose-100"
        />
      </label>

      {filteredBooks.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {filteredBooks.map((book) => (
            <Link
              key={book.id}
              href={`/books/${book.id}`}
              className="group flex min-h-full flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm transition hover:border-zinc-300 hover:shadow"
            >
              <div className="aspect-[2/3] bg-zinc-100">
                {book.hasCover ? (
                  <Image
                    src={`/api/books/covers/${book.id}`}
                    alt={`${book.title} cover`}
                    width={480}
                    height={720}
                    unoptimized
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center px-4 text-center text-sm font-medium text-zinc-400">
                    No cover
                  </div>
                )}
              </div>
              <div className="flex flex-1 flex-col gap-2 p-4">
                <h2 className="text-base font-semibold leading-6 text-zinc-950 group-hover:text-rose-800">
                  {book.title}
                </h2>
                <p className="text-sm text-zinc-600">{book.authorName}</p>
                {book.seriesName ? (
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                    {book.seriesName}
                  </p>
                ) : null}
                {book.description ? (
                  <p className="mt-1 text-sm leading-6 text-zinc-600">
                    {truncateDescription(book.description)}
                  </p>
                ) : null}
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-zinc-300 bg-white p-5 text-sm text-zinc-500">
          No books match that search.
        </p>
      )}
    </div>
  );
}
