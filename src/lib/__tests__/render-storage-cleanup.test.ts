import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { cleanupRenderStorage } from "@/lib/render-storage-cleanup";
import { paths } from "@/lib/paths";

test("render storage cleanup supports dry-run and execution", async () => {
  const directory = path.join(paths.rendersDirectory, "cleanup-test");
  const filepath = path.join(directory, "old-render.mp4");
  const oldTime = new Date(Date.now() - 10 * 60 * 60 * 1000);

  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(filepath, Buffer.alloc(128));
  await fs.utimes(filepath, oldTime, oldTime);

  const dryRun = await cleanupRenderStorage({
    dryRun: true,
    maxAgeHours: 1,
    maxBytes: 1024 ** 4,
  });

  assert.equal(dryRun.dryRun, true);
  assert.equal(dryRun.eligibleFiles >= 1, true);

  const executed = await cleanupRenderStorage({
    dryRun: false,
    maxAgeHours: 1,
    maxBytes: 1024 ** 4,
  });

  assert.equal(executed.deletedFiles >= 1, true);
  await assert.rejects(fs.access(filepath));
});
