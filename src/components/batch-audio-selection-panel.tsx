"use client";

import { useMemo, useState } from "react";

import { SubmitButton } from "@/components/submit-button";
import type { AudioAsset } from "@/lib/db";

type BatchAudioSelectionPanelProps = {
  audioAssets: AudioAsset[];
  selectedIds: string[];
  durationOverrides: Record<string, number | null>;
  action: (formData: FormData) => void | Promise<void>;
};

function matchesAudioSearch(audio: AudioAsset, query: string) {
  const haystack = [
    audio.title,
    audio.source_url ?? "",
    audio.filename,
    audio.filepath,
    ...audio.tags,
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(query.toLowerCase());
}

function AudioPreview({ audio }: { audio: AudioAsset }) {
  return (
    <audio
      controls
      preload="metadata"
      className="h-9 w-full max-w-[240px]"
      src={`/api/audio/assets/${audio.id}`}
    />
  );
}

function AudioTags({ tags }: { tags: string[] }) {
  if (tags.length === 0) {
    return null;
  }

  return (
    <ul className="mt-2 flex flex-wrap gap-1">
      {tags.map((tag) => (
        <li
          key={tag}
          className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[11px] font-medium text-zinc-600"
        >
          {tag}
        </li>
      ))}
    </ul>
  );
}

export function BatchAudioSelectionPanel({
  audioAssets,
  selectedIds,
  durationOverrides,
  action,
}: BatchAudioSelectionPanelProps) {
  const [query, setQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState("");
  const [selectedAudioIds, setSelectedAudioIds] = useState(() =>
    Array.from(new Set(selectedIds)),
  );
  const selectedIdSet = useMemo(
    () => new Set(selectedAudioIds),
    [selectedAudioIds],
  );
  const selectedAudio = audioAssets.filter((audio) => selectedIdSet.has(audio.id));
  const availableTags = useMemo(
    () =>
      Array.from(new Set(audioAssets.flatMap((audio) => audio.tags))).sort(
        (a, b) => a.localeCompare(b),
      ),
    [audioAssets],
  );
  const availableAudio = audioAssets
    .filter((audio) => !selectedIdSet.has(audio.id))
    .filter((audio) => matchesAudioSearch(audio, query))
    .filter((audio) => !selectedTag || audio.tags.includes(selectedTag));
  const visibleAvailableAudio = availableAudio.slice(0, 25);

  function addAudio(audioId: string) {
    setSelectedAudioIds((current) =>
      current.includes(audioId) ? current : [...current, audioId],
    );
  }

  function removeAudio(audioId: string) {
    setSelectedAudioIds((current) => current.filter((id) => id !== audioId));
  }

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold">Audio</h2>
        <span className="rounded-full border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-500">
          {selectedAudioIds.length} selected
        </span>
      </div>

      <form action={action} className="mt-4 grid gap-5">
        {selectedAudioIds.map((audioId) => (
          <input key={audioId} type="hidden" name="assetIds" value={audioId} />
        ))}

        <div className="grid gap-3 md:grid-cols-[1fr_240px]">
          <label className="grid gap-2">
            <span className="text-sm font-medium text-zinc-800">
              Search available audio
            </span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter by title, tag, source URL, or filename"
              className="min-h-11 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none focus:border-rose-700 focus:ring-2 focus:ring-rose-100"
            />
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-medium text-zinc-800">
              Filter by tag
            </span>
            <select
              value={selectedTag}
              onChange={(event) => setSelectedTag(event.target.value)}
              className="min-h-11 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none focus:border-rose-700 focus:ring-2 focus:ring-rose-100"
            >
              <option value="">All tags</option>
              {availableTags.map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid gap-3">
          <div className="flex items-center justify-between gap-4">
            <h3 className="text-sm font-semibold text-zinc-800">
              Available audio
            </h3>
            <span className="text-xs text-zinc-500">
              Showing {visibleAvailableAudio.length} of {availableAudio.length}
            </span>
          </div>

          {visibleAvailableAudio.length > 0 ? (
            <ul className="max-h-[460px] overflow-auto rounded-md border border-zinc-200">
              {visibleAvailableAudio.map((audio) => (
                <li
                  key={audio.id}
                  className="grid gap-3 border-b border-zinc-200 p-3 last:border-b-0 md:grid-cols-[minmax(0,1fr)_240px_auto] md:items-center"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-zinc-900">
                      {audio.title}
                    </p>
                    <AudioTags tags={audio.tags} />
                  </div>
                  <AudioPreview audio={audio} />
                  <button
                    type="button"
                    onClick={() => addAudio(audio.id)}
                    className="inline-flex min-h-9 items-center justify-center rounded-md bg-zinc-950 px-3 text-sm font-medium text-white transition hover:bg-zinc-800 active:translate-y-px active:bg-zinc-700"
                  >
                    Add
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-md border border-dashed border-zinc-300 p-3 text-sm text-zinc-500">
              No available audio matches the current filter.
            </p>
          )}
        </div>

        <div className="grid gap-3">
          <h3 className="text-sm font-semibold text-zinc-800">
            Selected audio
          </h3>
          {selectedAudio.length > 0 ? (
            <ul className="grid gap-2">
              {selectedAudio.map((audio) => (
                <li
                  key={audio.id}
                  className="grid gap-3 rounded-md border border-zinc-200 bg-zinc-50 p-3 md:grid-cols-[minmax(0,1fr)_180px_240px_auto] md:items-center"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-zinc-900">
                      {audio.title}
                    </p>
                    <AudioTags tags={audio.tags} />
                  </div>
                  <label className="grid gap-1">
                    <span className="text-xs font-medium text-zinc-600">
                      Video length override
                    </span>
                    <input
                      name={`renderDurationSeconds:${audio.id}`}
                      type="number"
                      min="1"
                      max="60"
                      step="0.1"
                      defaultValue={durationOverrides[audio.id] ?? ""}
                      placeholder="Default"
                      className="min-h-9 rounded-md border border-zinc-300 bg-white px-2 text-sm text-zinc-900 outline-none focus:border-rose-700 focus:ring-2 focus:ring-rose-100"
                    />
                    <span className="text-[11px] text-zinc-500">seconds</span>
                  </label>
                  <AudioPreview audio={audio} />
                  <button
                    type="button"
                    onClick={() => removeAudio(audio.id)}
                    className="inline-flex min-h-9 items-center justify-center rounded-md border border-zinc-300 px-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 active:translate-y-px active:bg-zinc-200"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-md border border-dashed border-zinc-300 p-3 text-sm text-zinc-500">
              No audio selected. This batch will generate no-audio jobs unless
              audio is added.
            </p>
          )}
        </div>

        <div className="flex justify-end">
          <SubmitButton>Save audio</SubmitButton>
        </div>
      </form>
    </section>
  );
}
