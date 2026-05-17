"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import {
  createAuthor,
  deleteSeriesIfEmpty,
  getAuthor,
  updateAuthorDriveFolder,
} from "@/lib/db";
import {
  extractDriveIdFromUrl,
  findSharedDriveFoldersByName,
  getDriveFile,
} from "@/lib/google";

const newAuthorSchema = z.object({
  name: z.string().trim().min(1, "Author name is required."),
});

function getFormString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export async function createAuthorAction(formData: FormData) {
  const parsed = newAuthorSchema.safeParse({
    name: getFormString(formData, "name"),
  });

  if (!parsed.success) {
    throw new Error(z.prettifyError(parsed.error));
  }

  const authorId = createAuthor({ name: parsed.data.name });

  revalidatePath("/");
  revalidatePath("/authors");
  redirect(`/authors/${authorId}`);
}

export async function syncAuthorDriveFolderAction(
  authorId: string,
  formData: FormData,
) {
  const author = getAuthor(authorId);

  if (!author) {
    throw new Error("Author not found.");
  }

  const driveFolderUrl = getFormString(formData, "driveFolderUrl");
  const driveFolderId = extractDriveIdFromUrl(driveFolderUrl);

  if (!driveFolderUrl.trim() || !driveFolderId) {
    redirect(
      `/authors/${authorId}?driveSync=error&message=${encodeURIComponent(
        "Enter a Google Drive author folder URL before syncing.",
      )}`,
    );
  }

  let folderName = driveFolderId;

  try {
    const driveFile = await getDriveFile(driveFolderId);

    if (driveFile.mimeType !== "application/vnd.google-apps.folder") {
      throw new Error("The Drive URL points to a file, not a folder.");
    }

    folderName = driveFile.name ?? driveFolderId;

    updateAuthorDriveFolder({
      authorId,
      driveFolderUrl,
      driveFolderId,
    });

    revalidatePath(`/authors/${authorId}`);
    revalidatePath("/authors");
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Could not verify the Google Drive author folder.";

    redirect(
      `/authors/${authorId}?driveSync=error&message=${encodeURIComponent(
        message,
      )}`,
    );
  }

  redirect(
    `/authors/${authorId}?driveSync=success&message=${encodeURIComponent(
      `Connected Author Drive folder: ${folderName}`,
    )}`,
  );
}

export async function findSharedAuthorDriveFolderAction(authorId: string) {
  const author = getAuthor(authorId);

  if (!author) {
    throw new Error("Author not found.");
  }

  let successMessage: string | null = null;

  try {
    const folders = await findSharedDriveFoldersByName(author.slug);

    if (folders.length === 0) {
      throw new Error(`No shared Drive folder named ${author.slug} was found yet.`);
    }

    if (folders.length > 1) {
      const candidates = folders
        .slice(0, 3)
        .map((folder) => `${folder.name ?? author.slug}: ${folder.webViewLink ?? folder.id}`)
        .join(" | ");

      throw new Error(
        `Multiple folders named ${author.slug} were found. Paste the correct URL manually. Candidates: ${candidates}`,
      );
    }

    const folder = folders[0];

    if (!folder?.id) {
      throw new Error("Google Drive did not return a folder ID.");
    }

    updateAuthorDriveFolder({
      authorId,
      driveFolderId: folder.id,
      driveFolderUrl: folder.webViewLink ?? null,
    });

    revalidatePath(`/authors/${authorId}`);
    revalidatePath("/authors");
    successMessage = `Connected Author Drive folder: ${folder.name ?? author.slug}`;
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Could not search for the shared author Drive folder.";

    redirect(
      `/authors/${authorId}?driveSync=error&message=${encodeURIComponent(
        message,
      )}`,
    );
  }

  redirect(
    `/authors/${authorId}?driveSync=success&message=${encodeURIComponent(
      successMessage ?? "Connected Author Drive folder.",
    )}`,
  );
}

export async function deleteAuthorSeriesAction(
  authorId: string,
  seriesId: string,
) {
  try {
    deleteSeriesIfEmpty(authorId, seriesId);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not delete series.";

    redirect(
      `/authors/${authorId}?seriesDelete=error&message=${encodeURIComponent(
        message,
      )}`,
    );
  }

  revalidatePath(`/authors/${authorId}`);
  revalidatePath("/authors");
  redirect(
    `/authors/${authorId}?seriesDelete=success&message=${encodeURIComponent(
      "Series deleted.",
    )}`,
  );
}
