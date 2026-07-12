import assert from "node:assert/strict";
import test from "node:test";

import { selectProductionMediaSource } from "../media-source-policy";

test("video selects the optimized render source", () => {
  const selected = selectProductionMediaSource({
    assetId: "video-1",
    type: "videoClip",
    sourceMediaId: "original-video",
    renderSourceMediaId: "optimized-video",
    previewMediaId: "poster",
  });

  assert.deepEqual(selected, {
    kind: "video",
    purpose: "renderSource",
    mediaId: "optimized-video",
    url: null,
    mimeType: null,
  });
});

test("still image selects the fidelity-preserving source", () => {
  const selected = selectProductionMediaSource({
    assetId: "cover-1",
    type: "bookCover",
    sourceMediaId: "original-image",
    renderSourceMediaId: "optimized-image",
  });

  assert.equal(selected.kind, "still");
  assert.equal(selected.purpose, "source");
  assert.equal(selected.mediaId, "original-image");
});

test("screenshot PNG preserves the source MIME selection", () => {
  const selected = selectProductionMediaSource({
    assetId: "screenshot-1",
    type: "screenshot",
    sourceMediaId: "transparent-png",
    renderSourceMediaId: "flattened-preview",
    sourceMimeType: "image/png",
    renderSourceMimeType: "image/jpeg",
  });

  assert.equal(selected.mediaId, "transparent-png");
  assert.equal(selected.mimeType, "image/png");
});

test("legacy assets without media IDs retain URL fallback", () => {
  const selected = selectProductionMediaSource({
    assetId: "legacy-video",
    type: "background",
    renderSourceUrl: "https://media.example/render.mp4",
    previewUrl: "https://media.example/poster.jpg",
  });

  assert.equal(selected.purpose, "legacy");
  assert.equal(selected.url, "https://media.example/render.mp4");
});

test("poster and thumbnail IDs are never implicit render inputs", () => {
  const selected = selectProductionMediaSource({
    assetId: "video-2",
    type: "video",
    previewMediaId: "preview-id",
    thumbnailMediaId: "thumbnail-id",
  });

  assert.equal(selected.mediaId, null);
  assert.equal(selected.url, null);
});

test("an explicitly identified render source may use a derivative", () => {
  const selected = selectProductionMediaSource({
    assetId: "video-3",
    type: "video",
    renderSourceMediaId: "explicit-render-derivative",
    renderSourcePurpose: "production-render",
  });

  assert.equal(selected.mediaId, "explicit-render-derivative");
  assert.equal(selected.purpose, "renderSource");
});

test("mismatched canonical metadata fails clearly", () => {
  assert.throws(
    () => selectProductionMediaSource({
      assetId: "bad-asset",
      type: "screenshot",
      canonicalMediaKind: "video",
      sourceMediaId: "media-1",
    }),
    /mismatched kind metadata.*screenshot is still.*canonical kind is video/,
  );
});

test("unknown metadata fails clearly", () => {
  assert.throws(
    () => selectProductionMediaSource({ assetId: "mystery", type: "unknown" }),
    /unknown production media kind/,
  );
});
