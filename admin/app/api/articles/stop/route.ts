import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireAuth } from '@/lib/session';
import { canAccessProject } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth();
    const { article_row_id } = await req.json();

    const db = getDb();
    const article = db.prepare('SELECT * FROM articles WHERE id = ?').get(article_row_id) as any;
    if (!article) return NextResponse.json({ error: 'Article not found' }, { status: 404 });

    if (!canAccessProject(user.userId!, user.role!, article.project_id)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (article.status !== 'running') {
      return NextResponse.json({ error: 'Not running' }, { status: 400 });
    }

    // Find the running job and its PID
    const job = db.prepare(
      'SELECT * FROM jobs WHERE article_row_id = ? AND status = ? ORDER BY created_at DESC LIMIT 1'
    ).get(article_row_id, 'running') as any;

    if (!job || !job.pid) {
      // No PID, just update status
      db.prepare('UPDATE articles SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run('failed', article_row_id);
      if (job) {
        db.prepare('UPDATE jobs SET status = ?, log = log || ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?')
          .run('failed', '\n[手動停止] PIDなし\n', job.id);
      }
      return NextResponse.json({ ok: true, message: 'ステータスを更新しました' });
    }

    // Kill the process tree
    let killed = false;
    try {
      // Kill process group (negative PID kills the group)
      process.kill(-job.pid, 'SIGTERM');
      killed = true;
    } catch {
      try {
        // Fallback: kill single process
        process.kill(job.pid, 'SIGTERM');
        killed = true;
      } catch {
        // Process already dead
      }
    }

    // Update DB
    db.prepare('UPDATE articles SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run('failed', article_row_id);
    db.prepare('UPDATE jobs SET status = ?, log = log || ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run('failed', `\n[手動停止] PID=${job.pid}, killed=${killed}\n`, job.id);

    return NextResponse.json({ ok: true, pid: job.pid, killed });
  } catch (e: any) {
    if (e.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
