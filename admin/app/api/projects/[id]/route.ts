import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireAuth, requireAdmin } from '@/lib/session';
import { canAccessProject } from '@/lib/auth';
import { writeFileSync, mkdirSync } from 'fs';
import path from 'path';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth();
    const { id } = await params;
    const projectId = parseInt(id);
    if (!canAccessProject(user.userId!, user.role!, projectId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const db = getDb();
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
    if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const articles = db.prepare('SELECT * FROM articles WHERE project_id = ? ORDER BY created_at DESC').all(projectId);
    return NextResponse.json({ project, articles });
  } catch (e: any) {
    if (e.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

function buildSqlFromTableName(tableName: string) {
  const tagTable = `${tableName}Tag`;
  return {
    upsert: `INSERT INTO ${tagTable} (itemId, tagId, class, value, update_at) VALUES (%s, %s, 'item', %s, NOW()) ON DUPLICATE KEY UPDATE value = VALUES(value), update_at = NOW()`,
    verify: `SELECT itemId, tagId, LEFT(value, 100) AS value_preview, update_at FROM ${tagTable} WHERE itemId = %s ORDER BY tagId`,
    check_article: `SELECT id, name, depth FROM ${tableName} WHERE id = %s`,
  };
}

function buildDbConfigJson(body: any): string {
  const tableName = body.db_table_name || 'gtnArticles';
  return JSON.stringify({
    connection: {
      host: body.db_host || '',
      port: parseInt(body.db_port) || 3306,
      database: body.db_name || '',
      user: body.db_user || '',
      password: body.db_password || '',
      charset: 'utf8mb4',
    },
    tag_ids: {
      title: parseInt(body.db_tag_title) || 26,
      description: parseInt(body.db_tag_description) || 27,
      content: parseInt(body.db_tag_content) || 29,
      memo: parseInt(body.db_tag_memo) || 51,
      publish_flag: parseInt(body.db_tag_publish_flag) || 23,
      type: parseInt(body.db_tag_type) || 5,
    },
    tag_values: {
      publish_open: body.db_val_publish_open || '24',
      publish_close: body.db_val_publish_close || '25',
      type_page: body.db_val_type_page || '6',
      type_section: body.db_val_type_section || '7',
    },
    sql: buildSqlFromTableName(tableName),
  }, null, 2);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await params;
    const projectId = parseInt(id);
    const body = await req.json();
    const db = getDb();

    db.prepare(`
      UPDATE projects SET
        name = ?, description = ?, cms_base_url = ?,
        preview_url_pattern = ?, public_url_pattern = ?,
        db_host = ?, db_port = ?, db_name = ?, db_user = ?, db_password = ?,
        db_config_path = ?,
        db_tag_title = ?, db_tag_description = ?, db_tag_content = ?,
        db_tag_memo = ?, db_tag_publish_flag = ?, db_tag_type = ?,
        db_val_publish_open = ?, db_val_publish_close = ?,
        db_val_type_page = ?, db_val_type_section = ?,
        db_sql_upsert = ?, db_sql_verify = ?, db_sql_check_article = ?,
        db_table_name = ?,
        article_folder_id = ?, factcheck_folder_id = ?, credentials_path = ?,
        claude_model = ?, project_path = ?,
        prompt_structure = ?, prompt_article = ?, prompt_factcheck = ?,
        doc_check = COALESCE(?, doc_check), doc_content = COALESCE(?, doc_content),
        spreadsheet_url = ?, spreadsheet_sheet_name = ?,
        spreadsheet_id_column = ?, spreadsheet_display_columns = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      body.name, body.description || '', body.cms_base_url || '',
      body.preview_url_pattern || '', body.public_url_pattern || '',
      body.db_host || '', body.db_port || 3306, body.db_name || '',
      body.db_user || '', body.db_password || '',
      body.db_config_path || '',
      parseInt(body.db_tag_title) || 26, parseInt(body.db_tag_description) || 27,
      parseInt(body.db_tag_content) || 29, parseInt(body.db_tag_memo) || 51,
      parseInt(body.db_tag_publish_flag) || 23, parseInt(body.db_tag_type) || 5,
      body.db_val_publish_open || '24', body.db_val_publish_close || '25',
      body.db_val_type_page || '6', body.db_val_type_section || '7',
      body.db_sql_upsert || '', body.db_sql_verify || '', body.db_sql_check_article || '',
      body.db_table_name || 'gtnArticles',
      body.article_folder_id || '', body.factcheck_folder_id || '',
      body.credentials_path || '',
      body.claude_model || 'claude-opus-4-6', body.project_path || '',
      body.prompt_structure || '', body.prompt_article || '', body.prompt_factcheck || '',
      body.doc_check !== undefined ? body.doc_check : null,
      body.doc_content !== undefined ? body.doc_content : null,
      body.spreadsheet_url || '', body.spreadsheet_sheet_name || '',
      body.spreadsheet_id_column || 'A', body.spreadsheet_display_columns || '',
      projectId
    );

    // Write DB config JSON to file if path is specified
    let warning = '';
    if (body.db_config_path && body.db_host) {
      try {
        const dir = path.dirname(body.db_config_path);
        mkdirSync(dir, { recursive: true });
        writeFileSync(body.db_config_path, buildDbConfigJson(body), 'utf-8');
      } catch (err: any) {
        warning = `DB設定JSON書き出しエラー: ${err.message}`;
      }
    }

    return NextResponse.json(warning ? { ok: true, warning } : { ok: true });
  } catch (e: any) {
    if (e.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e.message === 'Forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await params;
    const db = getDb();
    db.prepare('DELETE FROM projects WHERE id = ?').run(parseInt(id));
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e.message === 'Forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
