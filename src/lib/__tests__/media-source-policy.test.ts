import assert from "node:assert/strict";
import test from "node:test";

import {
  assetDisposition,
  mediaKindForAsset,
  selectProductionMediaSource,
} from "../media-source-policy";

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

test("screenshot uses JPEG render source for production when available", () => {
  const selected = selectProductionMediaSource({
    assetId: "screenshot-1",
    type: "screenshot",
    sourceMediaId: "transparent-png",
    renderSourceMediaId: "flattened-preview",
    sourceMimeType: "image/png",
    renderSourceMimeType: "image/jpeg",
  });

  assert.equal(selected.mediaId, "flattened-preview");
  assert.equal(selected.mimeType, "image/jpeg");
  assert.equal(selected.purpose, "renderSource");
});

test("source media does not inherit render-source MIME metadata", () => {
  const selected = selectProductionMediaSource({
    assetId: "source-with-stale-derivative-mime",
    type: "screenshot",
    sourceMediaId: "source-media",
    renderSourceMimeType: "image/jpeg",
  });

  assert.equal(selected.purpose, "source");
  assert.equal(selected.mimeType, null);
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

test("legacy video rejects a JPEG preview", () => {
  assert.throws(
    () => selectProductionMediaSource({
      assetId: "legacy-poster",
      type: "background",
      previewUrl: "https://media.example/poster.jpg?signature=secret",
    }),
    /only an image or ambiguous preview URL/,
  );
});

test("legacy video accepts a demonstrable MP4 preview", () => {
  const selected = selectProductionMediaSource({
    assetId: "legacy-mp4",
    type: "background",
    previewUrl: "https://media.example/video.mp4?signature=secret",
  });

  assert.equal(selected.url, "https://media.example/video.mp4?signature=secret");
});

test("legacy video accepts preview MIME metadata proving video", () => {
  const selected = selectProductionMediaSource({
    assetId: "legacy-video-mime",
    type: "background",
    previewUrl: "https://media.example/opaque-object",
    previewMimeType: "video/webm",
  });

  assert.equal(selected.url, "https://media.example/opaque-object");
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

test("real timeline media vocabulary is classified", () => {
  const expected = new Map<string, "still" | "video" | "audio">([
    ["background", "video"],
    ["backgroundImage", "still"],
    ["image", "still"],
    ["layoutImage", "still"],
    ["slides", "still"],
    ["screenshot", "still"],
    ["thumbnail", "still"],
    ["cover", "still"],
    ["coverImage", "still"],
    ["audio", "audio"],
  ]);

  for (const [type, kind] of expected) {
    assert.equal(mediaKindForAsset({ assetId: `fixture-${type}`, type }), kind, type);
  }
});

test("real timeline text vocabulary bypasses media selection", () => {
  for (const type of [
    "caption", "hashtag", "hook", "keyword", "trope", "cta", "manuscript",
    "slideHookGroup", "magicLink", "metadata", "title",
  ]) {
    assert.equal(assetDisposition(type), "text", type);
  }
});

test("slide background groups are containers while slides are still media", () => {
  assert.equal(assetDisposition("slideBackgroundGroup"), "container");
  assert.throws(
    () => selectProductionMediaSource({ assetId: "group-1", type: "slideBackgroundGroup" }),
    /is a container/,
  );
  assert.equal(mediaKindForAsset({ assetId: "slide-1", type: "slides" }), "still");
});
