import { spawn } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

import { getCampaignVideoUploadQueueStats } from "@/lib/db";
import { paths } from "@/lib/paths";

export type DriveVideoUploadWorkerStartResult = {
  started: boolean;
  alreadyRunning: boolean;
  queued: number;
  running: number;
  pid?: number;
  logPath?: string;
  message: string;
};

function safeFilePart(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-");
}

function isProcessRunning(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function readLivePid(pidPath: string) {
  try {
    const rawPid = await fsp.readFile(pidPath, "utf8");
    const pid = Number(rawPid.trim());

    if (Number.isInteger(pid) && pid > 0 && isProcessRunning(pid)) {
      return pid;
    }
  } catch {
    return null;
  }

  await fsp.rm(pidPath, { force: true });
  return null;
}

export async function startDriveVideoUploadWorker(
  campaignId: string,
): Promise<DriveVideoUploadWorkerStartResult> {
  const stats = getCampaignVideoUploadQueueStats(campaignId);

  if (stats.queued === 0) {
    return {
      started: false,
      alreadyRunning: stats.running > 0,
      queued: stats.queued,
      running: stats.running,
      message:
        stats.running > 0
          ? "The Drive upload worker is already processing uploads."
          : "There are no queued Drive video uploads to process.",
    };
  }

  const logsDirectory = path.join(paths.dataDirectory, "logs");
  await fsp.mkdir(logsDirectory, { recursive: true });

  const filePart = safeFilePart(campaignId);
  const pidPath = path.join(paths.dataDirectory, `drive-upload-${filePart}.pid`);
  const logPath = path.join(logsDirectory, `drive-upload-${filePart}.log`);
  const existingPid = await readLivePid(pidPath);

  if (existingPid) {
    return {
      started: false,
      alreadyRunning: true,
      queued: stats.queued,
      running: stats.running,
      pid: existingPid,
      logPath,
      message: `Drive upload worker is already running as PID ${existingPid}.`,
    };
  }

  const logFd = fs.openSync(logPath, "a");
  const child = spawn(
    "pnpm",
    ["upload:drive-worker", "--", "--campaign", campaignId],
    {
      cwd: paths.projectRoot,
      detached: true,
      env: process.env,
      stdio: ["ignore", logFd, logFd],
    },
  );

  child.unref();
  fs.closeSync(logFd);

  if (!child.pid) {
    fs.closeSync(logFd);
    throw new Error("Could not start the Drive upload worker process.");
  }

  await fsp.writeFile(pidPath, String(child.pid));

  return {
    started: true,
    alreadyRunning: false,
    queued: stats.queued,
    running: stats.running,
    pid: child.pid,
    logPath,
    message: `Drive upload worker started as PID ${child.pid}.`,
  };
}
