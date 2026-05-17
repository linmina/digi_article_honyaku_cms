import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireAuth } from '@/lib/session';
import { canAccessProject } from '@/lib/auth';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth();
    const { id } = await params;
    const projectId = parseInt(id);
    if (!canAccessProject(user.userId!, user.role!, projectId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const url = new URL(req.url);
    const status = url.searchParams.get('status') || '';
    const articleId = url.searchParams.get('article_id') || '';

    const db = getDb();
    let sql = 'SELECT * FROM article_tasks WHERE project_id = ?';
    const params_arr: any[] = [projectId];

    if (status) {
      sql += ' AND status = ?';
      params_arr.push(status);
    }
    if (articleId) {
      // Search in both article_id (legacy) and article_ids (comma-separated)
      sql += " AND (article_id = ? OR (',' || article_ids || ',') LIKE ?)";
      params_arr.push(parseInt(articleId), `%,${articleId},%`);
    }

    sql += ' ORDER BY created_at DESC';
    const tasks = db.prepare(sql).all(...params_arr);
    return NextResponse.json({ tasks });
  } catch (e: any) {
    if (e.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth();
    const { id } = await params;
    const projectId = parseInt(id);
    if (!canAccessProject(user.userId!, user.role!, projectId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const { article_ids, article_id, title, description, priority } = body;

    // Support both article_ids (array/comma-separated) and legacy article_id
    let idsStr = '';
    if (article_ids) {
      idsStr = Array.isArray(article_ids) ? article_ids.join(',') : String(article_ids);
    } else if (article_id) {
      idsStr = String(article_id);
    }

    if (!title) {
      return NextResponse.json({ error: 'title is required' }, { status: 400 });
    }

    // Keep article_id for backward compat (first ID)
    const firstId = parseInt(idsStr.split(',')[0]) || 0;

    const db = getDb();
    const result = db.prepare(`
      INSERT INTO article_tasks (project_id, article_id, article_ids, title, description, priority)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(projectId, firstId, idsStr, title, description || '', priority || 'medium');

    const task = db.prepare('SELECT * FROM article_tasks WHERE id = ?').get(result.lastInsertRowid);
    return NextResponse.json({ task }, { status: 201 });
  } catch (e: any) {
    if (e.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
