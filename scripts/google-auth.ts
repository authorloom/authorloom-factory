import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import { google } from "googleapis";

async function main() {
  loadDotEnvLocal();
  const { env } = await import("../src/lib/env");
  const { getGoogleOAuthTokenPath, googleApiScopes } = await import(
    "../src/lib/google-auth"
  );

  if (!env.GOOGLE_OAUTH_CLIENT_ID || !env.GOOGLE_OAUTH_CLIENT_SECRET) {
    throw new Error(
      "Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET before running google:auth.",
    );
  }

  const oauthClient = new google.auth.OAuth2(
    env.GOOGLE_OAUTH_CLIENT_ID,
    env.GOOGLE_OAUTH_CLIENT_SECRET,
    env.GOOGLE_OAUTH_REDIRECT_URI ?? "http://localhost:3000/oauth2callback",
  );
  const authUrl = oauthClient.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [...googleApiScopes],
  });

  console.log("\nOpen this URL in Chrome and authorize BookTok Factory:\n");
  console.log(authUrl);
  console.log(
    "\nAfter authorizing, paste the code from the redirect URL here.\n",
  );

  const rl = readline.createInterface({ input, output });
  const rawCode = (await rl.question("OAuth code or redirect URL: ")).trim();
  rl.close();

  const code = extractOAuthCode(rawCode);

  if (!code) {
    throw new Error("OAuth code is required.");
  }

  const { tokens } = await oauthClient.getToken(code);
  const tokenPath = getGoogleOAuthTokenPath();

  await fs.mkdir(path.dirname(tokenPath), { recursive: true });
  await fs.writeFile(tokenPath, JSON.stringify(tokens, null, 2), {
    mode: 0o600,
  });

  console.log(`\nSaved Google OAuth token to ${tokenPath}`);
}

function loadDotEnvLocal() {
  const envFilepath = path.join(process.cwd(), ".env.local");

  if (!fsSync.existsSync(envFilepath)) {
    return;
  }

  const contents = fsSync.readFileSync(envFilepath, "utf8");

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

function extractOAuthCode(input: string) {
  if (!input) {
    return "";
  }

  try {
    const url = new URL(input);
    return url.searchParams.get("code") ?? input;
  } catch {
    return input;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
