import { NextResponse } from "next/server";
import { z } from "zod";

import { extractDriveIdFromUrl, getDriveFile } from "@/lib/google";

export const runtime = "nodejs";

const testDriveFolderSchema = z.object({
  driveFolderUrl: z.string().trim().min(1, "Drive folder URL is required."),
});

export async function POST(request: Request) {
  try {
    const payload = testDriveFolderSchema.safeParse(await request.json());

    if (!payload.success) {
      return NextResponse.json(
        { error: z.prettifyError(payload.error) },
        { status: 400 },
      );
    }

    const folderId = extractDriveIdFromUrl(payload.data.driveFolderUrl);

    if (!folderId) {
      return NextResponse.json(
        { error: "Enter a valid Google Drive folder URL." },
        { status: 400 },
      );
    }

    const driveFile = await getDriveFile(folderId);

    if (driveFile.mimeType !== "application/vnd.google-apps.folder") {
      return NextResponse.json(
        { error: "The Drive URL points to a file, not a folder." },
        { status: 400 },
      );
    }

    return NextResponse.json({
      ok: true,
      folderId,
      name: driveFile.name ?? "Drive folder",
      url: driveFile.webViewLink ?? payload.data.driveFolderUrl,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not test Drive folder.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
