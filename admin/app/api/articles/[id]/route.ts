import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireAuth } from '@/lib/session';
import { canAccessProject } from '@/lib/auth';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth();
    const { id } = await params;
    const db = getDb();
    const article = db.prepare('SELECT * FROM articles WHERE id = ?').get(parseInt(id)) as any;
    if (!article) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    if (!canAccessProject(user.userId!, user.role!, article.project_id)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const jobs = db.prepare('SELECT * FROM jobs WHERE article_row_id = ? ORDER BY created_at DESC').all(article.id);
    return NextResponse.json({ article, jobs });
  } catch (e: any) {
    if (e.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth();
    const { id } = await params;
    const body = await req.json();
    const db = getDb();
    const article = db.prepare('SELECT * FROM articles WHERE id = ?').get(parseInt(id)) as any;
    if (!article) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    if (!canAccessProject(user.userId!, user.role!, article.project_id)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (body.category_id !== undefined) {
      db.prepare('UPDATE articles SET category_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(body.category_id || null, parseInt(id));
    }

    if (body.status !== undefined) {
      const validStatuses = ['pending', 'running', 'completed', 'failed'];
      if (!validStatuses.includes(body.status)) {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
      }
      const errorMessage = body.status === 'pending' ? '' : (article.error_message || '');
      db.prepare('UPDATE articles SET status = ?, error_message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(body.status, errorMessage, parseInt(id));
    }

    if (body.scheduled_at !== undefined) {
      db.prepare('UPDATE articles SET scheduled_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(body.scheduled_at || null, parseInt(id));
    }

    if (body.reset_status) {
      db.prepare('UPDATE articles SET status = ?, error_message = ?, scheduled_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run('pending', '', parseInt(id));
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth();
    const { id } = await params;
    const db = getDb();
    const article = db.prepare('SELECT * FROM articles WHERE id = ?').get(parseInt(id)) as any;
    if (!article) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    if (!canAccessProject(user.userId!, user.role!, article.project_id)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    db.prepare('DELETE FROM articles WHERE id = ?').run(parseInt(id));
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
