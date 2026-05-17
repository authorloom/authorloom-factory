"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { AudioAsset } from "@/lib/db";

type AudioLibraryTableProps = {
  audioAssets: AudioAsset[];
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function AudioLibraryTable({ audioAssets }: AudioLibraryTableProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [previewAudioId, setPreviewAudioId] = useState<string | null>(null);
  const [statusByAudioId, setStatusByAudioId] = useState<Record<string, string>>(
    {},
  );
  const [deletingAudioId, setDeletingAudioId] = useState<string | null>(null);
  const [savingTagsAudioId, setSavingTagsAudioId] = useState<string | null>(null);
  const [tagInputByAudioId, setTagInputByAudioId] = useState<
    Record<string, string>
  >(() =>
    Object.fromEntries(
      audioAssets.map((audio) => [audio.id, audio.tags.join(", ")]),
    ),
  );

  async function deleteAudio(audioId: string) {
    setDeletingAudioId(audioId);
    setStatusByAudioId((current) => ({ ...current, [audioId]: "" }));

    try {
      const response = await fetch(`/api/audio/assets/${audioId}`, {
        method: "DELETE",
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Audio delete failed.");
      }

      if (previewAudioId === audioId) {
        setPreviewAudioId(null);
      }

      router.refresh();
    } catch (error) {
      setStatusByAudioId((current) => ({
        ...current,
        [audioId]:
          error instanceof Error ? error.message : "Audio delete failed.",
      }));
    } finally {
      setDeletingAudioId(null);
    }
  }

  async function saveTags(audioId: string) {
    setSavingTagsAudioId(audioId);
    setStatusByAudioId((current) => ({ ...current, [audioId]: "" }));

    try {
      const tags =
        tagInputByAudioId[audioId]
          ?.split(",")
          .map((tag) => tag.trim())
          .filter((tag) => tag.length > 0) ?? [];
      const response = await fetch(`/api/audio/assets/${audioId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ tags }),
      });
      const payload = (await response.json()) as {
        error?: string;
        tags?: string[];
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Audio tag update failed.");
      }

      setTagInputByAudioId((current) => ({
        ...current,
        [audioId]: payload.tags?.join(", ") ?? tags.join(", "),
      }));
      setStatusByAudioId((current) => ({
        ...current,
        [audioId]: "Tags saved.",
      }));
      router.refresh();
    } catch (error) {
      setStatusByAudioId((current) => ({
        ...current,
        [audioId]:
          error instanceof Error ? error.message : "Audio tag update failed.",
      }));
    } finally {
      setSavingTagsAudioId(null);
    }
  }

  if (audioAssets.length === 0) {
    return <p className="mt-4 text-sm text-zinc-500">No audio imported yet.</p>;
  }

  const filteredAudioAssets = audioAssets.filter((audio) => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return true;
    }

    return [audio.title, audio.filename, audio.source_url ?? "", ...audio.tags]
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery);
  });

  return (
    <div className="mt-4 grid gap-4">
      <label className="grid gap-2">
        <span className="text-sm font-medium text-zinc-700">
          Search audio by name
        </span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Track title"
          className="min-h-11 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none focus:border-rose-700 focus:ring-2 focus:ring-rose-100"
        />
      </label>

      {filteredAudioAssets.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-300 bg-white p-5 text-sm text-zinc-500">
          No audio tracks match that search.
        </p>
      ) : null}

      {filteredAudioAssets.map((audio) => {
        const isPreviewing = previewAudioId === audio.id;
        const status = statusByAudioId[audio.id];

        return (
          <article
            key={audio.id}
            className="rounded-lg border border-zinc-200 bg-white p-4"
          >
            <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-start">
              <div className="min-w-0">
                <h3 className="font-medium text-zinc-950">{audio.title}</h3>
                <dl className="mt-3 grid gap-2 text-sm md:grid-cols-2">
                  <div>
                    <dt className="font-medium text-zinc-500">Filename</dt>
                    <dd className="mt-1 break-all text-zinc-900">
                      {audio.filename}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-medium text-zinc-500">Imported</dt>
                    <dd className="mt-1 text-zinc-900">
                      {formatDate(audio.created_at)}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-medium text-zinc-500">Scope</dt>
                    <dd className="mt-1 text-zinc-900">
                      {audio.campaign_id ? "Campaign" : "Global"}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-medium text-zinc-500">Source URL</dt>
                    <dd className="mt-1 break-all text-zinc-900">
                      {audio.source_url ?? "Not set"}
                    </dd>
                  </div>
                </dl>
                {audio.tags.length > 0 ? (
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {audio.tags.map((tag) => (
                      <li
                        key={tag}
                        className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs font-medium text-zinc-600"
                      >
                        {tag}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>

              <div className="flex flex-wrap gap-2 lg:justify-end">
                <button
                  type="button"
                  onClick={() =>
                    setPreviewAudioId(isPreviewing ? null : audio.id)
                  }
                  className="inline-flex min-h-10 items-center justify-center rounded-md border border-zinc-300 px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
                >
                  {isPreviewing ? "Hide preview" : "Preview"}
                </button>
                <button
                  type="button"
                  onClick={() => void deleteAudio(audio.id)}
                  disabled={deletingAudioId === audio.id}
                  className="inline-flex min-h-10 items-center justify-center rounded-md border border-red-200 px-4 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:text-red-300"
                >
                  {deletingAudioId === audio.id ? "Deleting..." : "Delete"}
                </button>
              </div>
            </div>

            {isPreviewing ? (
              <audio
                controls
                preload="metadata"
                className="mt-4 w-full"
                src={`/api/audio/assets/${audio.id}`}
              />
            ) : null}

            <div className="mt-4 grid gap-2 rounded-md border border-zinc-200 bg-zinc-50 p-3">
              <label className="grid gap-2">
                <span className="text-sm font-medium text-zinc-700">
                  Tags
                </span>
                <input
                  value={tagInputByAudioId[audio.id] ?? ""}
                  onChange={(event) =>
                    setTagInputByAudioId((current) => ({
                      ...current,
                      [audio.id]: event.target.value,
                    }))
                  }
                  placeholder="dark, emotional, spicy, funny"
                  className="min-h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none focus:border-rose-700 focus:ring-2 focus:ring-rose-100"
                />
              </label>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => void saveTags(audio.id)}
                  disabled={savingTagsAudioId === audio.id}
                  className="inline-flex min-h-9 items-center justify-center rounded-md border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:text-zinc-300"
                >
                  {savingTagsAudioId === audio.id ? "Saving..." : "Save tags"}
                </button>
              </div>
            </div>

            {status ? (
              <p
                className={`mt-3 text-sm font-medium ${
                  status === "Tags saved." ? "text-emerald-700" : "text-red-700"
                }`}
                aria-live="polite"
              >
                {status}
              </p>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
