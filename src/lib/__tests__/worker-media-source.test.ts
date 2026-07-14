import assert from "node:assert/strict";
import test from "node:test";

import { preferredWorkerMediaId } from "../worker-media-source";

test("raw source media takes priority over managed derivatives", () => {
  assert.equal(
    preferredWorkerMediaId({
      sourceMediaId: "raw-png",
      renderSourceMediaId: "managed-webp",
      previewMediaId: "preview-webp",
      thumbnailMediaId: "thumb-jpg",
    }),
    "raw-png",
  );
});

test("managed derivatives remain available when the raw source is absent", () => {
  assert.equal(
    preferredWorkerMediaId({
      renderSourceMediaId: "managed-webp",
      previewMediaId: "preview-webp",
    }),
    "managed-webp",
  );
});
