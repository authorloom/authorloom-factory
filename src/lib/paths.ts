import path from "node:path";

import { env } from "@/lib/env";

const projectRoot = env.BOOKTOK_PROJECT_ROOT
  ? path.resolve(/* turbopackIgnore: true */ env.BOOKTOK_PROJECT_ROOT)
  : process.cwd();
const dataDirectory = path.join(projectRoot, "data");
const storageDirectory = path.join(projectRoot, "storage");

export const paths = {
  projectRoot,
  dataDirectory,
  storageDirectory,
  backgroundsDirectory: path.join(storageDirectory, "backgrounds"),
  screenshotsDirectory: path.join(storageDirectory, "screenshots"),
  thumbnailsDirectory: path.join(storageDirectory, "thumbnails"),
  coversDirectory: path.join(storageDirectory, "covers"),
  manuscriptsDirectory: path.join(storageDirectory, "manuscripts"),
  audioDirectory: path.join(storageDirectory, "audio"),
  sourceVideosDirectory: path.join(storageDirectory, "source-videos"),
  rendersDirectory: path.join(storageDirectory, "renders"),
  exportsDirectory: path.join(storageDirectory, "exports"),
  sqliteDatabaseFile:
    env.BOOKTOK_DATABASE_PATH ??
    path.join(process.cwd(), "data", "booktok-factory.sqlite"),
} as const;
