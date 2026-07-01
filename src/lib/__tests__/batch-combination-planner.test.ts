import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "authorloom-batch-planner-"));
process.env.BOOKTOK_DATABASE_PATH = path.join(tempRoot, "booktok.sqlite");

const require = createRequire(import.meta.url);
const db = require("../db") as typeof import("../db");

function createPlannerFixture() {
  const uniqueId = `${Date.now()} ${Math.random()}`;
  const authorId = db.createAuthor({ name: `Planner Author ${uniqueId}` });
  const bookId = db.createBook({
    authorId,
    title: `Planner Book ${uniqueId}`,
  });
  const campaignId = db.createCampaign({
    name: `Planner Campaign ${uniqueId}`,
    bookId,
    layoutId: "default_video_layout",
  });
  const batchId = db.createRenderBatch({
    campaignId,
    name: `Planner Batch ${uniqueId}`,
    layoutId: "default_video_layout",
  });
  const screenshotIds = Array.from({ length: 3 }, (_, index) =>
    db.createBookScreenshot({
      bookId,
      filename: `screenshot-${index + 1}.png`,
      filepath: path.join(tempRoot, `screenshot-${index + 1}.png`),
    }),
  );
  const backgroundIds = Array.from({ length: 5 }, (_, index) =>
    db.createBookBackground({
      bookId,
      filename: `background-${index + 1}.mp4`,
      filepath: path.join(tempRoot, `background-${index + 1}.mp4`),
    }),
  );

  for (let index = 0; index < 10; index += 1) {
    db.createBookHookForScreenshot({
      bookId,
      screenshotId: screenshotIds[index % screenshotIds.length],
      text: `Hook ${index + 1}`,
    });
  }

  const hookIds = db.listBookHooks(bookId).map((hook) => hook.id);

  db.updateRenderBatchScreenshotSelections({
    campaignId,
    batchId,
    assetIds: screenshotIds,
  });
  db.updateRenderBatchHookSelections({
    campaignId,
    batchId,
    assetIds: hookIds,
  });
  db.updateRenderBatchBackgroundSelections({
    campaignId,
    batchId,
    assetIds: backgroundIds,
  });

  return {
    authorId,
    bookId,
    campaignId,
    batchId,
    screenshotIds,
    backgroundIds,
    hookIds,
  };
}

test("batch planner varies screenshot, hook, and background before repeating", () => {
  const fixture = createPlannerFixture();
  const result = db.generateRenderJobsForBatch(fixture.batchId);

  assert.equal(result.previewCount, 50);
  assert.equal(result.createdCount, 50);

  const firstSeven = db.listRenderJobsByBatch(fixture.batchId).slice(0, 7);

  assert.equal(new Set(firstSeven.map((job) => job.hook_id)).size, 7);
  assert.equal(new Set(firstSeven.slice(0, 3).map((job) => job.screenshot_id)).size, 3);
  assert.equal(new Set(firstSeven.slice(0, 5).map((job) => job.background_id)).size, 5);

  for (const job of firstSeven) {
    const hook = db.listBookHooks(fixture.bookId).find((item) => item.id === job.hook_id);

    assert.equal(job.screenshot_id, hook?.screenshot_id);
    assert.equal(
      job.creative_signature,
      db.buildRenderJobCreativeSignature({
        bookId: fixture.bookId,
        layoutId: "default_video_layout",
        screenshotId: job.screenshot_id,
        hookId: job.hook_id,
        hookText: job.hook_text,
        backgroundId: job.background_id,
        audioId: job.audio_id,
      }),
    );
  }
});

test("batch planner blocks creative signatures already used by another batch", () => {
  const fixture = createPlannerFixture();

  db.generateRenderJobsForBatch(fixture.batchId);

  const secondCampaignId = db.createCampaign({
    name: `Planner Campaign Duplicate ${Date.now()} ${Math.random()}`,
    bookId: fixture.bookId,
    layoutId: "default_video_layout",
  });
  const secondBatchId = db.createRenderBatch({
    campaignId: secondCampaignId,
    name: `Planner Batch Duplicate ${Date.now()} ${Math.random()}`,
    layoutId: "default_video_layout",
  });

  db.updateRenderBatchScreenshotSelections({
    campaignId: secondCampaignId,
    batchId: secondBatchId,
    assetIds: fixture.screenshotIds,
  });
  db.updateRenderBatchHookSelections({
    campaignId: secondCampaignId,
    batchId: secondBatchId,
    assetIds: fixture.hookIds,
  });
  db.updateRenderBatchBackgroundSelections({
    campaignId: secondCampaignId,
    batchId: secondBatchId,
    assetIds: fixture.backgroundIds,
  });

  assert.throws(
    () => db.generateRenderJobsForBatch(secondBatchId),
    /only 0 unique new combinations are available/,
  );
});
