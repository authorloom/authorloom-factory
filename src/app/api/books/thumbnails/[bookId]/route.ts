import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

import { createBookThumbnail, getBook, getBookThumbnail } from "@/lib/db";
import {
  assertAllowedExtension,
  assertSafeOriginalFilename,
  createStoredFilename,
  getFileExtension,
  screenshotImageExtensions,
} from "@/lib/files";
import { requireInternalApiAccess } from "@/lib/internal-api-auth";
import { paths } from "@/lib/paths";

export const runtime = "nodejs";

const maxThumbnailBytes = 25 * 1024 * 1024;

type BookThumbnailRouteContext = {
  params: Promise<{
    bookId: string;
  }>;
};

function getUploadFile(formData: FormData) {
  const file = formData.get("file");

  if (!(file instanceof File)) {
    throw new Error("Upload file is required.");
  }

  if (file.size <= 0) {
    throw new Error("Upload file is empty.");
  }

  return file;
}

function getThumbnailContentType(filepath: string) {
  const extension = getFileExtension(filepath);

  if (extension === "jpg" || extension === "jpeg") {
    return "image/jpeg";
  }

  if (extension === "png") {
    return "image/png";
  }

  if (extension === "webp") {
    return "image/webp";
  }

  return "application/octet-stream";
}

export async function GET(request: Request, context: BookThumbnailRouteContext) {
  const { bookId } = await context.params;
  const { searchParams } = new URL(request.url);
  const thumbnailId = searchParams.get("thumbnailId");

  if (!thumbnailId) {
    return NextResponse.json(
      { error: "Thumbnail ID is required." },
      { status: 400 },
    );
  }

  const thumbnail = getBookThumbnail(bookId, thumbnailId);

  if (!thumbnail) {
    return NextResponse.json(
      { error: "Thumbnail not found." },
      { status: 404 },
    );
  }

  try {
    const bytes = await fs.readFile(thumbnail.filepath);

    return new Response(bytes, {
      headers: {
        "Content-Type": getThumbnailContentType(thumbnail.filepath),
      },
    });
  } catch (error) {
    console.error("Book thumbnail read failed.", error);

    return NextResponse.json(
      { error: "Thumbnail file not found." },
      { status: 404 },
    );
  }
}

export async function POST(request: Request, context: BookThumbnailRouteContext) {
  const unauthorized = requireInternalApiAccess(request);
  if (unauthorized) return unauthorized;

  try {
    const { bookId } = await context.params;
    const book = getBook(bookId);

    if (!book) {
      return NextResponse.json({ error: "Book not found." }, { status: 404 });
    }

    const formData = await request.formData();
    const file = getUploadFile(formData);

    if (file.size > maxThumbnailBytes) {
      return NextResponse.json(
        { error: "Thumbnails must be 25MB or smaller." },
        { status: 413 },
      );
    }

    assertSafeOriginalFilename(file.name);
    assertAllowedExtension(file.name, screenshotImageExtensions);

    const storedFilename = createStoredFilename(file.name);
    const bookDirectory = path.join(paths.thumbnailsDirectory, bookId);
    const filepath = path.join(bookDirectory, storedFilename);
    const bytes = Buffer.from(await file.arrayBuffer());

    await fs.mkdir(bookDirectory, { recursive: true });
    await fs.writeFile(filepath, bytes, { flag: "wx" });

    const assetId = createBookThumbnail({
      bookId,
      filename: storedFilename,
      filepath,
    });

    return NextResponse.json({
      assetId,
      filename: storedFilename,
      filepath,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Book thumbnail upload failed.";
    console.error("Book thumbnail upload failed.", error);

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
