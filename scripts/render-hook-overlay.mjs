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
  "4px 0 0 rgba(0,0,0,0.98), -4px 0 0 rgba(0,0,0,0.98), 0 4px 0 rgba(0,0,0,0.98), 0 -4px 0 rgba(0,0,0,0.98), 3px 3px 0 rgba(0,0,0,0.95), -3px 3px 0 rgba(0,0,0,0.95), 3px -3px 0 rgba(0,0,0,0.95), -3px -3px 0 rgba(0,0,0,0.95), 0 1px 4px rgba(0,0,0,0.12)";
const reducedTextShadow =
  "3px 0 0 rgba(0,0,0,0.97), -3px 0 0 rgba(0,0,0,0.97), 0 3px 0 rgba(0,0,0,0.97), 0 -3px 0 rgba(0,0,0,0.97), 2.25px 2.25px 0 rgba(0,0,0,0.94), -2.25px 2.25px 0 rgba(0,0,0,0.94), 2.25px -2.25px 0 rgba(0,0,0,0.94), -2.25px -2.25px 0 rgba(0,0,0,0.94), 0 1px 3px rgba(0,0,0,0.1)";
const subtleTextShadow =
  "4px 0 0 rgba(0,0,0,0.98), -4px 0 0 rgba(0,0,0,0.98), 0 4px 0 rgba(0,0,0,0.98), 0 -4px 0 rgba(0,0,0,0.98), 3px 3px 0 rgba(0,0,0,0.95), -3px 3px 0 rgba(0,0,0,0.95), 3px -3px 0 rgba(0,0,0,0.95), -3px -3px 0 rgba(0,0,0,0.95), 0 1px 4px rgba(0,0,0,0.12)";
const copyTextShadow =
  "2px 0 0 rgba(0,0,0,0.96), -2px 0 0 rgba(0,0,0,0.96), 0 2px 0 rgba(0,0,0,0.96), 0 -2px 0 rgba(0,0,0,0.96), 1.5px 1.5px 0 rgba(0,0,0,0.92), -1.5px 1.5px 0 rgba(0,0,0,0.92), 1.5px -1.5px 0 rgba(0,0,0,0.92), -1.5px -1.5px 0 rgba(0,0,0,0.92), 0 1px 3px rgba(0,0,0,0.1)";

const configPath = process.argv[2];

if (!configPath) {
  throw new Error("Usage: node scripts/render-hook-overlay.mjs <config.json>");
}

const config = await readJson(configPath);
const hookFont = await getHookFont(config.fontCandidates ?? []);
const fontFamily = hookFont?.name ?? "sans-serif";
const fontWeight = Number(config.fontWeight ?? 600);
const fontSize = Number(config.fontSize);
const fontStyle = config.italic ? "italic" : "normal";
const lineHeight = Number.isFinite(Number(config.lineHeight))
  ? Number(config.lineHeight)
  : 1.05;
const textAlign = ["left", "right", "center"].includes(config.textAlign)
  ? config.textAlign
  : "center";
const horizontalAlign = ["left", "right", "center"].includes(config.horizontalAlign)
  ? config.horizontalAlign
  : textAlign;
const verticalAlign = ["top", "bottom", "middle", "center"].includes(config.verticalAlign)
  ? config.verticalAlign
  : "center";
const justifyContent =
  verticalAlign === "top"
    ? "flex-start"
    : verticalAlign === "bottom"
      ? "flex-end"
      : "center";
const alignItems =
  horizontalAlign === "left"
    ? "flex-start"
    : horizontalAlign === "right"
      ? "flex-end"
      : "center";
const lineJustifyContent =
  textAlign === "left"
    ? "flex-start"
    : textAlign === "right"
      ? "flex-end"
      : "center";
const textColor = config.textColor ?? "white";
const strokeWidth =
  Number.isFinite(Number(config.strokeWidth)) && Number(config.strokeWidth) >= 0
    ? Number(config.strokeWidth)
    : config.shadowPreset === "copy"
      ? 3
      : config.shadowPreset === "reduced"
        ? 4
        : 5;
const textShadow =
  config.shadowPreset === "copy"
    ? copyTextShadow
    : config.shadowPreset === "subtle"
    ? subtleTextShadow
    : config.shadowPreset === "reduced"
      ? reducedTextShadow
      : hookTextShadow;

const emojiShadow = "0 1px 3px rgba(0,0,0,0.16)";
const emojiPattern =
  /(\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?)*|\p{Emoji_Presentation})/gu;

function cleanStyle(style) {
  return Object.fromEntries(
    Object.entries(style).filter(([, value]) => value !== undefined),
  );
}

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
  const lineContent = React.createElement(
    "span",
    {
      style: config.textWrap
        ? cleanStyle({
            background: config.textWrapBackground ?? "rgba(17,17,17,0.85)",
            borderRadius: Number(config.textWrapRadius ?? 18),
            boxShadow: config.wrapShadow,
            display: "flex",
            flexDirection: "row",
            padding: `${Number(config.textWrapPaddingY ?? 6)}px ${Number(config.textWrapPaddingX ?? 12)}px`,
          })
        : {
            display: "flex",
            flexDirection: "row",
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
                  WebkitTextStrokeColor: config.outlineColor ?? "rgba(0,0,0,0.98)",
                  WebkitTextStrokeWidth: strokeWidth,
                  paintOrder: "stroke fill",
                  textShadow,
                },
        },
        run.value,
      ),
    ),
  );

  return React.createElement(
    "div",
    {
      key: `line-${lineIndex}`,
      style: cleanStyle({
        alignItems: "center",
        display: "flex",
        flexDirection: "row",
        justifyContent: lineJustifyContent,
        lineHeight,
        width: "100%",
      }),
    },
    lineContent,
  );
}

const renderedText = String(config.text ?? "")
  .split("\n")
  .map((line, index) => renderLine(line, index));
const imageStream = await unstable_createNodejsStream(
  React.createElement(
    "div",
    {
      style: cleanStyle({
        alignItems,
        background: config.backgroundColor ?? "transparent",
        border: config.border ? config.border : undefined,
        borderRadius: Number(config.borderRadius ?? 0),
        boxShadow: config.containerShadow,
        color: textColor,
        display: "flex",
        fontFamily,
        flexDirection: "column",
        fontSize,
        fontWeight,
        fontStyle,
        height: Number(config.height),
        justifyContent,
        letterSpacing: "0",
        lineHeight,
        padding: config.padding ?? "0 12px",
        textAlign,
        width: Number(config.width),
        whiteSpace: "pre",
      }),
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
            style: fontStyle,
          },
        ]
      : undefined,
  },
);

await pipeline(imageStream, createWriteStream(config.outputFilepath));
