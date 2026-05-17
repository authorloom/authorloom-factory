"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

type BookAssetUploadPanelProps = {
  bookId: string;
  assetType:
    | "backgrounds"
    | "covers"
    | "manuscripts"
    | "screenshots"
    | "thumbnails";
  label: string;
  accept: string;
  helpText: string;
};

export function BookAssetUploadPanel({
  bookId,
  assetType,
  label,
  accept,
  helpText,
}: BookAssetUploadPanelProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(null);
    setIsUploading(true);

    try {
      const response = await fetch(`/api/books/${assetType}/${bookId}`, {
        method: "POST",
        body: new FormData(event.currentTarget),
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Upload failed.");
      }

      formRef.current?.reset();
      setStatus("Uploaded.");
      router.refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="mt-4 grid gap-3">
      <label className="grid gap-2">
        <span className="text-sm font-medium text-zinc-700">{label}</span>
        <input
          name="file"
          type="file"
          accept={accept}
          required
          className="block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-800 file:mr-4 file:rounded-md file:border-0 file:bg-zinc-950 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-zinc-800"
        />
      </label>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-zinc-500">{helpText}</p>
        <button
          type="submit"
          disabled={isUploading}
          className="inline-flex min-h-10 items-center justify-center rounded-md bg-zinc-950 px-4 text-sm font-medium text-white transition hover:bg-zinc-800 active:translate-y-px active:bg-zinc-700 disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:text-zinc-500 disabled:active:translate-y-0"
        >
          {isUploading ? "Uploading..." : "Upload"}
        </button>
      </div>
      {status ? (
        <p className="text-sm font-medium text-zinc-700" aria-live="polite">
          {status}
        </p>
      ) : null}
    </form>
  );
}
