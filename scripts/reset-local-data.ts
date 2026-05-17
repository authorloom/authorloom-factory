import fs from "node:fs/promises";
import path from "node:path";

import { closeDatabase, getDatabase, initializeDatabase } from "../src/lib/db";
import { paths } from "../src/lib/paths";

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function pathExists(filepath: string) {
  try {
    await fs.access(filepath);
    return true;
  } catch {
    return false;
  }
}

async function clearDirectoryPreservingGitkeep(directory: string) {
  await fs.mkdir(directory, { recursive: true });

  const entries = await fs.readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name === ".gitkeep") {
      continue;
    }

    await fs.rm(path.join(directory, entry.name), {
      recursive: true,
      force: true,
    });
  }
}

async function resetDatabase() {
  const backupDirectory = path.join(paths.dataDirectory, "backups");
  const backupPath = path.join(
    backupDirectory,
    `booktok-factory-before-reset-${timestamp()}.sqlite`,
  );

  await fs.mkdir(backupDirectory, { recursive: true });

  let createdBackupPath: string | null = null;

  if (await pathExists(paths.sqliteDatabaseFile)) {
    await fs.copyFile(paths.sqliteDatabaseFile, backupPath);
    createdBackupPath = backupPath;
    await fs.rm(paths.sqliteDatabaseFile, { force: true });
  }

  const db = getDatabase();
  initializeDatabase(db);
  closeDatabase();

  return createdBackupPath;
}

async function main() {
  closeDatabase();

  const backupPath = await resetDatabase();
  const storageDirectories = [
    paths.coversDirectory,
    paths.manuscriptsDirectory,
    paths.screenshotsDirectory,
    paths.backgroundsDirectory,
    paths.audioDirectory,
    paths.sourceVideosDirectory,
    paths.rendersDirectory,
    paths.exportsDirectory,
  ];

  for (const directory of storageDirectories) {
    await clearDirectoryPreservingGitkeep(directory);
  }

  console.log("Reset local BookTok Factory data.");
  console.log(
    backupPath ? `Database backup: ${backupPath}` : "Database backup: none",
  );
  console.log(`SQLite database recreated: ${paths.sqliteDatabaseFile}`);
  console.log("Cleared storage folders:");

  for (const directory of storageDirectories) {
    console.log(`- ${directory}`);
  }
}

main().catch((error) => {
  console.error("Failed to reset local data.");
  console.error(error);
  process.exitCode = 1;
});
