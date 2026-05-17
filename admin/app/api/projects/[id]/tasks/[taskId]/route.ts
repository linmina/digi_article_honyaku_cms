import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireAuth } from '@/lib/session';
import { canAccessProject } from '@/lib/auth';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; taskId: string }> }) {
  try {
    const user = await requireAuth();
    const { id, taskId } = await params;
    const projectId = parseInt(id);
    if (!canAccessProject(user.userId!, user.role!, projectId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const db = getDb();
    const task = db.prepare('SELECT * FROM article_tasks WHERE id = ? AND project_id = ?').get(parseInt(taskId), projectId);
    if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ task });
  } catch (e: any) {
    if (e.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; taskId: string }> }) {
  try {
    const user = await requireAuth();
    const { id, taskId } = await params;
    const projectId = parseInt(id);
    if (!canAccessProject(user.userId!, user.role!, projectId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const db = getDb();

    const fields: string[] = [];
    const values: any[] = [];

    for (const key of ['title', 'description', 'status', 'priority', 'suggested_content']) {
      if (body[key] !== undefined) {
        fields.push(`${key} = ?`);
        values.push(body[key]);
      }
    }

    if (body.article_ids !== undefined) {
      const idsStr = Array.isArray(body.article_ids) ? body.article_ids.join(',') : String(body.article_ids);
      fields.push('article_ids = ?');
      values.push(idsStr);
      // Keep article_id in sync
      const firstId = parseInt(idsStr.split(',')[0]) || 0;
      fields.push('article_id = ?');
      values.push(firstId);
    }

    if (fields.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(parseInt(taskId), projectId);

    db.prepare(`UPDATE article_tasks SET ${fields.join(', ')} WHERE id = ? AND project_id = ?`).run(...values);
    const task = db.prepare('SELECT * FROM article_tasks WHERE id = ?').get(parseInt(taskId));
    return NextResponse.json({ task });
  } catch (e: any) {
    if (e.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; taskId: string }> }) {
  try {
    const user = await requireAuth();
    const { id, taskId } = await params;
    const projectId = parseInt(id);
    if (!canAccessProject(user.userId!, user.role!, projectId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const db = getDb();
    db.prepare('DELETE FROM article_tasks WHERE id = ? AND project_id = ?').run(parseInt(taskId), projectId);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
