import { closeDatabase } from "../src/lib/db";
import {
  defaultAuthorloomHandoffDirectory,
  importAuthorloomRenderHandoffAndMark,
  importPendingAuthorloomHandoffs,
  listAuthorloomHandoffQueue,
  type AuthorloomHandoffImportResult,
} from "../src/lib/authorloom-handoff";

const args = process.argv.slice(2);
let force = false;
let listOnly = false;
let directory = defaultAuthorloomHandoffDirectory;
let handoffPath: string | undefined;
let parseError: string | null = null;

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];

  if (arg === "--force") {
    force = true;
    continue;
  }

  if (arg === "--list") {
    listOnly = true;
    continue;
  }

  if (arg === "--dir") {
    const nextArg = args[index + 1];

    if (!nextArg) {
      parseError = "--dir requires a directory path.";
      break;
    }

    directory = nextArg;
    index += 1;
    continue;
  }

  handoffPath = arg;
}

function printImportedHandoff(result: AuthorloomHandoffImportResult) {
  console.log(`Handoff: ${result.handoffPath}`);
  console.log(`Contract: ${result.contractVersion}`);
  console.log(
    `Author: ${result.author.name} (${result.author.id}) ${
      result.authorCreated ? "created" : "reused"
    }`,
  );
  console.log(
    `Book: ${result.book.title} (${result.book.id}) ${
      result.bookCreated ? "created" : "reused"
    }`,
  );
  console.log(
    `Campaign: ${result.campaign.name} (${result.campaign.id}) ${
      result.campaignCreated ? "created" : "reused"
    }`,
  );
  console.log(
    `Render batch: ${result.batch.name} (${result.batch.id}) ${
      result.batchCreated ? "created" : "reused"
    }`,
  );
  console.log(`Next: ${result.nextUrl}`);

  for (const warning of result.warnings) {
    console.warn(`Note: ${warning}`);
  }
}

try {
  if (parseError) {
    throw new Error(parseError);
  }

  if (listOnly) {
    const queue = listAuthorloomHandoffQueue(directory);

    console.log(`Authorloom handoff queue: ${directory}`);

    if (queue.length === 0) {
      console.log("No handoff JSON files found.");
    }

    for (const item of queue) {
      console.log(
        `${item.imported ? "imported" : "pending"} ${item.handoffPath}${
          item.importedAt ? ` (${item.importedAt})` : ""
        }`,
      );
    }
  } else if (handoffPath) {
    console.log("Importing Authorloom render batch handoff.");
    printImportedHandoff(
      importAuthorloomRenderHandoffAndMark(handoffPath, { force }),
    );
  } else {
    const result = importPendingAuthorloomHandoffs(directory, { force });

    console.log(`Imported Authorloom handoffs from: ${result.directory}`);
    console.log(`Imported: ${result.imported.length}`);
    console.log(`Skipped already imported: ${result.skipped.length}`);
    console.log(`Failed: ${result.failed.length}`);

    for (const imported of result.imported) {
      console.log("");
      printImportedHandoff(imported);
    }

    for (const skipped of result.skipped) {
      console.log(
        `Skipped already imported: ${skipped.handoffPath} -> ${skipped.nextUrl}`,
      );
    }

    for (const failed of result.failed) {
      console.error(`Failed: ${failed.handoffPath}`);
      console.error(failed.error);
    }
  }
} catch (error) {
  console.error("Failed to import Authorloom render batch handoff.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  closeDatabase();
}
