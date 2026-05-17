import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireAdmin } from '@/lib/session';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await params;
    const userId = parseInt(id);
    const { project_ids } = await req.json();

    const db = getDb();
    const deleteStmt = db.prepare('DELETE FROM user_projects WHERE user_id = ?');
    const insertStmt = db.prepare('INSERT INTO user_projects (user_id, project_id) VALUES (?, ?)');

    db.transaction(() => {
      deleteStmt.run(userId);
      for (const pid of project_ids) {
        insertStmt.run(userId, pid);
      }
    })();

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e.message === 'Forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
