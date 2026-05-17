import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/session';
import { canAccessProject } from '@/lib/auth';
import { fetchPublishedArticles } from '@/lib/mysql';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth();
    const { id } = await params;
    const projectId = parseInt(id);
    if (!canAccessProject(user.userId!, user.role!, projectId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const url = new URL(req.url);
    const search = url.searchParams.get('search') || '';
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '50');

    const result = await fetchPublishedArticles(projectId, search || undefined, page, limit);
    return NextResponse.json(result);
  } catch (e: any) {
    if (e.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
