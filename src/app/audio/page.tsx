import { AudioImportPanel } from "@/components/audio-import-panel";
import { AudioLibraryTable } from "@/components/audio-library-table";
import { PageHeader, PageShell } from "@/components/page-shell";
import { listAllAudioAssets } from "@/lib/db";

export const dynamic = "force-dynamic";

export default function AudioPage() {
  const audioAssets = listAllAudioAssets();

  return (
    <PageShell>
      <PageHeader title="Audio Library" eyebrow="Global assets">
        <p>
          Reusable local audio assets for books and campaigns. Imports are
          stored without a campaign dependency.
        </p>
      </PageHeader>

      <section className="border-b border-zinc-200 pb-8">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">Import audio</h2>
          <span className="rounded-full border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-500">
            Global
          </span>
        </div>
        <AudioImportPanel />
      </section>

      <section className="py-8">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">Audio assets</h2>
          <span className="rounded-full border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-500">
            {audioAssets.length}
          </span>
        </div>
        <AudioLibraryTable audioAssets={audioAssets} />
      </section>
    </PageShell>
  );
}
