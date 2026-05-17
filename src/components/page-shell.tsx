import Link from "next/link";

type PageShellProps = {
  children: React.ReactNode;
};

export function PageShell({ children }: PageShellProps) {
  return (
    <div className="min-h-screen bg-stone-50 text-zinc-950">
      <header className="border-b border-zinc-200 bg-white">
        <nav className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-sm font-semibold tracking-wide">
            BookTok Factory
          </Link>
          <div className="flex items-center gap-2 text-sm">
            <Link
              href="/authors"
              className="rounded-md px-3 py-2 text-zinc-700 hover:bg-zinc-100 hover:text-zinc-950"
            >
              Authors
            </Link>
            <Link
              href="/books"
              className="rounded-md px-3 py-2 text-zinc-700 hover:bg-zinc-100 hover:text-zinc-950"
            >
              Books
            </Link>
            <Link
              href="/campaigns"
              className="rounded-md px-3 py-2 text-zinc-700 hover:bg-zinc-100 hover:text-zinc-950"
            >
              Campaigns
            </Link>
            <Link
              href="/audio"
              className="rounded-md px-3 py-2 text-zinc-700 hover:bg-zinc-100 hover:text-zinc-950"
            >
              Audio
            </Link>
          </div>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-6xl px-6 py-10">{children}</main>
    </div>
  );
}

type PageHeaderProps = {
  title: string;
  eyebrow?: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
};

export function PageHeader({
  title,
  eyebrow,
  children,
  action,
}: PageHeaderProps) {
  return (
    <div className="mb-8 flex flex-col gap-5 border-b border-zinc-200 pb-8 md:flex-row md:items-end md:justify-between">
      <div className="max-w-3xl">
        {eyebrow ? (
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-rose-700">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 md:text-4xl">
          {title}
        </h1>
        {children ? (
          <div className="mt-3 text-base leading-7 text-zinc-600">
            {children}
          </div>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
