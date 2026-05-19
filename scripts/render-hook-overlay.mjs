import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import React from "react";
import { unstable_createNodejsStream } from "../node_modules/next/dist/compiled/@vercel/og/index.node.js";

async function readJson(filepath) {
  return JSON.parse(await fs.readFile(filepath, "utf8"));
}

async function getHookFont(fontCandidates) {
  for (const filepath of fontCandidates) {
    try {
      const data = await fs.readFile(filepath);

      return {
        name: "HookFont",
        data,
      };
    } catch {
      // Try the next local font candidate.
    }
  }

  return null;
}

const hookTextShadow =
  "0 0 3px rgba(0,0,0,0.95), 0 0 8px rgba(0,0,0,0.85), 0 2px 4px rgba(0,0,0,0.9)";
const emojiPattern = /\p{Extended_Pictographic}/u;

function splitEmojiRuns(text) {
  const segmenter =
    typeof Intl.Segmenter === "function"
      ? new Intl.Segmenter("en", { granularity: "grapheme" })
      : null;
  const segments = segmenter
    ? Array.from(segmenter.segment(text), (segment) => segment.segment)
    : Array.from(text);
  const runs = [];

  for (const segment of segments) {
    const isEmoji = emojiPattern.test(segment);
    const previous = runs.at(-1);

    if (previous && previous.isEmoji === isEmoji) {
      previous.text += segment;
    } else {
      runs.push({ text: segment, isEmoji });
    }
  }

  return runs;
}

function renderHookText(text) {
  return splitEmojiRuns(text).map((run, index) =>
    React.createElement(
      "span",
      {
        key: `${index}-${run.isEmoji ? "emoji" : "text"}`,
        style: {
          display: "inline",
          fontFamily: run.isEmoji ? "sans-serif" : "inherit",
          textShadow: run.isEmoji ? "none" : hookTextShadow,
        },
      },
      run.text,
    ),
  );
}

const configPath = process.argv[2];

if (!configPath) {
  throw new Error("Usage: node scripts/render-hook-overlay.mjs <config.json>");
}

const config = await readJson(configPath);
const hookFont = await getHookFont(config.fontCandidates ?? []);
const fontFamily = hookFont?.name ?? "sans-serif";
const imageStream = await unstable_createNodejsStream(
  React.createElement(
    "div",
    {
      style: {
        alignItems: "center",
        background: "transparent",
        color: "white",
        display: "flex",
        fontFamily,
        fontSize: Number(config.fontSize),
        fontWeight: 700,
        height: Number(config.height),
        justifyContent: "center",
        letterSpacing: "0",
        lineHeight: 1.05,
        padding: "0 12px",
        textAlign: "center",
        width: Number(config.width),
        whiteSpace: "pre-line",
      },
    },
    React.createElement(
      "div",
      {
        style: {
          display: "block",
          textAlign: "center",
          whiteSpace: "pre-line",
          width: "100%",
        },
      },
      renderHookText(config.text),
    ),
  ),
  {
    width: Number(config.width),
    height: Number(config.height),
    emoji: "twemoji",
    fonts: hookFont
      ? [
          {
            name: hookFont.name,
            data: hookFont.data,
            weight: 700,
            style: "normal",
          },
        ]
      : undefined,
  },
);

await pipeline(imageStream, createWriteStream(config.outputFilepath));
