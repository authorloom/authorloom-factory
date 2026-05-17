"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

type AudioImportPanelProps = {
  campaignId?: string;
};

export function AudioImportPanel({ campaignId }: AudioImportPanelProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(null);
    setIsImporting(true);

    const formData = new FormData(event.currentTarget);
    const title = String(formData.get("title") ?? "");
    const sourceUrl = String(formData.get("sourceUrl") ?? "");

    try {
      const endpoint = campaignId ? `/api/audio/${campaignId}` : "/api/audio";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title, sourceUrl }),
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Audio import failed.");
      }

      formRef.current?.reset();
      setStatus("Audio imported.");
      router.refresh();
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Audio import failed.",
      );
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="mt-4 grid gap-4">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-2">
          <span className="text-sm font-medium text-zinc-700">Title</span>
          <input
            name="title"
            required
            className="min-h-11 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none focus:border-rose-700 focus:ring-2 focus:ring-rose-100"
          />
        </label>
        <label className="grid gap-2">
          <span className="text-sm font-medium text-zinc-700">Source URL</span>
          <input
            name="sourceUrl"
            type="url"
            required
            className="min-h-11 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none focus:border-rose-700 focus:ring-2 focus:ring-rose-100"
          />
        </label>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <p className="text-sm leading-6 text-zinc-500">
          Downloads the source locally with yt-dlp, then extracts .m4a audio
          with FFmpeg. Use a standard TikTok video URL; TikTok photo/carousel
          posts are not supported by the importer.
        </p>
        <button
          type="submit"
          disabled={isImporting}
          className="inline-flex min-h-10 items-center justify-center rounded-md bg-zinc-950 px-4 text-sm font-medium text-white transition hover:bg-zinc-800 active:translate-y-px active:bg-zinc-700 disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:text-zinc-500 disabled:active:translate-y-0"
        >
          {isImporting ? "Importing..." : "Import audio"}
        </button>
      </div>
      {status ? (
        <pre
          className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md border border-zinc-200 bg-white p-3 text-sm text-zinc-800"
          aria-live="polite"
        >
          {status}
        </pre>
      ) : null}
    </form>
  );
}
