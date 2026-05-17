import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/session';
import { canAccessProject } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { readFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';

function getHtmlDir(projectId: number): string {
  const htmlDir = path.join(process.cwd(), 'data', String(projectId), 'html');
  mkdirSync(htmlDir, { recursive: true });
  return htmlDir;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; filename: string }> }) {
  try {
    const user = await requireAuth();
    const { id, filename } = await params;
    const projectId = parseInt(id);
    if (!canAccessProject(user.userId!, user.role!, projectId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const htmlDir = getHtmlDir(projectId);
    const filePath = path.join(htmlDir, decodeURIComponent(filename));

    // Prevent path traversal
    if (!filePath.startsWith(htmlDir)) {
      return NextResponse.json({ error: 'Invalid filename' }, { status: 400 });
    }

    if (!existsSync(filePath)) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    const content = readFileSync(filePath, 'utf-8');
    return NextResponse.json({ filename, content });
  } catch (e: any) {
    if (e.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
