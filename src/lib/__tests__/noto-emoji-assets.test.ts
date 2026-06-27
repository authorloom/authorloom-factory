import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

const projectRoot = path.resolve(process.cwd());
const notoDirectory = path.join(projectRoot, "public", "emoji", "noto");
const notoSvgDirectory = path.join(notoDirectory, "svg");

test("factory uses the pinned latest official Google Noto Emoji asset bundle", () => {
  assert.equal(fs.readFileSync(path.join(notoDirectory, "VERSION"), "utf8").trim(), "v2.051");

  for (const filename of [
    "emoji_u1f4da.svg",
    "emoji_u2728.svg",
    "emoji_u1f525.svg",
    "emoji_u1f60d.svg",
    "emoji_u1f62d.svg",
    "emoji_u1f469_200d_1f4bb.svg",
    "emoji_u1f9d1_1f3fd_200d_1f3a8.svg",
    "emoji_u2764.svg",
    "emoji_u0031_20e3.svg",
  ]) {
    assert.equal(fs.existsSync(path.join(notoSvgDirectory, filename)), true, filename);
  }
});

test("hook overlay renderer is pinned to local Noto emoji assets with Noto fallback", () => {
  const renderer = fs.readFileSync(
    path.join(projectRoot, "scripts", "render-hook-overlay.mjs"),
    "utf8",
  );

  assert.match(renderer, /public\/emoji\/noto\/svg/);
  assert.match(renderer, /const fallbackEmojiStyle = "noto"/);
  assert.match(renderer, /useNotoEmojiAssets/);
  assert.doesNotMatch(renderer, /AUTHORLOOM_EMOJI_STYLE/);
});
