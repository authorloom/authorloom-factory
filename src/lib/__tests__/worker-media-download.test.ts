import assert from "node:assert/strict";
import test from "node:test";

import {
  downloadWithDriveFallback,
  extensionForContentType,
  filenameForCanonicalContentType,
} from "../worker-media-download";

test("canonical PNG content type overrides a stale jpg filename", () => {
  assert.equal(
    filenameForCanonicalContentType("screenshot.jpg", "image/png"),
    "screenshot.png",
  );
});

test("canonical content type overrides stale instruction metadata", () => {
  assert.equal(
    filenameForCanonicalContentType("render-source.jpeg", "video/webm"),
    "render-source.webm",
  );
});

test("factory canonical content types map to stable extensions", () => {
  const fixtures: Array<[string, string]> = [
    ["image/jpeg", ".jpg"],
    ["image/png", ".png"],
    ["image/webp", ".webp"],
    ["video/mp4", ".mp4"],
    ["video/quicktime", ".mov"],
    ["video/webm", ".webm"],
    ["video/x-m4v", ".m4v"],
    ["audio/mpeg", ".mp3"],
    ["audio/mp4", ".m4a"],
    ["audio/x-m4a", ".m4a"],
    ["audio/aac", ".aac"],
    ["audio/wav", ".wav"],
    ["audio/ogg", ".ogg"],
    ["audio/flac", ".flac"],
  ];

  for (const [contentType, extension] of fixtures) {
    assert.equal(extensionForContentType(`${contentType}; charset=binary`), extension, contentType);
  }
});

test("Drive fallback runs after canonical lookup or download failure", async () => {
  const calls: string[] = [];
  const result = await downloadWithDriveFallback({
    primary: async () => {
      calls.push("canonical");
      throw new Error("canonical lookup failed for https://signed.example/?secret=value");
    },
    driveFileId: "drive-file",
    drive: async (driveFileId) => {
      calls.push(`drive:${driveFileId}`);
    },
    onFallback: () => calls.push("fallback-diagnostic-without-url"),
  });

  assert.equal(result, "drive");
  assert.deepEqual(calls, [
    "canonical",
    "fallback-diagnostic-without-url",
    "drive:drive-file",
  ]);
  assert.equal(calls.join(" ").includes("signed.example"), false);
  assert.equal(calls.join(" ").includes("secret=value"), false);
});
