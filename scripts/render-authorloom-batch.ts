import { closeDatabase } from "../src/lib/db";
import { renderImportedAuthorloomBatch } from "../src/lib/authorloom-render-worker";

const args = process.argv.slice(2);
let handoffPath: string | undefined;
let batchId: string | undefined;
let forceImport = false;
let allowLargeBatch = false;
let parseError: string | null = null;

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];

  if (arg === "--force-import") {
    forceImport = true;
    continue;
  }

  if (arg === "--allow-large-batch") {
    allowLargeBatch = true;
    continue;
  }

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
  console.error("  pnpm handoff:render /path/to/render-batch-handoff.json");
  console.error("  pnpm handoff:render --batch <booktok-render-batch-id>");
  console.error("Options:");
  console.error("  --force-import       Re-import the handoff path before rendering.");
  console.error("  --allow-large-batch  Allow generation above the 1000-job guardrail.");
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

  const result = await renderImportedAuthorloomBatch(
    batchId
      ? {
          batchId,
          allowLargeBatch,
        }
      : {
          handoffPath: handoffPath as string,
          forceImport,
          allowLargeBatch,
        },
  );

  console.log("Rendered imported Authorloom batch.");
  console.log(`Batch: ${result.batchId}`);
  console.log(`Handoff: ${result.handoffPath ?? "n/a"}`);
  console.log(`Imported during run: ${result.importedDuringRun ? "yes" : "no"}`);
  console.log(`Jobs preview: ${result.jobsPreview}`);
  console.log(`Jobs created: ${result.jobsCreated}`);
  console.log(`Jobs skipped duplicates: ${result.jobsSkipped}`);
  console.log(`Pending jobs before render: ${result.pendingBeforeRender}`);
  console.log(`Rendered: ${result.rendered}`);
  console.log(`Failed: ${result.failed}`);

  for (const error of result.errors) {
    console.error(error);
  }
}

main().catch((error: unknown) => {
  console.error("Failed to render imported Authorloom batch.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}).finally(() => {
  closeDatabase();
});
