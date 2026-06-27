import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(new URL("..", import.meta.url).pathname);
const notoEmojiVersion = process.env.NOTO_EMOJI_VERSION ?? "v2.051";
const outputDirectory = path.join(projectRoot, "public", "emoji", "noto");
const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "authorloom-noto-emoji-"));
const checkoutDirectory = path.join(temporaryDirectory, "noto-emoji");

try {
  await execFileAsync("git", [
    "clone",
    "--depth",
    "1",
    "--branch",
    notoEmojiVersion,
    "--filter=blob:none",
    "--sparse",
    "https://github.com/googlefonts/noto-emoji.git",
    checkoutDirectory,
  ]);
  await execFileAsync("git", ["-C", checkoutDirectory, "sparse-checkout", "set", "svg"]);

  await fs.rm(path.join(outputDirectory, "svg"), { force: true, recursive: true });
  await fs.mkdir(outputDirectory, { recursive: true });
  await fs.cp(path.join(checkoutDirectory, "svg"), path.join(outputDirectory, "svg"), {
    recursive: true,
  });
  await fs.writeFile(path.join(outputDirectory, "VERSION"), `${notoEmojiVersion}\n`);

  const { stdout } = await execFileAsync("find", [path.join(outputDirectory, "svg"), "-type", "f"]);
  const assetCount = stdout.trim() ? stdout.trim().split("\n").length : 0;
  console.log(`Synced Google Noto Emoji ${notoEmojiVersion}: ${assetCount} SVG assets.`);
} finally {
  await fs.rm(temporaryDirectory, { force: true, recursive: true });
}
