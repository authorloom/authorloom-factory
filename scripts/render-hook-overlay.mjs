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
  "2.5px 0 0 rgba(0,0,0,0.96), -2.5px 0 0 rgba(0,0,0,0.96), 0 2.5px 0 rgba(0,0,0,0.96), 0 -2.5px 0 rgba(0,0,0,0.96), 1.8px 1.8px 0 rgba(0,0,0,0.92), -1.8px 1.8px 0 rgba(0,0,0,0.92), 1.8px -1.8px 0 rgba(0,0,0,0.92), -1.8px -1.8px 0 rgba(0,0,0,0.92), 0 0 9px rgba(0,0,0,0.72), 0 0 18px rgba(0,0,0,0.44)";
const reducedTextShadow =
  "2.5px 0 0 rgba(0,0,0,0.96), -2.5px 0 0 rgba(0,0,0,0.96), 0 2.5px 0 rgba(0,0,0,0.96), 0 -2.5px 0 rgba(0,0,0,0.96), 1.5px 1.5px 0 rgba(0,0,0,0.88), -1.5px 1.5px 0 rgba(0,0,0,0.88), 1.5px -1.5px 0 rgba(0,0,0,0.88), -1.5px -1.5px 0 rgba(0,0,0,0.88), 0 0 5px rgba(0,0,0,0.38), 0 0 10px rgba(0,0,0,0.2)";

const configPath = process.argv[2];

if (!configPath) {
  throw new Error("Usage: node scripts/render-hook-overlay.mjs <config.json>");
}

const config = await readJson(configPath);
const hookFont = await getHookFont(config.fontCandidates ?? []);
const fontFamily = hookFont?.name ?? "sans-serif";
const fontWeight = Number(config.fontWeight ?? 600);
const textShadow =
  config.shadowPreset === "reduced" ? reducedTextShadow : hookTextShadow;
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
        fontWeight,
        height: Number(config.height),
        justifyContent: "center",
        letterSpacing: "0",
        lineHeight: 1.05,
        padding: "0 12px",
        textAlign: "center",
        textShadow,
        width: Number(config.width),
        whiteSpace: "pre-line",
      },
    },
    config.text,
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
