import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireAuth, requireAdmin } from '@/lib/session';
import { canAccessProject } from '@/lib/auth';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth();
    const { id } = await params;
    const projectId = parseInt(id);
    if (!canAccessProject(user.userId!, user.role!, projectId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const db = getDb();
    const categories = db.prepare('SELECT * FROM categories WHERE project_id = ? ORDER BY name').all(projectId);
    return NextResponse.json({ categories });
  } catch (e: any) {
    if (e.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await params;
    const projectId = parseInt(id);
    const body = await req.json();
    const db = getDb();

    const result = db.prepare(
      'INSERT INTO categories (project_id, name, prompt_structure, prompt_article, prompt_factcheck, doc_check, doc_content) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(
      projectId,
      body.name || '',
      body.prompt_structure || '',
      body.prompt_article || '',
      body.prompt_factcheck || '',
      body.doc_check || '',
      body.doc_content || ''
    );

    const catId = result.lastInsertRowid;
    const base = `categories/${catId}`;
    db.prepare(`
      UPDATE categories SET
        prompt_structure_path = ?,
        prompt_article_path = ?,
        prompt_factcheck_path = ?,
        doc_check_path = ?,
        doc_content_path = ?
      WHERE id = ?
    `).run(
      `${base}/prompt_structure.md`,
      `${base}/prompt_article.md`,
      `${base}/prompt_factcheck.md`,
      `${base}/check.md`,
      `${base}/content.md`,
      catId
    );

    return NextResponse.json({ id: catId }, { status: 201 });
  } catch (e: any) {
    if (e.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e.message === 'Forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
