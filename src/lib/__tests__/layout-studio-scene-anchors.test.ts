import assert from "node:assert/strict";
import test from "node:test";

import { resolveLayoutStudioSceneTextElementForRender } from "../ffmpeg";

const template = {
  kind: "layoutStudio",
  canvas: { width: 1080, height: 1920 },
  scenes: [
    {
      id: "scene-1",
      elements: [
        {
          id: "screenshot-1",
          type: "screenshot",
          x: 100,
          y: 500,
          width: 800,
          height: 800,
          fit: "contain" as const,
          horizontalAlign: "center" as const,
          verticalAlign: "middle" as const,
        },
        {
          id: "hook-1",
          type: "hook",
          x: 100,
          y: 200,
          width: 800,
          height: 100,
          rule: "stackAboveScreenshot" as const,
          gap: 20,
        },
        {
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
        },
      ],
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

test("scene text overlays resolve stack and anchors against per-render screenshot dimensions", async () => {
  const wideHook = await resolveLayoutStudioSceneTextElementForRender({
    template,
    scene,
    sceneId: "scene-1",
    sceneIndex: 0,
    screenshotDimensions: { width: 1600, height: 800 },
    type: "hook",
  });
  const tallHook = await resolveLayoutStudioSceneTextElementForRender({
    template,
    scene,
    sceneId: "scene-1",
    sceneIndex: 0,
    screenshotDimensions: { width: 800, height: 1600 },
    type: "hook",
  });
  const wideKeywords = await resolveLayoutStudioSceneTextElementForRender({
    template,
    scene,
    sceneId: "scene-1",
    sceneIndex: 0,
    screenshotDimensions: { width: 1600, height: 800 },
    type: "keywords",
  });
  const tallKeywords = await resolveLayoutStudioSceneTextElementForRender({
    template,
    scene,
    sceneId: "scene-1",
    sceneIndex: 0,
    screenshotDimensions: { width: 800, height: 1600 },
    type: "keywords",
  });

  assert.ok(wideHook);
  assert.ok(tallHook);
  assert.ok(wideKeywords);
  assert.ok(tallKeywords);
  assert.notEqual(wideHook.y, tallHook.y);
  assert.notEqual(wideKeywords.y, tallKeywords.y);
  assert.equal(wideHook.y, 580);
  assert.equal(tallHook.y, 380);
  assert.equal(wideKeywords.y, 1100);
  assert.equal(tallKeywords.y, 1300);
});
