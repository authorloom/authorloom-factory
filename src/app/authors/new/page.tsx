import Link from "next/link";

import { createAuthorAction } from "@/app/authors/actions";
import { PageHeader, PageShell } from "@/components/page-shell";
import { SubmitButton } from "@/components/submit-button";

export default function NewAuthorPage() {
  return (
    <PageShell>
      <PageHeader title="New Author" eyebrow="Author setup">
        <p>Create an author record before adding reusable book assets.</p>
      </PageHeader>

      <form
        action={createAuthorAction}
        className="max-w-2xl rounded-lg border border-zinc-200 bg-white p-6 shadow-sm"
      >
        <label className="grid gap-2">
          <span className="text-sm font-medium text-zinc-800">
            Author name
          </span>
          <input
            name="name"
            required
            autoFocus
            className="min-h-11 rounded-md border border-zinc-300 px-3 text-base outline-none focus:border-rose-700 focus:ring-2 focus:ring-rose-100"
          />
        </label>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Link
            href="/authors"
            className="inline-flex min-h-10 items-center justify-center rounded-md border border-zinc-300 px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
          >
            Cancel
          </Link>
          <SubmitButton pendingLabel="Creating..." savedLabel="Created">
            Create author
          </SubmitButton>
        </div>
      </form>
    </PageShell>
  );
}
