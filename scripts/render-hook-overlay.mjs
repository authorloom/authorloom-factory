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
  "3.5px 0 0 rgba(0,0,0,0.96), -3.5px 0 0 rgba(0,0,0,0.96), 0 3.5px 0 rgba(0,0,0,0.96), 0 -3.5px 0 rgba(0,0,0,0.96), 2.5px 2.5px 0 rgba(0,0,0,0.92), -2.5px 2.5px 0 rgba(0,0,0,0.92), 2.5px -2.5px 0 rgba(0,0,0,0.92), -2.5px -2.5px 0 rgba(0,0,0,0.92), 0 2px 8px rgba(0,0,0,0.28)";
const reducedTextShadow =
  "3px 0 0 rgba(0,0,0,0.95), -3px 0 0 rgba(0,0,0,0.95), 0 3px 0 rgba(0,0,0,0.95), 0 -3px 0 rgba(0,0,0,0.95), 2px 2px 0 rgba(0,0,0,0.9), -2px 2px 0 rgba(0,0,0,0.9), 2px -2px 0 rgba(0,0,0,0.9), -2px -2px 0 rgba(0,0,0,0.9), 0 2px 6px rgba(0,0,0,0.22)";
const subtleTextShadow =
  "3.25px 0 0 rgba(0,0,0,0.96), -3.25px 0 0 rgba(0,0,0,0.96), 0 3.25px 0 rgba(0,0,0,0.96), 0 -3.25px 0 rgba(0,0,0,0.96), 2.25px 2.25px 0 rgba(0,0,0,0.92), -2.25px 2.25px 0 rgba(0,0,0,0.92), 2.25px -2.25px 0 rgba(0,0,0,0.92), -2.25px -2.25px 0 rgba(0,0,0,0.92), 0 2px 7px rgba(0,0,0,0.2)";

const configPath = process.argv[2];

if (!configPath) {
  throw new Error("Usage: node scripts/render-hook-overlay.mjs <config.json>");
}

const config = await readJson(configPath);
const hookFont = await getHookFont(config.fontCandidates ?? []);
const fontFamily = hookFont?.name ?? "sans-serif";
const fontWeight = Number(config.fontWeight ?? 600);
const fontSize = Number(config.fontSize);
const textShadow =
  config.shadowPreset === "subtle"
    ? subtleTextShadow
    : config.shadowPreset === "reduced"
      ? reducedTextShadow
      : hookTextShadow;

const emojiShadow = "0 1px 4px rgba(0,0,0,0.22)";
const emojiPattern =
  /(\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?)*|\p{Emoji_Presentation})/gu;

function splitEmojiRuns(text) {
  const runs = [];
  let lastIndex = 0;

  for (const match of text.matchAll(emojiPattern)) {
    const index = match.index ?? 0;
    const value = match[0];

    if (index > lastIndex) {
      runs.push({ type: "text", value: text.slice(lastIndex, index) });
    }

    runs.push({ type: "emoji", value });
    lastIndex = index + value.length;
  }

  if (lastIndex < text.length) {
    runs.push({ type: "text", value: text.slice(lastIndex) });
  }

  return runs.length ? runs : [{ type: "text", value: text }];
}

function renderLine(line, lineIndex) {
  return React.createElement(
    "div",
    {
      key: `line-${lineIndex}`,
      style: {
        alignItems: "center",
        display: "flex",
        flexDirection: "row",
        justifyContent: "center",
        lineHeight: 1.05,
        width: "100%",
      },
    },
    splitEmojiRuns(line).map((run, runIndex) =>
      React.createElement(
        "span",
        {
          key: `run-${lineIndex}-${runIndex}`,
          style:
            run.type === "emoji"
              ? {
                  fontSize: Math.round(fontSize * 1.03),
                  lineHeight: 1,
                  padding: "0 0.02em",
                  textShadow: emojiShadow,
                }
              : {
                  textShadow,
                },
        },
        run.value,
      ),
    ),
  );
}

const renderedText = String(config.text ?? "")
  .split("\n")
  .map((line, index) => renderLine(line, index));
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
        flexDirection: "column",
        fontSize,
        fontWeight,
        height: Number(config.height),
        justifyContent: "center",
        letterSpacing: "0",
        lineHeight: 1.05,
        padding: "0 12px",
        textAlign: "center",
        width: Number(config.width),
        whiteSpace: "pre",
      },
    },
    renderedText,
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
            weight: fontWeight,
            style: "normal",
          },
        ]
      : undefined,
  },
);

await pipeline(imageStream, createWriteStream(config.outputFilepath));
