#!/usr/bin/env node

import { execFileSync } from "node:child_process";

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function fail(message) {
  console.error(`\nProduction deploy base check failed:\n${message}\n`);
  process.exit(1);
}

try {
  git(["fetch", "origin", "main", "--quiet"]);

  const currentBranch = git(["branch", "--show-current"]) || "(detached HEAD)";
  const dirtyStatus = git(["status", "--porcelain"]);
  const missingFromHead = git(["log", "--oneline", "HEAD..origin/main"]);
  const aheadOfMain = git(["log", "--oneline", "origin/main..HEAD"]);

  if (dirtyStatus) {
    fail(
      [
        `Current branch: ${currentBranch}`,
        "The working tree is not clean:",
        dirtyStatus,
        "",
        "Do not build or deploy production from uncommitted local state.",
        "Commit or discard local changes, then run this check again.",
      ].join("\n"),
    );
  }

  if (missingFromHead) {
    fail(
      [
        `Current branch: ${currentBranch}`,
        "This branch is missing commits from origin/main:",
        missingFromHead,
        "",
        "Do not build or deploy production from this branch.",
        "Rebase/cherry-pick the hotfix onto current origin/main first.",
      ].join("\n"),
    );
  }

  if (!aheadOfMain) {
    console.log(`Production deploy base check passed: ${currentBranch} matches origin/main.`);
    process.exit(0);
  }

  console.log(
    [
      `Production deploy base check passed: ${currentBranch} contains current origin/main.`,
      "Commits that will be included in addition to origin/main:",
      aheadOfMain,
    ].join("\n"),
  );
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
