import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";

import { createBookBackground, getBook, getBookBackground } from "@/lib/db";
import {
  assertAllowedExtension,
  assertSafeOriginalFilename,
  backgroundVideoExtensions,
  createStoredFilename,
  getFileExtension,
} from "@/lib/files";
import { requireInternalApiAccess } from "@/lib/internal-api-auth";
import { paths } from "@/lib/paths";

export const runtime = "nodejs";

const maxBackgroundBytes = 500 * 1024 * 1024;

type BookAssetUploadContext = {
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

function getBackgroundContentType(filepath: string) {
  const extension = getFileExtension(filepath);

  if (extension === "mov") {
    return "video/quicktime";
  }

  if (extension === "mp4" || extension === "m4v") {
    return "video/mp4";
  }

  return "application/octet-stream";
}

function parseRangeHeader(rangeHeader: string, fileSize: number) {
  const match = rangeHeader.match(/^bytes=(\d*)-(\d*)$/);

  if (!match) {
    return null;
  }

  const [, startValue, endValue] = match;

  if (!startValue && !endValue) {
    return null;
  }

  if (!startValue) {
    const suffixLength = Number(endValue);

    if (!Number.isInteger(suffixLength) || suffixLength <= 0) {
      return null;
    }

    return {
      start: Math.max(fileSize - suffixLength, 0),
      end: fileSize - 1,
    };
  }

  const start = Number(startValue);
  const end = endValue ? Number(endValue) : fileSize - 1;

  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end < start ||
    start >= fileSize
  ) {
    return null;
  }

  return {
    start,
    end: Math.min(end, fileSize - 1),
  };
}

function fileStream(filepath: string, options?: { start: number; end: number }) {
  return Readable.toWeb(createReadStream(filepath, options)) as ReadableStream;
}

export async function GET(request: Request, context: BookAssetUploadContext) {
  const { bookId } = await context.params;
  const { searchParams } = new URL(request.url);
  const backgroundId = searchParams.get("backgroundId");

  if (!backgroundId) {
    return NextResponse.json(
      { error: "Background ID is required." },
      { status: 400 },
    );
  }

  const background = getBookBackground(bookId, backgroundId);

  if (!background) {
    return NextResponse.json(
      { error: "Background not found." },
      { status: 404 },
    );
  }

  try {
    const stat = await fs.stat(background.filepath);
    const contentType = getBackgroundContentType(background.filepath);
    const rangeHeader = request.headers.get("range");

    if (rangeHeader) {
      const range = parseRangeHeader(rangeHeader, stat.size);

      if (!range) {
        return new Response(null, {
          status: 416,
          headers: {
            "Accept-Ranges": "bytes",
            "Content-Range": `bytes */${stat.size}`,
          },
        });
      }

      const contentLength = range.end - range.start + 1;

      return new Response(fileStream(background.filepath, range), {
        status: 206,
        headers: {
          "Accept-Ranges": "bytes",
          "Content-Length": String(contentLength),
          "Content-Range": `bytes ${range.start}-${range.end}/${stat.size}`,
          "Content-Type": contentType,
        },
      });
    }

    return new Response(fileStream(background.filepath), {
      headers: {
        "Accept-Ranges": "bytes",
        "Content-Length": String(stat.size),
        "Content-Type": contentType,
      },
    });
  } catch (error) {
    console.error("Book background read failed.", error);

    return NextResponse.json(
      { error: "Background file not found." },
      { status: 404 },
    );
  }
}

export async function POST(request: Request, context: BookAssetUploadContext) {
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

    if (file.size > maxBackgroundBytes) {
      return NextResponse.json(
        { error: "Background videos must be 500MB or smaller." },
        { status: 413 },
      );
    }

    assertSafeOriginalFilename(file.name);
    assertAllowedExtension(file.name, backgroundVideoExtensions);

    const storedFilename = createStoredFilename(file.name);
    const bookDirectory = path.join(paths.backgroundsDirectory, bookId);
    const filepath = path.join(bookDirectory, storedFilename);
    const bytes = Buffer.from(await file.arrayBuffer());

    await fs.mkdir(bookDirectory, { recursive: true });
    await fs.writeFile(filepath, bytes, { flag: "wx" });

    const assetId = createBookBackground({
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
      error instanceof Error ? error.message : "Book background upload failed.";
    console.error("Book background upload failed.", error);

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
