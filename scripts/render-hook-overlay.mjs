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
  "2px 0 0 rgba(0,0,0,0.95), -2px 0 0 rgba(0,0,0,0.95), 0 2px 0 rgba(0,0,0,0.95), 0 -2px 0 rgba(0,0,0,0.95), 1.4px 1.4px 0 rgba(0,0,0,0.9), -1.4px 1.4px 0 rgba(0,0,0,0.9), 1.4px -1.4px 0 rgba(0,0,0,0.9), -1.4px -1.4px 0 rgba(0,0,0,0.9), 0 3px 5px rgba(0,0,0,0.7)";

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
        textShadow: hookTextShadow,
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
            weight: 700,
            style: "normal",
          },
        ]
      : undefined,
  },
);

await pipeline(imageStream, createWriteStream(config.outputFilepath));
