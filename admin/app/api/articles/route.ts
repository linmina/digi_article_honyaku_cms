import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireAuth } from '@/lib/session';
import { canAccessProject } from '@/lib/auth';

/**
 * Article create endpoint.
 *
 * Translator workflow: `source_url` is the JA article URL to translate.
 * Accepts `keywords` as a legacy alias (mapped to source_url) for clients
 * that still send the writer-era field name.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth();
    const body = await req.json();
    const { project_id, article_id, source_url, keywords, apply_fix, category_id, articles } = body;
    const url = source_url ?? keywords ?? '';

    if (!canAccessProject(user.userId!, user.role!, project_id)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const db = getDb();
    const stmt = db.prepare(
      'INSERT INTO articles (project_id, article_id, source_url, keywords, apply_fix, category_id) ' +
      'VALUES (?, ?, ?, ?, ?, ?)'
    );

    // Bulk insert
    if (articles && Array.isArray(articles)) {
      const ids: (number | bigint)[] = [];
      const insertMany = db.transaction((items: { article_id: number; source_url?: string; keywords?: string; apply_fix?: boolean; category_id?: number | null }[]) => {
        for (const item of items) {
          const itemUrl = item.source_url ?? item.keywords ?? '';
          const fix = item.apply_fix === false ? 0 : 1;
          const result = stmt.run(project_id, item.article_id, itemUrl, itemUrl, fix, item.category_id || null);
          ids.push(result.lastInsertRowid);
        }
      });
      insertMany(articles);
      return NextResponse.json({ ids, count: ids.length }, { status: 201 });
    }

    // Single insert
    const fix = apply_fix === false ? 0 : 1;
    const result = stmt.run(project_id, article_id, url, url, fix, category_id || null);
    return NextResponse.json({ id: result.lastInsertRowid }, { status: 201 });
  } catch (e: any) {
    if (e.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
