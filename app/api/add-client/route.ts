import { NextResponse } from 'next/server';
import { getSheetsClient, getSheetTitle, checkWriteConfig } from '@/lib/sheets';
import { invalidateCache } from '@/lib/cache';

export async function POST(req: Request) {
  const configError = checkWriteConfig();
  if (configError) return NextResponse.json({ error: configError }, { status: 500 });

  const body = (await req.json()) as {
    name: string;
    type?: string;
    city?: string;
    priority?: string;
    coverage?: string;
    notes?: string;
  };

  if (!body.name?.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  const sheetId = process.env.GOOGLE_SHEET_ID!;
  const sheets = getSheetsClient();
  const sheetTitle = await getSheetTitle(sheetId);

  // Row order: Name, Type, City, Country, Latitude, Longitude, Address, Priority, Last Met, Coverage, Notes
  const row = [
    body.name.trim(),
    body.type?.trim() || 'Company',
    body.city?.trim() || '',
    '', // Country
    '', // Latitude
    '', // Longitude
    '', // Address
    body.priority?.trim() || 'Low',
    '', // Last Met — set later via Met Today
    body.coverage?.trim() || '',
    body.notes?.trim() || '',
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: `${sheetTitle}!A:K`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [row] },
  });

  invalidateCache('all-clients');
  return NextResponse.json({ ok: true });
}
