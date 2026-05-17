"use client";

import { useRef, useState } from "react";

type DriveTestState =
  | { status: "idle" }
  | { status: "testing" }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

type BookDriveFolderPanelProps = {
  serviceAccountEmail: string | null;
  defaultDriveFolderUrl?: string | null;
};

export function BookDriveFolderPanel({
  serviceAccountEmail,
  defaultDriveFolderUrl,
}: BookDriveFolderPanelProps) {
  const driveFolderInputRef = useRef<HTMLInputElement>(null);
  const [copyLabel, setCopyLabel] = useState("Copy email");
  const [testState, setTestState] = useState<DriveTestState>({
    status: "idle",
  });

  async function copyEmail() {
    if (!serviceAccountEmail) {
      return;
    }

    await navigator.clipboard.writeText(serviceAccountEmail);
    setCopyLabel("Copied");
    window.setTimeout(() => setCopyLabel("Copy email"), 1600);
  }

  async function testConnection() {
    const driveFolderUrl = driveFolderInputRef.current?.value.trim() ?? "";

    if (!driveFolderUrl) {
      setTestState({
        status: "error",
        message: "Paste a Google Drive book folder URL first.",
      });
      return;
    }

    setTestState({ status: "testing" });

    try {
      const response = await fetch("/api/google/test-drive-folder", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ driveFolderUrl }),
      });
      const result = (await response.json()) as {
        ok?: boolean;
        name?: string;
        folderId?: string;
        error?: string;
      };

      if (!response.ok || !result.ok) {
        throw new Error(result.error ?? "Could not test Drive folder.");
      }

      setTestState({
        status: "success",
        message: `Connected to ${result.name ?? "Drive folder"} (${result.folderId}).`,
      });
    } catch (error) {
      setTestState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Could not test Drive folder.",
      });
    }
  }

  return (
    <section className="grid gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-4">
      <div>
        <h2 className="text-sm font-semibold text-zinc-900">
          Google Drive book folder
        </h2>
        <p className="mt-1 text-sm text-zinc-600">
          Share the book folder with the service account as Editor, then paste
          the folder URL here.
        </p>
      </div>

      <div className="grid gap-2 rounded-md border border-zinc-200 bg-white p-3">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Service account email
        </span>
        {serviceAccountEmail ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <code className="min-w-0 flex-1 break-all rounded bg-zinc-100 px-2 py-1 text-sm text-zinc-800">
              {serviceAccountEmail}
            </code>
            <button
              type="button"
              onClick={copyEmail}
              className="inline-flex min-h-9 items-center justify-center rounded-md border border-zinc-300 px-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 active:translate-y-px"
            >
              {copyLabel}
            </button>
          </div>
        ) : (
          <p className="text-sm text-amber-700">
            No service account email found. Set GOOGLE_CLIENT_EMAIL or
            GOOGLE_APPLICATION_CREDENTIALS.
          </p>
        )}
      </div>

      <label className="grid gap-2">
        <span className="text-sm font-medium text-zinc-800">
          Book Drive Folder URL
        </span>
        <input
          ref={driveFolderInputRef}
          name="driveFolderUrl"
          type="url"
          defaultValue={defaultDriveFolderUrl ?? ""}
          placeholder="https://drive.google.com/drive/folders/..."
          className="min-h-11 rounded-md border border-zinc-300 bg-white px-3 text-base outline-none focus:border-rose-700 focus:ring-2 focus:ring-rose-100"
          onChange={() => setTestState({ status: "idle" })}
        />
      </label>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={testConnection}
          disabled={testState.status === "testing"}
          className="inline-flex min-h-10 items-center justify-center rounded-md bg-zinc-950 px-4 text-sm font-medium text-white transition hover:bg-zinc-800 active:translate-y-px disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:text-zinc-500"
        >
          {testState.status === "testing" ? "Testing..." : "Test connection"}
        </button>
        {testState.status === "success" ? (
          <p className="text-sm font-medium text-emerald-700">
            {testState.message}
          </p>
        ) : null}
        {testState.status === "error" ? (
          <p className="text-sm font-medium text-red-700">
            {testState.message}
          </p>
        ) : null}
      </div>
    </section>
  );
}
