import { google, sheets_v4 } from "googleapis";

import {
  addDriveFileToFolder,
  findDriveChildByName,
  getDriveFile,
  setDriveFileReadableByLink,
} from "@/lib/google";
import {
  assertGoogleServiceAccountConfigured,
  getGoogleAuthClient,
} from "@/lib/google-auth";

export type SheetRow = Array<string | number | boolean | null>;

export function assertGoogleSheetsConfigured() {
  assertGoogleServiceAccountConfigured();
}

export function getSheetsClient(options?: { write?: boolean }) {
  const auth = getGoogleAuthClient({ preferOAuth: options?.write });
  return google.sheets({ version: "v4", auth });
}

export function extractSpreadsheetIdFromUrl(input: string) {
  const trimmed = input.trim();

  if (!trimmed) {
    return null;
  }

  if (!trimmed.includes("/") && /^[a-zA-Z0-9_-]+$/.test(trimmed)) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed);
    const spreadsheetMatch = url.pathname.match(
      /\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/,
    );
    const queryId = url.searchParams.get("id");

    return spreadsheetMatch?.[1] ?? queryId ?? null;
  } catch {
    const looseMatch = trimmed.match(/[-\w]{20,}/);
    return looseMatch?.[0] ?? null;
  }
}

export async function readSheetRows(input: {
  spreadsheetId: string;
  range: string;
}) {
  try {
    const sheets = getSheetsClient();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: input.spreadsheetId,
      range: input.range,
    });

    return (response.data.values ?? []) as sheets_v4.Schema$ValueRange["values"];
  } catch (error) {
    throw wrapSheetsError(
      error,
      `Could not read Google Sheet range ${input.range}`,
    );
  }
}

export async function writeSheetRows(input: {
  spreadsheetId: string;
  range: string;
  rows: SheetRow[];
}) {
  try {
    const sheets = getSheetsClient({ write: true });
    const response = await sheets.spreadsheets.values.update({
      spreadsheetId: input.spreadsheetId,
      range: input.range,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: input.rows,
      },
    });

    return response.data;
  } catch (error) {
    throw wrapSheetsError(
      error,
      `Could not write Google Sheet range ${input.range}`,
    );
  }
}

export async function clearSheetRows(input: {
  spreadsheetId: string;
  range: string;
}) {
  try {
    const sheets = getSheetsClient({ write: true });
    const response = await sheets.spreadsheets.values.clear({
      spreadsheetId: input.spreadsheetId,
      range: input.range,
    });

    return response.data;
  } catch (error) {
    throw wrapSheetsError(
      error,
      `Could not clear Google Sheet range ${input.range}`,
    );
  }
}

export async function appendSheetRows(input: {
  spreadsheetId: string;
  range: string;
  rows: SheetRow[];
}) {
  try {
    const sheets = getSheetsClient({ write: true });
    const response = await sheets.spreadsheets.values.append({
      spreadsheetId: input.spreadsheetId,
      range: input.range,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: input.rows,
      },
    });

    return response.data;
  } catch (error) {
    throw wrapSheetsError(
      error,
      `Could not append Google Sheet rows to ${input.range}`,
    );
  }
}

export async function createSpreadsheet(input: {
  title: string;
  sheetTitle?: string;
}) {
  try {
    const sheets = getSheetsClient({ write: true });
    const response = await sheets.spreadsheets.create({
      requestBody: {
        properties: {
          title: input.title,
        },
        sheets: [
          {
            properties: {
              title: input.sheetTitle ?? "Metricool",
            },
          },
        ],
      },
    });

    return response.data;
  } catch (error) {
    throw wrapSheetsError(error, `Could not create Google Sheet ${input.title}`);
  }
}

async function findOrCreateSpreadsheetTemplate(input: {
  parentFolderId: string;
  title: string;
  sheetTitle: string;
  headers: string[];
}) {
  const existingSpreadsheet = await findDriveChildByName(
    input.parentFolderId,
    input.title,
    "application/vnd.google-apps.spreadsheet",
  );
  const headerRange = `A1:${String.fromCharCode(64 + input.headers.length)}1`;

  if (existingSpreadsheet?.id) {
    await writeSheetRows({
      spreadsheetId: existingSpreadsheet.id,
      range: headerRange,
      rows: [input.headers],
    });

    const existingFile = await getDriveFile(existingSpreadsheet.id);

    return {
      spreadsheetId: existingSpreadsheet.id,
      spreadsheetUrl:
        existingFile.webViewLink ?? existingSpreadsheet.webViewLink ?? null,
      created: false,
    };
  }

  const spreadsheet = await createSpreadsheet({
    title: input.title,
    sheetTitle: input.sheetTitle,
  });

  if (!spreadsheet.spreadsheetId) {
    throw new Error(
      `Google Sheets did not return a ${input.title} spreadsheet ID.`,
    );
  }

  await writeSheetRows({
    spreadsheetId: spreadsheet.spreadsheetId,
    range: headerRange,
    rows: [input.headers],
  });
  await addDriveFileToFolder(spreadsheet.spreadsheetId, input.parentFolderId);
  await setDriveFileReadableByLink(spreadsheet.spreadsheetId);

  const driveFile = await getDriveFile(spreadsheet.spreadsheetId);

  return {
    spreadsheetId: spreadsheet.spreadsheetId,
    spreadsheetUrl: spreadsheet.spreadsheetUrl ?? driveFile.webViewLink ?? null,
    created: true,
  };
}

export async function findOrCreateHooksSpreadsheet(input: {
  parentFolderId: string;
  title?: string;
}) {
  return findOrCreateSpreadsheetTemplate({
    parentFolderId: input.parentFolderId,
    title: input.title ?? "hooks",
    sheetTitle: "hooks",
    headers: ["hook", "screenshot_url"],
  });
}

export async function findOrCreateCaptionsSpreadsheet(input: {
  parentFolderId: string;
  title?: string;
}) {
  return findOrCreateSpreadsheetTemplate({
    parentFolderId: input.parentFolderId,
    title: input.title ?? "captions",
    sheetTitle: "captions",
    headers: ["caption"],
  });
}

export async function findOrCreateHashtagsSpreadsheet(input: {
  parentFolderId: string;
  title?: string;
}) {
  return findOrCreateSpreadsheetTemplate({
    parentFolderId: input.parentFolderId,
    title: input.title ?? "hashtags",
    sheetTitle: "hashtags",
    headers: ["hashtag"],
  });
}

function wrapSheetsError(error: unknown, fallbackMessage: string) {
  if (error instanceof Error) {
    return new Error(`${fallbackMessage}: ${error.message}`);
  }

  return new Error(fallbackMessage);
}
