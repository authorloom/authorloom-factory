"use client";

import { useState } from "react";

import { SubmitButton } from "@/components/submit-button";
import type { AudioAsset } from "@/lib/db";

type RenderMatrixPanelProps = {
  audioAssets: AudioAsset[];
  backgroundCount: number;
  screenshotCount: number;
  hookCount: number;
  previewCount: number;
  action: (formData: FormData) => void;
};

export function RenderMatrixPanel({
  audioAssets,
  backgroundCount,
  screenshotCount,
  hookCount,
  previewCount,
  action,
}: RenderMatrixPanelProps) {
  const [selectedAudioId, setSelectedAudioId] = useState("none");
  const selectedAudio = audioAssets.find((audio) => audio.id === selectedAudioId);

  return (
    <form action={action} className="mt-4 grid gap-4">
      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-md border border-zinc-200 bg-white p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Backgrounds
          </p>
          <p className="mt-1 text-2xl font-semibold">{backgroundCount}</p>
        </div>
        <div className="rounded-md border border-zinc-200 bg-white p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Screenshots
          </p>
          <p className="mt-1 text-2xl font-semibold">{screenshotCount}</p>
        </div>
        <div className="rounded-md border border-zinc-200 bg-white p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Hooks
          </p>
          <p className="mt-1 text-2xl font-semibold">{hookCount}</p>
        </div>
        <div className="rounded-md border border-zinc-200 bg-white p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Preview
          </p>
          <p className="mt-1 text-2xl font-semibold">{previewCount}</p>
        </div>
      </div>

      <label className="grid gap-2">
        <span className="text-sm font-medium text-zinc-700">Selected audio</span>
        <select
          name="audioId"
          value={selectedAudioId}
          onChange={(event) => setSelectedAudioId(event.target.value)}
          className="min-h-11 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none focus:border-rose-700 focus:ring-2 focus:ring-rose-100"
        >
          <option value="none">No audio</option>
          {audioAssets.map((audio) => (
            <option key={audio.id} value={audio.id}>
              {audio.title}
            </option>
          ))}
        </select>
      </label>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <p className="text-sm leading-6 text-zinc-500">
          Selected: {selectedAudio ? selectedAudio.title : "No audio"}. This
          will create {previewCount} pending render jobs.
        </p>
        <SubmitButton
          disabled={previewCount === 0}
          pendingLabel="Generating..."
          savedLabel="Generated"
        >
          Generate jobs
        </SubmitButton>
      </div>
    </form>
  );
}
