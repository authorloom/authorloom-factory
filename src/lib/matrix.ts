import type { Hook, ScreenshotAsset } from "@/lib/db";

export function calculateRenderMatrixPreviewCount({
  backgroundCount,
  screenshots,
  hooks,
}: {
  backgroundCount: number;
  screenshots: ScreenshotAsset[];
  hooks: Hook[];
}) {
  const screenshotIds = new Set(screenshots.map((screenshot) => screenshot.id));
  const validHookCount = hooks.filter((hook) =>
    screenshotIds.has(hook.screenshot_id),
  ).length;

  return backgroundCount * validHookCount;
}
