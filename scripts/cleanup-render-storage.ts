#!/usr/bin/env tsx

import { cleanupRenderStorage } from "../src/lib/render-storage-cleanup";

function flag(name: string) {
  return process.argv.includes(name);
}

function option(name: string) {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

async function main() {
  const dryRun = flag("--execute") ? false : true;
  const maxAgeHours = Number(option("--max-age-hours") ?? "") || undefined;
  const maxBytesRaw = option("--max-bytes");
  const maxBytes = maxBytesRaw ? Number(maxBytesRaw) : undefined;
  const deleteUploadedRenders = flag("--delete-uploaded");

  const result = await cleanupRenderStorage({
    dryRun,
    maxAgeHours,
    maxBytes,
    deleteUploadedRenders,
  });

  for (const line of result.logs) {
    console.log(line);
  }
  console.log(`Scanned: ${result.scannedFiles}`);
  console.log(`Eligible: ${result.eligibleFiles}`);
  console.log(`Deleted: ${result.deletedFiles}`);
  console.log(`Bytes scanned: ${result.bytesScanned}`);
  console.log(`Bytes eligible: ${result.bytesEligible}`);
  console.log(`Bytes deleted: ${result.bytesDeleted}`);
}

main().catch((error) => {
  console.error("Render storage cleanup failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
