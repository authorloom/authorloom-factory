import { z } from "zod";
import fs from "node:fs";
import path from "node:path";

function loadEnvFileIfPresent(filepath: string) {
  if (!fs.existsSync(filepath)) {
    return;
  }

  const contents = fs.readFileSync(filepath, "utf8");

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const separator = line.indexOf("=");

    if (separator <= 0) {
      continue;
    }

    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();

    if (!key || !value) {
      continue;
    }

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnvFileIfPresent(path.resolve(process.cwd(), ".env.local"));

const optionalString = z
  .string()
  .trim()
  .transform((value) => (value.length > 0 ? value : undefined))
  .optional();

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  BOOKTOK_PROJECT_ROOT: optionalString,
  BOOKTOK_DATABASE_PATH: optionalString,
  GOOGLE_CLIENT_EMAIL: optionalString,
  GOOGLE_PRIVATE_KEY: optionalString,
  GOOGLE_PROJECT_ID: optionalString,
  GOOGLE_DRIVE_ROOT_FOLDER_ID: optionalString,
  GOOGLE_APPLICATION_CREDENTIALS: optionalString,
  GOOGLE_OAUTH_CLIENT_ID: optionalString,
  GOOGLE_OAUTH_CLIENT_SECRET: optionalString,
  GOOGLE_OAUTH_REDIRECT_URI: optionalString,
  GOOGLE_OAUTH_TOKEN_PATH: optionalString,
  GOOGLE_OAUTH_TOKEN_JSON: optionalString,
  GOOGLE_WORKSPACE_IMPERSONATE_EMAIL: optionalString,
  GOOGLE_FACTORY_IMPERSONATE_WORKSPACE: optionalString,
  GOOGLE_FACTORY_PREFER_OAUTH_WRITES: optionalString,
  AUTHORLOOM_PREVIEW_BUCKET: optionalString,
  GOOGLE_CLOUD_STORAGE_BUCKET: optionalString,
  AUTHORLOOM_PREVIEW_OBJECT_PREFIX: optionalString,
  GOOGLE_CLOUD_STORAGE_PREFIX: optionalString,
  AUTHORLOOM_FACTORY_API_TOKEN: optionalString,
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  const message = z.prettifyError(parsedEnv.error);
  throw new Error(`Invalid environment configuration:\n${message}`);
}

export const env = parsedEnv.data;
