import fs from "node:fs";
import path from "node:path";

import { google } from "googleapis";

import { env } from "@/lib/env";
import { paths } from "@/lib/paths";

export const googleApiScopes = [
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/devstorage.read_only",
] as const;

export function getGoogleOAuthTokenPath() {
  return env.GOOGLE_OAUTH_TOKEN_PATH
    ? path.resolve(paths.projectRoot, env.GOOGLE_OAUTH_TOKEN_PATH)
    : path.join(paths.dataDirectory, "google-oauth-token.json");
}

export function assertGoogleServiceAccountConfigured() {
  const hasEnvCredentials = Boolean(
    env.GOOGLE_CLIENT_EMAIL && env.GOOGLE_PRIVATE_KEY,
  );
  const hasCredentialsFile = Boolean(env.GOOGLE_APPLICATION_CREDENTIALS);

  if (!hasEnvCredentials && !hasCredentialsFile) {
    throw new Error(
      "Google service account is not configured. Set GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY, or set GOOGLE_APPLICATION_CREDENTIALS to a service account JSON file.",
    );
  }
}

export function assertGoogleOAuthConfigured() {
  if (!env.GOOGLE_OAUTH_CLIENT_ID || !env.GOOGLE_OAUTH_CLIENT_SECRET) {
    throw new Error(
      "Google OAuth is not configured. Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET, then run pnpm google:auth.",
    );
  }
}

export function getGoogleServiceAccountAuth(options?: {
  impersonateWorkspace?: boolean;
}) {
  assertGoogleServiceAccountConfigured();
  const shouldImpersonate =
    options?.impersonateWorkspace ??
    env.GOOGLE_FACTORY_IMPERSONATE_WORKSPACE === "true";
  const subject =
    shouldImpersonate
      ? env.GOOGLE_WORKSPACE_IMPERSONATE_EMAIL
      : undefined;

  if (subject && env.GOOGLE_CLIENT_EMAIL && env.GOOGLE_PRIVATE_KEY) {
    return new google.auth.JWT({
      email: env.GOOGLE_CLIENT_EMAIL,
      key: normalizePrivateKey(env.GOOGLE_PRIVATE_KEY),
      scopes: [...googleApiScopes],
      subject,
    });
  }

  if (subject && env.GOOGLE_APPLICATION_CREDENTIALS) {
    const credentials = JSON.parse(
      fs.readFileSync(env.GOOGLE_APPLICATION_CREDENTIALS, "utf8"),
    ) as {
      client_email?: string;
      private_key?: string;
    };

    if (credentials.client_email && credentials.private_key) {
      return new google.auth.JWT({
        email: credentials.client_email,
        key: normalizePrivateKey(credentials.private_key),
        scopes: [...googleApiScopes],
        subject,
      });
    }
  }

  return new google.auth.GoogleAuth({
    scopes: [...googleApiScopes],
    ...(env.GOOGLE_CLIENT_EMAIL && env.GOOGLE_PRIVATE_KEY
      ? {
          credentials: {
            client_email: env.GOOGLE_CLIENT_EMAIL,
            private_key: normalizePrivateKey(env.GOOGLE_PRIVATE_KEY),
            project_id: env.GOOGLE_PROJECT_ID,
          },
        }
      : { keyFile: env.GOOGLE_APPLICATION_CREDENTIALS }),
  });
}

export function getGoogleOAuthClient() {
  assertGoogleOAuthConfigured();

  const oauthClient = new google.auth.OAuth2(
    env.GOOGLE_OAUTH_CLIENT_ID,
    env.GOOGLE_OAUTH_CLIENT_SECRET,
    env.GOOGLE_OAUTH_REDIRECT_URI ?? "http://localhost:3000/oauth2callback",
  );
  const tokenPath = getGoogleOAuthTokenPath();

  if (!fs.existsSync(tokenPath)) {
    throw new Error(
      `Google OAuth token not found at ${tokenPath}. Run pnpm google:auth to authorize Drive/Sheets writes.`,
    );
  }

  oauthClient.setCredentials(JSON.parse(fs.readFileSync(tokenPath, "utf8")));

  return oauthClient;
}

export function getGoogleAuthClient(options?: { preferOAuth?: boolean }) {
  if (options?.preferOAuth) {
    try {
      return getGoogleOAuthClient();
    } catch {
      return getGoogleServiceAccountAuth();
    }
  }

  try {
    return getGoogleServiceAccountAuth();
  } catch {
    return getGoogleOAuthClient();
  }
}

export function normalizePrivateKey(privateKey: string | undefined) {
  return privateKey?.replace(/\\n/g, "\n");
}
