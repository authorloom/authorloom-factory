import assert from "node:assert/strict";
import test from "node:test";

import {
  layoutStudioCompositionDurationSeconds,
  resolveLayoutStudioElementsForRender,
  resolveLayoutStudioSceneTextElementForRender,
} from "../ffmpeg";

const screenshotElement = {
  id: "screenshot-1",
  type: "screenshot",
  x: 100,
  y: 500,
  width: 800,
  height: 800,
  fit: "contain" as const,
  horizontalAlign: "center" as const,
  verticalAlign: "middle" as const,
};

const hookElement = {
  id: "hook-1",
  type: "hook",
  x: 100,
  y: 200,
  width: 800,
  height: 100,
  rule: "stackAboveScreenshot" as const,
  gap: 20,
};

const keywordsElement = {
  id: "keywords-1",
  type: "keywords",
  x: 100,
  y: 1200,
  width: 800,
  height: 90,
  anchorEnabled: true,
  anchorTargetId: "screenshot-1",
  anchorSourcePoint: "top" as const,
  anchorTargetPoint: "bottom" as const,
};

const template = {
  kind: "layoutStudio",
  canvas: { width: 1080, height: 1920 },
  scenes: [
    {
      id: "scene-1",
      elements: [screenshotElement, hookElement, keywordsElement],
    },
  ],
};

const scene = {
  sceneId: "scene-1",
  durationSeconds: 7,
  assets: {
    hook: { text: "A test hook" },
    keywords: [{ text: "keyword" }],
  },
};

function renderedScreenshotBox(dimensions: { width: number; height: number }) {
  const box = { x: 100, y: 500, width: 800, height: 800 };
  const aspect = dimensions.width / dimensions.height;
  const renderedWidth = aspect > 1 ? box.width : box.height * aspect;
  const renderedHeight = aspect > 1 ? box.width / aspect : box.height;

  return {
    x: box.x + (box.width - renderedWidth) / 2,
    y: box.y + (box.height - renderedHeight) / 2,
    width: renderedWidth,
    height: renderedHeight,
  };
}

test("Layout Studio templates with scene-only elements resolve as renderable Studio layouts", () => {
  const elements = resolveLayoutStudioElementsForRender({
    template,
    screenshotDimensions: { width: 1600, height: 800 },
  });

  assert.deepEqual(
    elements.map((element) => element.id),
    ["screenshot-1", "hook-1", "keywords-1"],
  );
});

test("Layout Studio composition duration comes from composition timeline", () => {
  assert.equal(
    layoutStudioCompositionDurationSeconds({
      ...template,
      timeline: {
        previewDurationSeconds: 7,
      },
      compositionTimeline: {
        durationSeconds: 12,
        clips: [
          {
            id: "screenshot-clip",
            layerType: "asset",
            startSeconds: 0,
            durationSeconds: 12,
          },
        ],
      },
    }),
    12,
  );
});

test("hook stacked above screenshot uses tall screenshot rendered box", async () => {
  const screenshotBox = renderedScreenshotBox({ width: 800, height: 1600 });
  const hook = await resolveLayoutStudioSceneTextElementForRender({
    template,
    scene,
    sceneId: "scene-1",
    sceneIndex: 0,
    screenshotDimensions: { width: 800, height: 1600 },
    type: "hook",
  });

  assert.ok(hook);
  assert.equal(hook.y, 380);
  assert.equal(hook.y + hook.height + 20, screenshotBox.y);
});

test("hook stacked above screenshot uses short wide screenshot rendered box", async () => {
  const screenshotBox = renderedScreenshotBox({ width: 1600, height: 800 });
  const hook = await resolveLayoutStudioSceneTextElementForRender({
    template,
    scene,
    sceneId: "scene-1",
    sceneIndex: 0,
    screenshotDimensions: { width: 1600, height: 800 },
    type: "hook",
  });

  assert.ok(hook);
  assert.equal(hook.y, 580);
  assert.equal(hook.y + hook.height + 20, screenshotBox.y);
});

test("keywords anchored to screenshot bottom sit below tall screenshot", async () => {
  const screenshotBox = renderedScreenshotBox({ width: 800, height: 1600 });
  const keywords = await resolveLayoutStudioSceneTextElementForRender({
    template,
    scene,
    sceneId: "scene-1",
    sceneIndex: 0,
    screenshotDimensions: { width: 800, height: 1600 },
    type: "keywords",
  });

  assert.ok(keywords);
  assert.equal(keywords.y, 1300);
  assert.equal(keywords.y, screenshotBox.y + screenshotBox.height);
});

test("keywords anchored to screenshot bottom sit below short wide screenshot", async () => {
  const screenshotBox = renderedScreenshotBox({ width: 1600, height: 800 });
  const keywords = await resolveLayoutStudioSceneTextElementForRender({
    template,
    scene,
    sceneId: "scene-1",
    sceneIndex: 0,
    screenshotDimensions: { width: 1600, height: 800 },
    type: "keywords",
  });

  assert.ok(keywords);
  assert.equal(keywords.y, 1100);
  assert.equal(keywords.y, screenshotBox.y + screenshotBox.height);
});

test("hook, screenshot, and keywords do not overlap after per-render anchor resolution", async () => {
  for (const dimensions of [
    { width: 800, height: 1600 },
    { width: 1600, height: 800 },
  ]) {
    const screenshotBox = renderedScreenshotBox(dimensions);
    const hook = await resolveLayoutStudioSceneTextElementForRender({
      template,
      scene,
      sceneId: "scene-1",
      sceneIndex: 0,
      screenshotDimensions: dimensions,
      type: "hook",
    });
    const keywords = await resolveLayoutStudioSceneTextElementForRender({
      template,
      scene,
      sceneId: "scene-1",
      sceneIndex: 0,
      screenshotDimensions: dimensions,
      type: "keywords",
    });

    assert.ok(hook);
    assert.ok(keywords);
    assert.ok(hook.y + hook.height <= screenshotBox.y);
    assert.ok(keywords.y >= screenshotBox.y + screenshotBox.height);
  }
});
