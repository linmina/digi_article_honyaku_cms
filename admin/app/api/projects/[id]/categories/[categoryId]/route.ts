import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireAdmin } from '@/lib/session';
import { writeFileSync, mkdirSync } from 'fs';
import path from 'path';

function writeToPath(filePath: string, content: string) {
  if (!filePath || !content) return;
  const dir = path.dirname(filePath);
  mkdirSync(dir, { recursive: true });
  writeFileSync(filePath, content, 'utf-8');
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; categoryId: string }> }) {
  try {
    await requireAdmin();
    const { categoryId } = await params;
    const db = getDb();
    const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(parseInt(categoryId));
    if (!category) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ category });
  } catch (e: any) {
    if (e.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e.message === 'Forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string; categoryId: string }> }) {
  try {
    await requireAdmin();
    const { id, categoryId } = await params;
    const body = await req.json();
    const db = getDb();

    db.prepare(`
      UPDATE categories SET
        name = ?, prompt_structure = ?, prompt_article = ?, prompt_factcheck = ?,
        doc_check = ?, doc_check_url = ?, doc_content = ?, doc_content_url = ?,
        prompt_structure_path = ?, prompt_article_path = ?, prompt_factcheck_path = ?,
        doc_check_path = ?, doc_content_path = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      body.name || '',
      body.prompt_structure || '',
      body.prompt_article || '',
      body.prompt_factcheck || '',
      body.doc_check || '',
      body.doc_check_url || '',
      body.doc_content || '',
      body.doc_content_url || '',
      body.prompt_structure_path || '',
      body.prompt_article_path || '',
      body.prompt_factcheck_path || '',
      body.doc_check_path || '',
      body.doc_content_path || '',
      parseInt(categoryId)
    );

    // Resolve relative paths against project_path
    const project = db.prepare('SELECT project_path FROM projects WHERE id = ?').get(parseInt(id)) as any;
    const projectRoot = project?.project_path || process.cwd().replace('/admin', '');

    const fileWrites: { filePath: string; content: string; label: string }[] = [
      { filePath: body.prompt_structure_path || '', content: body.prompt_structure || '', label: 'prompt_structure' },
      { filePath: body.prompt_article_path || '', content: body.prompt_article || '', label: 'prompt_article' },
      { filePath: body.prompt_factcheck_path || '', content: body.prompt_factcheck || '', label: 'prompt_factcheck' },
      { filePath: body.doc_check_path || '', content: body.doc_check || '', label: 'doc_check' },
      { filePath: body.doc_content_path || '', content: body.doc_content || '', label: 'doc_content' },
    ];

    const writeErrors: string[] = [];
    const writtenFiles: string[] = [];
    for (const fw of fileWrites) {
      if (!fw.filePath) continue;
      if (!fw.content) continue;
      try {
        const absPath = path.isAbsolute(fw.filePath)
          ? fw.filePath
          : path.join(projectRoot, fw.filePath);
        writeToPath(absPath, fw.content);
        writtenFiles.push(absPath);
      } catch (err: any) {
        writeErrors.push(`${fw.label} (${fw.filePath}): ${err.message}`);
      }
    }

    return NextResponse.json({ ok: true, writtenFiles, writeErrors });
  } catch (e: any) {
    if (e.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e.message === 'Forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; categoryId: string }> }) {
  try {
    await requireAdmin();
    const { categoryId } = await params;
    const db = getDb();
    // カテゴリ削除時、記事のcategory_idをNULLに
    db.prepare('UPDATE articles SET category_id = NULL WHERE category_id = ?').run(parseInt(categoryId));
    db.prepare('DELETE FROM categories WHERE id = ?').run(parseInt(categoryId));
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e.message === 'Forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
