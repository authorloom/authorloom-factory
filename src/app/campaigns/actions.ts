"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { campaignSlugExistsForBook, createCampaign } from "@/lib/db";
import {
  createCampaignDriveFolderForBook,
  extractDriveIdFromUrl,
  getDriveFile,
} from "@/lib/google";
import { slugifyCampaignName } from "@/lib/slugs";

const campaignFormSchema = z.object({
  name: z.string().trim().min(1, "Campaign name is required."),
  description: z.string().optional(),
  bookId: z.string().optional(),
  layoutId: z.string().optional(),
  goal: z.string().optional(),
  driveCampaignFolderUrl: z.string().optional(),
});

function getFormString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export async function createCampaignAction(formData: FormData) {
  const parsed = campaignFormSchema.safeParse({
    name: getFormString(formData, "name"),
    description: getFormString(formData, "description"),
    bookId: getFormString(formData, "bookId"),
    layoutId: getFormString(formData, "layoutId"),
    goal: getFormString(formData, "goal"),
    driveCampaignFolderUrl: getFormString(
      formData,
      "driveCampaignFolderUrl",
    ),
  });

  if (!parsed.success) {
    throw new Error(z.prettifyError(parsed.error));
  }

  let campaignId: string;

  try {
    const bookId = parsed.data.bookId?.trim() ?? "";
    const driveCampaignFolderUrl =
      parsed.data.driveCampaignFolderUrl?.trim() ?? "";
    const slug = slugifyCampaignName(parsed.data.name);

    if (!slug) {
      throw new Error("Campaign name must include letters or numbers.");
    }

    if (bookId && campaignSlugExistsForBook(bookId, slug)) {
      throw new Error("A campaign with this slug already exists for this book.");
    }

    let resolvedDriveCampaignFolderUrl: string | null =
      driveCampaignFolderUrl || null;
    let resolvedDriveCampaignFolderId: string | null = null;

    if (driveCampaignFolderUrl) {
      resolvedDriveCampaignFolderId = extractDriveIdFromUrl(
        driveCampaignFolderUrl,
      );

      if (!resolvedDriveCampaignFolderId) {
        throw new Error("Enter a valid Google Drive campaign folder URL.");
      }

      const driveFile = await getDriveFile(resolvedDriveCampaignFolderId);

      if (driveFile.mimeType !== "application/vnd.google-apps.folder") {
        throw new Error("The Campaign Drive URL points to a file, not a folder.");
      }

      resolvedDriveCampaignFolderUrl =
        driveFile.webViewLink ?? driveCampaignFolderUrl;
    } else if (bookId) {
      const driveFolder = await createCampaignDriveFolderForBook({
        bookId,
        slug,
      });

      resolvedDriveCampaignFolderId = driveFolder.folderId;
      resolvedDriveCampaignFolderUrl = driveFolder.folderUrl;
    }

    campaignId = createCampaign({
      ...parsed.data,
      slug,
      driveCampaignFolderUrl: resolvedDriveCampaignFolderUrl,
      driveCampaignFolderId: resolvedDriveCampaignFolderId,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not create campaign.";
    redirect(`/campaigns/new?error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/");
  revalidatePath("/campaigns");
  redirect(`/campaigns/${campaignId}`);
}
