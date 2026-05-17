import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
let campaignId: string | undefined;
let maxItems: number | undefined;
let closeDatabase: (() => void) | undefined;

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];

  if (arg === "--campaign") {
    campaignId = args[index + 1];
    index += 1;
    continue;
  }

  if (arg === "--max") {
    const value = Number(args[index + 1]);
    maxItems = Number.isFinite(value) && value > 0 ? Math.floor(value) : undefined;
    index += 1;
  }
}

function loadDotEnvLocal() {
  const envFilepath = path.join(process.cwd(), ".env.local");

  if (!fs.existsSync(envFilepath)) {
    return;
  }

  const contents = fs.readFileSync(envFilepath, "utf8");

  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = unquoteEnvValue(trimmed.slice(separatorIndex + 1).trim());

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function unquoteEnvValue(value: string) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

async function main() {
  loadDotEnvLocal();
  const db = await import("../src/lib/db");
  const { runDriveVideoUploadWorker } = await import(
    "../src/lib/drive-video-upload-worker"
  );
  closeDatabase = db.closeDatabase;

  console.log("Starting Drive video upload worker.");
  console.log(`Campaign filter: ${campaignId ?? "all queued campaigns"}`);
  console.log(`Max items: ${maxItems ?? "until queue is empty"}`);

  const result = await runDriveVideoUploadWorker({
    campaignId,
    maxItems,
  });

  console.log("Drive video upload worker complete.");
  console.log(`Processed: ${result.processed}`);
  console.log(`Uploaded: ${result.uploaded}`);
  console.log(`Skipped already uploaded: ${result.skippedAlreadyUploaded}`);
  console.log(`Failed: ${result.failed}`);

  if (result.campaignQueue) {
    console.log("Campaign queue:");
    console.log(`  queued: ${result.campaignQueue.queued}`);
    console.log(`  running: ${result.campaignQueue.running}`);
    console.log(`  done: ${result.campaignQueue.done}`);
    console.log(`  failed: ${result.campaignQueue.failed}`);
  }

  for (const error of result.errors) {
    console.error(error);
  }

  if (result.failed > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch((error: unknown) => {
    console.error("Drive video upload worker failed.");
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => {
    closeDatabase?.();
  });
