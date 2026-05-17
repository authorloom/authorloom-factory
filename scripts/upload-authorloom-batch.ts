import { closeDatabase } from "../src/lib/db";
import { uploadImportedAuthorloomBatchOutputs } from "../src/lib/authorloom-upload-worker";

const args = process.argv.slice(2);
let handoffPath: string | undefined;
let batchId: string | undefined;
let parseError: string | null = null;

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];

  if (arg === "--batch") {
    const nextArg = args[index + 1];

    if (!nextArg) {
      parseError = "--batch requires a render batch ID.";
      break;
    }

    batchId = nextArg;
    index += 1;
    continue;
  }

  handoffPath = arg;
}

function printUsage() {
  console.error("Usage:");
  console.error("  pnpm handoff:upload /path/to/render-batch-handoff.json");
  console.error("  pnpm handoff:upload --batch <booktok-render-batch-id>");
}

async function main() {
  if (parseError) {
    throw new Error(parseError);
  }

  if (!handoffPath && !batchId) {
    printUsage();
    process.exit(1);
  }

  if (handoffPath && batchId) {
    throw new Error("Pass either a handoff path or --batch, not both.");
  }

  const result = await uploadImportedAuthorloomBatchOutputs(
    batchId ? { batchId } : { handoffPath: handoffPath as string },
  );

  console.log("Uploaded imported Authorloom batch outputs.");
  console.log(`Batch: ${result.batchId}`);
  console.log(`Handoff: ${result.handoffPath ?? "n/a"}`);
  console.log(`Report: ${result.reportPath ?? "n/a"}`);
  console.log(`Rendered jobs: ${result.rendered}`);
  console.log(`Uploaded now: ${result.uploaded}`);
  console.log(`Skipped already uploaded: ${result.skippedAlreadyUploaded}`);
  console.log(`Failed uploads: ${result.failed}`);
  console.log(`Reported videos: ${result.videoCount}`);

  for (const error of result.errors) {
    console.error(error);
  }
}

main()
  .catch((error: unknown) => {
    console.error("Failed to upload imported Authorloom batch outputs.");
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => {
    closeDatabase();
  });
