import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";

import {
  buildLayoutStudioFilterComplexForRender,
  isLayoutStudioTimelineMediaOverlayLayer,
  layoutStudioCompositionDurationSeconds,
  layoutStudioElementTimelineWindows,
  layoutStudioFiniteOverlayClipFilterForRender,
  primaryLayoutStudioScreenshotElementKey,
  resolveLayoutStudioElementsForRender,
  resolveLayoutStudioSceneTextElementForRender,
  studioVideoTimelineDurationsForRender,
  wrapStudioTextWithFontMetrics,
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

test("Layout Studio composition duration overrides stale fixed production duration", () => {
  assert.equal(
    studioVideoTimelineDurationsForRender(
      {
        ...template,
        timeline: {
          previewDurationSeconds: 7,
        },
        compositionTimeline: {
          durationSeconds: 8,
          clips: [
            {
              id: "background-clip",
              layerType: "background",
              startSeconds: 0,
              durationSeconds: 8,
            },
          ],
        },
      },
      7,
      {},
    ).mainDuration,
    8,
  );
});

test("Layout Studio finite overlay helper pads delayed branches without sparse timestamps", () => {
  assert.equal(
    layoutStudioFiniteOverlayClipFilterForRender({
      inputLabel: "[1:v]",
      outputLabel: "shot_finite",
      startSeconds: 6,
      endSeconds: 8,
    }),
    "[1:v]trim=start=0:duration=2,setpts=PTS-STARTPTS,tpad=start_duration=6:start_mode=clone,trim=start=0:duration=8,setpts=PTS-STARTPTS[shot_finite]",
  );
});

test("Layout Studio text wrapping uses the selected TikTok font metrics", () => {
  const wrapped = wrapStudioTextWithFontMetrics({
    fontCandidates: [
      path.join(process.cwd(), "public", "fonts", "TikTokSans-ExtraBold.ttf"),
    ],
    fontSize: 50,
    maxWidth: 830,
    outlineWidth: 3,
    text: "Turn book quotes, scenes and excerpts into posts that feel made for BookTok and Bookstagram.",
  });

  assert.equal(
    wrapped,
    "Turn book quotes, scenes and\nexcerpts into posts that feel\nmade for BookTok and\nBookstagram.",
  );
});

test("Layout Studio screenshot timeline clips do not become duplicate media overlays", () => {
  assert.equal(isLayoutStudioTimelineMediaOverlayLayer("screenshot"), false);
  assert.equal(isLayoutStudioTimelineMediaOverlayLayer("image"), true);
  assert.equal(isLayoutStudioTimelineMediaOverlayLayer("cover"), true);
});

test("Layout Studio screenshot timeline clips create direct screenshot enable windows", () => {
  const windows = layoutStudioElementTimelineWindows({
    ...template,
    compositionTimeline: {
      durationSeconds: 8,
      clips: [
        {
          id: "screenshot-clip",
          elementId: "screenshot-1",
          layerType: "screenshot",
          startSeconds: 0,
          durationSeconds: 6,
        },
        {
          id: "cover-clip",
          layerType: "cover",
          startSeconds: 6,
          durationSeconds: 2,
        },
      ],
    },
  });

  assert.deepEqual(windows.get("screenshot-1"), [
    {
      clipId: "screenshot-clip",
      endSeconds: 6,
      layerType: "screenshot",
      startSeconds: 0,
    },
  ]);
});

test("Layout Studio generated graph makes screenshot, text, and image branches finite", () => {
  const imageElement = {
    id: "image-1",
    type: "image",
    x: 120,
    y: 1000,
    width: 300,
    height: 300,
    fit: "contain" as const,
    backgroundColor: "#ffffff",
    backgroundOpacity: 100,
    borderColor: "#111111",
    borderRadius: 24,
    borderWidth: 3,
    containerOutline: true,
    rotation: 12,
  };
  const ctaElement = {
    id: "cta-1",
    type: "cta",
    x: 120,
    y: 1420,
    width: 840,
    height: 120,
  };
  const studioTemplate = {
    ...template,
    scenes: [
      {
        id: "scene-1",
        elements: [screenshotElement, imageElement, ctaElement],
      },
    ],
    compositionTimeline: {
      durationSeconds: 8,
      clips: [
        {
          id: "screenshot-clip",
          elementId: "screenshot-1",
          layerType: "screenshot",
          startSeconds: 0,
          durationSeconds: 6,
        },
        {
          id: "image-clip",
          elementId: "image-1",
          layerType: "image",
          startSeconds: 6,
          durationSeconds: 2,
        },
        {
          id: "cta-clip",
          elementId: "cta-1",
          layerType: "cta",
          startSeconds: 6,
          durationSeconds: 2,
        },
      ],
    },
  };
  const resolvedElements = resolveLayoutStudioElementsForRender({
    template: studioTemplate,
    screenshotDimensions: { width: 926, height: 561 },
  });
  const image = resolvedElements.find((element) => element.id === "image-1");
  const cta = resolvedElements.find((element) => element.id === "cta-1");

  assert.ok(image);
  assert.ok(cta);

  const graph = buildLayoutStudioFilterComplexForRender({
    baseFilters: ["[0:v]null[bg]"],
    outputLabel: "vcomposed",
    screenshotDimensions: { width: 926, height: 561 },
    studioTemplate,
    studioMediaOverlays: [
      {
        element: image,
        inputIndex: 2,
        width: 600,
        height: 600,
        startSeconds: 6,
        endSeconds: 8,
      },
    ],
    studioTextOverlays: [
      {
        element: cta,
        inputIndex: 3,
        width: 500,
        height: 120,
        startSeconds: 6,
        endSeconds: 8,
      },
    ],
    resolvedElements,
    studioElementTimelineWindows: layoutStudioElementTimelineWindows(
      studioTemplate,
      resolvedElements,
    ),
    studioTimeline: {
      mainStartSeconds: 0,
      mainEndSeconds: 8,
    },
  });

  assert.match(
    graph,
    /\[1:v\]trim=start=0:duration=6,setpts=PTS-STARTPTS\[studio_shot_0_finite\]/,
  );
  assert.match(
    graph,
    /\[2:v\]trim=start=0:duration=2,setpts=PTS-STARTPTS,tpad=start_duration=6:start_mode=clone,trim=start=0:duration=8,setpts=PTS-STARTPTS\[studio_shot_1_finite\]/,
  );
  assert.match(
    graph,
    /\[3:v\]trim=start=0:duration=2,setpts=PTS-STARTPTS,tpad=start_duration=6:start_mode=clone,trim=start=0:duration=8,setpts=PTS-STARTPTS\[studio_text_0_finite\]/,
  );
  assert.doesNotMatch(graph, /setpts=PTS-STARTPTS\+\d+\/TB/);
  assert.match(graph, /overlay=.*enable='gte\(t,0\)\*lt\(t,6\)'/);
  assert.match(graph, /overlay=.*enable='gte\(t,6\)\*lt\(t,8\)'/);
  assert.match(graph, /overlay=.*eof_action=pass:repeatlast=0/);
  assert.doesNotMatch(graph, /eof_action=pass\[/);
  assert.match(graph, /color=c=0xffffff@1.000:s=600x600/);
  assert.match(graph, /color=c=0x111111@1.000:s=600x600/);
  assert.match(graph, /overlay=x=0:y=0:format=auto\[studio_shot_1_bordered\]/);
  assert.match(graph, /scale=iw\*2:ih\*2:flags=lanczos\[studio_shot_1_media_scaled\]/);
  assert.match(graph, /scale=425:425:flags=lanczos\[studio_shot_1\]/);
  assert.doesNotMatch(graph, /drawbox=/);
  assert.match(graph, /geq=r='r\(X\\,Y\)'/);
  assert.match(graph, /rotate=0.20943951:c=none/);
});

test("Layout Studio duplicate screenshot elements use the top-most slot", () => {
  assert.equal(
    primaryLayoutStudioScreenshotElementKey([
      { id: "hook-1", type: "hook", x: 120, y: 265 },
      { id: "screenshot-behind", type: "screenshot", x: 141, y: 281 },
      { id: "screenshot-front", type: "screenshot", x: 120, y: 384 },
    ]),
    "screenshot-front",
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
