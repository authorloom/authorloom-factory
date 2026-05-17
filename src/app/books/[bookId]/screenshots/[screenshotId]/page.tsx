import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader, PageShell } from "@/components/page-shell";
import { SubmitButton } from "@/components/submit-button";
import {
  getBook,
  getBookScreenshot,
  listBookHooks,
} from "@/lib/db";

import { addBookHooksAction, deleteBookHookAction } from "../../actions";

export const dynamic = "force-dynamic";

type ScreenshotDetailPageProps = {
  params: Promise<{
    bookId: string;
    screenshotId: string;
  }>;
};

export default async function ScreenshotDetailPage({
  params,
}: ScreenshotDetailPageProps) {
  const { bookId, screenshotId } = await params;
  const book = getBook(bookId);

  if (!book) {
    notFound();
  }

  const screenshot = getBookScreenshot(book.id, screenshotId);

  if (!screenshot) {
    notFound();
  }

  const hooks = listBookHooks(book.id).filter(
    (hook) => hook.screenshot_id === screenshot.id,
  );

  return (
    <PageShell>
      <PageHeader
        title={screenshot.filename}
        eyebrow={`${book.title} screenshot`}
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/books/${book.id}/screenshots`}
              className="inline-flex rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
            >
              Back to screenshots
            </Link>
            <Link
              href={`/books/${book.id}`}
              className="inline-flex rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
            >
              Back to book
            </Link>
          </div>
        }
      >
        <p className="break-all">{screenshot.filepath}</p>
      </PageHeader>

      <div className="grid gap-8 lg:grid-cols-[minmax(260px,420px)_1fr]">
        <section>
          <h2 className="text-lg font-semibold">Preview</h2>
          <div className="mt-4 overflow-hidden rounded-lg border border-zinc-200 bg-white">
            <Image
              src={`/api/books/screenshots/${book.id}?screenshotId=${screenshot.id}`}
              alt={screenshot.filename}
              width={840}
              height={1120}
              unoptimized
              className="h-auto w-full object-contain"
            />
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-lg font-semibold">Hooks</h2>
            <span className="rounded-full border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-500">
              {hooks.length}
            </span>
          </div>

          <form
            action={addBookHooksAction.bind(null, book.id, screenshot.id)}
            className="mt-4 grid gap-3 rounded-lg border border-zinc-200 bg-white p-4"
          >
            <label className="grid gap-2">
              <span className="text-sm font-medium text-zinc-700">
                Paste hooks
              </span>
              <textarea
                name="hooks"
                rows={6}
                placeholder="One hook per line"
                className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm leading-6 text-zinc-900 outline-none focus:border-rose-700 focus:ring-2 focus:ring-rose-100"
              />
            </label>
            <div className="flex justify-end">
              <SubmitButton>
                Save hooks
              </SubmitButton>
            </div>
          </form>

          {hooks.length > 0 ? (
            <ul className="mt-4 grid gap-2">
              {hooks.map((hook) => (
                <li
                  key={hook.id}
                  className="flex flex-col gap-3 rounded-md border border-zinc-200 bg-white p-3 sm:flex-row sm:items-start sm:justify-between"
                >
                  <p className="text-sm leading-6 text-zinc-900">
                    {hook.text}
                  </p>
                  <form
                    action={deleteBookHookAction.bind(
                      null,
                      book.id,
                      hook.id,
                      screenshot.id,
                    )}
                  >
                    <SubmitButton
                      pendingLabel="Deleting..."
                      savedLabel="Deleted"
                      className="inline-flex min-h-9 items-center justify-center rounded-md border border-zinc-300 px-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 active:translate-y-px active:bg-zinc-200 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-400 disabled:active:translate-y-0"
                    >
                      Delete
                    </SubmitButton>
                  </form>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-zinc-500">
              No hooks saved for this screenshot yet.
            </p>
          )}
        </section>
      </div>
    </PageShell>
  );
}
