import { google } from 'googleapis';
import path from 'path';

export function extractSpreadsheetId(url: string): string | null {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

export function buildSpreadsheetRowUrl(
  spreadsheetUrl: string,
  sheetName: string,
  rowNumber: number
): string {
  const id = extractSpreadsheetId(spreadsheetUrl);
  if (!id) return spreadsheetUrl;
  // Link to specific cell in the sheet
  return `https://docs.google.com/spreadsheets/d/${id}/edit#gid=0&range=A${rowNumber}`;
}

export async function readSheetData(
  credentialsPath: string,
  spreadsheetUrl: string,
  sheetName: string,
): Promise<string[][]> {
  const spreadsheetId = extractSpreadsheetId(spreadsheetUrl);
  if (!spreadsheetId) throw new Error('Invalid spreadsheet URL');

  const absPath = path.isAbsolute(credentialsPath)
    ? credentialsPath
    : path.join(process.cwd(), '..', credentialsPath);

  const auth = new google.auth.GoogleAuth({
    keyFile: absPath,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });

  const sheets = google.sheets({ version: 'v4', auth });
  const sheetTitle = sheetName || 'Sheet1';

  // Step 1: Fetch only header row to determine column range
  const headerRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${sheetTitle}'!1:1`,
    valueRenderOption: 'UNFORMATTED_VALUE',
  });
  const headers = headerRes.data.values?.[0] || [];
  if (headers.length === 0) return [];

  // Step 2: Fetch data limited to header columns only (avoids stray data in far columns pulling in 36k+ rows)
  const lastCol = columnIndexToLetter(headers.length - 1);
  const dataRange = `'${sheetTitle}'!A:${lastCol}`;
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: dataRange,
    valueRenderOption: 'UNFORMATTED_VALUE',
  });

  const values = (response.data.values || []) as string[][];
  if (values.length <= 1) return values;

  // Keep header + rows where at least one cell is non-empty
  const header = values[0];
  const filteredRows = values.slice(1).filter(row =>
    row.some(cell => (cell || '').toString().trim() !== '')
  );
  return [header, ...filteredRows];
}

function columnIndexToLetter(index: number): string {
  let letter = '';
  let i = index;
  while (i >= 0) {
    letter = String.fromCharCode(65 + (i % 26)) + letter;
    i = Math.floor(i / 26) - 1;
  }
  return letter;
}

export function findRowByArticleId(
  data: string[][],
  headers: string[],
  idColumn: string,
  articleId: number
): { rowNumber: number; rowData: Record<string, string> } | null {
  const colIndex = headers.indexOf(idColumn);
  if (colIndex === -1) {
    // Try column letter (A, B, C...)
    const letterIndex = idColumn.toUpperCase().charCodeAt(0) - 65;
    if (letterIndex >= 0 && letterIndex < 26) {
      for (let i = 1; i < data.length; i++) {
        if (data[i][letterIndex]?.toString() === articleId.toString()) {
          const rowData: Record<string, string> = {};
          headers.forEach((h, idx) => { rowData[h] = data[i][idx] || ''; });
          return { rowNumber: i + 1, rowData };
        }
      }
    }
    return null;
  }

  for (let i = 1; i < data.length; i++) {
    if (data[i][colIndex]?.toString() === articleId.toString()) {
      const rowData: Record<string, string> = {};
      headers.forEach((h, idx) => { rowData[h] = data[i][idx] || ''; });
      return { rowNumber: i + 1, rowData };
    }
  }
  return null;
}
