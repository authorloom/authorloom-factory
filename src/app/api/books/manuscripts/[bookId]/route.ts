import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

import { getBook, updateBookDetails } from "@/lib/db";
import {
  assertAllowedExtension,
  assertSafeOriginalFilename,
  createStoredFilename,
  getFileExtension,
  manuscriptExtensions,
} from "@/lib/files";
import { paths } from "@/lib/paths";

export const runtime = "nodejs";

const maxManuscriptBytes = 100 * 1024 * 1024;

type BookManuscriptContext = {
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

function getManuscriptContentType(filepath: string) {
  const extension = getFileExtension(filepath);

  if (extension === "pdf") {
    return "application/pdf";
  }

  if (extension === "txt") {
    return "text/plain; charset=utf-8";
  }

  if (extension === "doc") {
    return "application/msword";
  }

  if (extension === "docx") {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }

  return "application/octet-stream";
}

export async function GET(_request: Request, context: BookManuscriptContext) {
  const { bookId } = await context.params;
  const book = getBook(bookId);

  if (!book?.manuscript_filepath) {
    return NextResponse.json(
      { error: "Manuscript not found." },
      { status: 404 },
    );
  }

  try {
    const bytes = await fs.readFile(book.manuscript_filepath);
    const filename = path.basename(book.manuscript_filepath);

    return new Response(bytes, {
      headers: {
        "Content-Disposition": `attachment; filename="${filename.replaceAll('"', "")}"`,
        "Content-Type": getManuscriptContentType(book.manuscript_filepath),
      },
    });
  } catch (error) {
    console.error("Book manuscript read failed.", error);

    return NextResponse.json(
      { error: "Manuscript file not found." },
      { status: 404 },
    );
  }
}

export async function POST(request: Request, context: BookManuscriptContext) {
  try {
    const { bookId } = await context.params;
    const book = getBook(bookId);

    if (!book) {
      return NextResponse.json({ error: "Book not found." }, { status: 404 });
    }

    const formData = await request.formData();
    const file = getUploadFile(formData);

    if (file.size > maxManuscriptBytes) {
      return NextResponse.json(
        { error: "Manuscripts must be 100MB or smaller." },
        { status: 413 },
      );
    }

    assertSafeOriginalFilename(file.name);
    assertAllowedExtension(file.name, manuscriptExtensions);

    const storedFilename = createStoredFilename(file.name);
    const bookDirectory = path.join(paths.manuscriptsDirectory, bookId);
    const filepath = path.join(bookDirectory, storedFilename);
    const bytes = Buffer.from(await file.arrayBuffer());

    await fs.mkdir(bookDirectory, { recursive: true });
    await fs.writeFile(filepath, bytes, { flag: "wx" });

    updateBookDetails({
      bookId,
      title: book.title,
      description: book.description,
      manuscriptFilepath: filepath,
    });

    return NextResponse.json({
      filename: storedFilename,
      filepath,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Book manuscript upload failed.";
    console.error("Book manuscript upload failed.", error);

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
