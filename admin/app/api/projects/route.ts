import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireAuth, requireAdmin } from '@/lib/session';
import { getAccessibleProjects } from '@/lib/auth';

export async function GET() {
  try {
    const user = await requireAuth();
    const projects = getAccessibleProjects(user.userId!, user.role!);
    return NextResponse.json({ projects });
  } catch (e: any) {
    if (e.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
    const body = await req.json();
    const db = getDb();

    const slug = body.slug || body.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const reviewFolder = body.review_folder_id || body.factcheck_folder_id || '';
    const result = db.prepare(`
      INSERT INTO projects (name, slug, description, cms_base_url, db_host, db_port, db_name, db_user, db_password,
        article_folder_id, factcheck_folder_id, review_folder_id, credentials_path, claude_model, project_path,
        prompt_structure, prompt_article, prompt_factcheck,
        prompt_translation, prompt_review,
        spreadsheet_url, spreadsheet_sheet_name, spreadsheet_id_column, spreadsheet_display_columns)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      body.name, slug, body.description || '',
      body.cms_base_url || '', body.db_host || '', body.db_port || 3306,
      body.db_name || '', body.db_user || '', body.db_password || '',
      body.article_folder_id || '',
      // factcheck_folder_id mirrors review_folder_id for backward compat
      reviewFolder, reviewFolder,
      body.credentials_path || '',
      body.claude_model || 'claude-opus-4-6', body.project_path || '',
      body.prompt_structure || '', body.prompt_article || '', body.prompt_factcheck || '',
      body.prompt_translation || '', body.prompt_review || '',
      body.spreadsheet_url || '', body.spreadsheet_sheet_name || '',
      body.spreadsheet_id_column || 'A', body.spreadsheet_display_columns || ''
    );

    return NextResponse.json({ id: result.lastInsertRowid }, { status: 201 });
  } catch (e: any) {
    if (e.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e.message === 'Forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
