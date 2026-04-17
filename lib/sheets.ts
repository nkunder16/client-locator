import { google } from 'googleapis';

// Column letter for each editable field (matches sheet column order)
export const FIELD_COLS: Record<string, string> = {
  name: 'A', type: 'B', city: 'C', country: 'D',
  priority: 'H', lastMet: 'I', coverage: 'J', notes: 'K',
};

let sheetTitleCache: string | null = null;

export function getSheetsClient() {
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: (process.env.GOOGLE_PRIVATE_KEY ?? '').replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

export async function getSheetTitle(spreadsheetId: string): Promise<string> {
  if (sheetTitleCache) return sheetTitleCache;
  const sheets = getSheetsClient();
  const gid = parseInt(process.env.GOOGLE_SHEET_GID ?? '0');
  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties' });
  const sheet = meta.data.sheets?.find((s) => s.properties?.sheetId === gid);
  sheetTitleCache = sheet?.properties?.title ?? 'Sheet1';
  return sheetTitleCache;
}

export function checkWriteConfig(): string | null {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
    return 'Write access requires GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY in .env.local';
  }
  if (!process.env.GOOGLE_SHEET_ID) {
    return 'GOOGLE_SHEET_ID is not configured';
  }
  return null;
}
