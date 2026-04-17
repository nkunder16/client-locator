import { NextResponse } from 'next/server';
import { getSheetsClient, getSheetTitle, checkWriteConfig, FIELD_COLS } from '@/lib/sheets';
import { invalidateCache } from '@/lib/cache';

export async function POST(req: Request) {
  const configError = checkWriteConfig();
  if (configError) return NextResponse.json({ error: configError }, { status: 500 });

  const { name, updates } = (await req.json()) as {
    name: string;
    updates: Record<string, string>;
  };
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });

  const sheetId = process.env.GOOGLE_SHEET_ID!;
  const sheets = getSheetsClient();
  const sheetTitle = await getSheetTitle(sheetId);

  // Find the row number by matching the Name column (skip header row at index 0)
  const namesRes = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${sheetTitle}!A:A`,
  });
  const nameRows = namesRes.data.values ?? [];
  const rowIndex = nameRows.findIndex(
    (r, i) => i > 0 && r[0]?.toString().toLowerCase() === name.toLowerCase(),
  );
  if (rowIndex === -1) {
    return NextResponse.json({ error: `Client "${name}" not found` }, { status: 404 });
  }
  const sheetRow = rowIndex + 1; // Sheets API is 1-based

  const data = Object.entries(updates)
    .filter(([k]) => FIELD_COLS[k])
    .map(([k, v]) => ({
      range: `${sheetTitle}!${FIELD_COLS[k]}${sheetRow}`,
      values: [[v ?? '']],
    }));

  if (data.length > 0) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: sheetId,
      requestBody: { valueInputOption: 'RAW', data },
    });
  }

  invalidateCache('all-clients');
  return NextResponse.json({ ok: true });
}
