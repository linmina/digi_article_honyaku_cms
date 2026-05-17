import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireAdmin } from '@/lib/session';
import { hashPassword } from '@/lib/auth';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await params;
    const db = getDb();
    const user = db.prepare(
      'SELECT id, username, display_name, role, created_at FROM users WHERE id = ?'
    ).get(parseInt(id)) as any;
    if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const projects = db.prepare(`
      SELECT p.id, p.name, p.slug FROM projects p
      JOIN user_projects up ON p.id = up.project_id
      WHERE up.user_id = ?
    `).all(user.id);

    return NextResponse.json({ user, projects });
  } catch (e: any) {
    if (e.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e.message === 'Forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await params;
    const userId = parseInt(id);
    const body = await req.json();
    const db = getDb();

    if (body.password) {
      const hash = await hashPassword(body.password);
      db.prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(hash, userId);
    }

    if (body.display_name !== undefined || body.role !== undefined) {
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as any;
      db.prepare('UPDATE users SET display_name = ?, role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(body.display_name ?? user.display_name, body.role ?? user.role, userId);
    }

    return NextResponse.json({ ok: true });
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
    db.prepare('DELETE FROM users WHERE id = ?').run(parseInt(id));
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e.message === 'Forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
