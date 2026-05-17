import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireAuth } from '@/lib/session';
import { canAccessProject } from '@/lib/auth';
import { readSheetData } from '@/lib/sheets';
import fs from 'fs';
import path from 'path';

const CSV_DIR = path.join(process.cwd(), 'data', 'csv');

function ensureCsvDir() {
  if (!fs.existsSync(CSV_DIR)) fs.mkdirSync(CSV_DIR, { recursive: true });
}

function csvPath(projectId: number) {
  return path.join(CSV_DIR, `${projectId}.csv`);
}

function parseCsv(content: string): string[][] {
  const rows: string[][] = [];
  const lines = content.split('\n');
  for (const line of lines) {
    if (line.trim() === '') continue;
    // Simple CSV parse handling quoted fields
    const fields: string[] = [];
    let current = '';
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuote) {
        if (ch === '"' && line[i + 1] === '"') {
          current += '"';
          i++;
        } else if (ch === '"') {
          inQuote = false;
        } else {
          current += ch;
        }
      } else {
        if (ch === '"') {
          inQuote = true;
        } else if (ch === ',') {
          fields.push(current);
          current = '';
        } else {
          current += ch;
        }
      }
    }
    fields.push(current);
    rows.push(fields);
  }
  return rows;
}

function toCsvString(data: string[][]): string {
  return data.map(row =>
    row.map(cell => {
      const s = (cell || '').toString();
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    }).join(',')
  ).join('\n');
}

// GET: Read local CSV data
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth();
    const { id } = await params;
    const projectId = parseInt(id);

    if (!canAccessProject(user.userId!, user.role!, projectId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const db = getDb();
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as any;
    if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const filePath = csvPath(projectId);
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({
        headers: [],
        rows: [],
        idColumn: project.spreadsheet_id_column || 'A',
        displayColumns: [],
        csvExists: false,
      });
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const data = parseCsv(content);
    if (data.length === 0) {
      return NextResponse.json({ headers: [], rows: [], idColumn: project.spreadsheet_id_column, displayColumns: [], csvExists: true });
    }

    const headers = data[0];
    const rows = data.slice(1);

    const displayColumnsStr = (project.spreadsheet_display_columns || '').trim();
    let displayColumns: string[] = [];
    if (displayColumnsStr) {
      displayColumns = displayColumnsStr.split(',').map((c: string) => c.trim()).filter(Boolean);
    }

    const stat = fs.statSync(filePath);

    return NextResponse.json({
      headers,
      rows,
      idColumn: project.spreadsheet_id_column || 'A',
      displayColumns,
      csvExists: true,
      lastUpdated: stat.mtime.toISOString(),
    });
  } catch (e: any) {
    if (e.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST: Download spreadsheet and save as CSV
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth();
    const { id } = await params;
    const projectId = parseInt(id);

    if (!canAccessProject(user.userId!, user.role!, projectId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const db = getDb();
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as any;
    if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    if (!project.spreadsheet_url) {
      return NextResponse.json({ error: 'スプレッドシートURLが設定されていません' }, { status: 400 });
    }
    if (!project.credentials_path) {
      return NextResponse.json({ error: '認証ファイルが設定されていません' }, { status: 400 });
    }

    const data = await readSheetData(
      project.credentials_path,
      project.spreadsheet_url,
      project.spreadsheet_sheet_name || '',
    );

    ensureCsvDir();
    const csvContent = toCsvString(data);
    fs.writeFileSync(csvPath(projectId), csvContent, 'utf-8');

    const headers = data.length > 0 ? data[0] : [];

    return NextResponse.json({
      ok: true,
      headers,
      rowCount: Math.max(0, data.length - 1),
      message: 'CSVダウンロード完了',
    });
  } catch (e: any) {
    if (e.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
