import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/session';
import { canAccessProject } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, existsSync } from 'fs';
import path from 'path';

function getHtmlDir(projectId: number): string {
  const htmlDir = path.join(process.cwd(), 'data', String(projectId), 'html');
  mkdirSync(htmlDir, { recursive: true });
  return htmlDir;
}

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
    const htmlDir = getHtmlDir(projectId);

    if (!existsSync(htmlDir)) {
      return NextResponse.json({ files: [], total: 0 });
    }

    let files = readdirSync(htmlDir)
      .filter((f) => f.endsWith('.html'))
      .map((f) => {
        const filePath = path.join(htmlDir, f);
        const stat = statSync(filePath);
        const content = readFileSync(filePath, 'utf-8');
        // Extract title from HTML
        const titleMatch = content.match(/<title[^>]*>(.*?)<\/title>/i);
        const title = titleMatch ? titleMatch[1] : f;
        return {
          filename: f,
          title,
          size: stat.size,
          updatedAt: stat.mtime.toISOString(),
          matchSnippet: '',
        };
      });

    if (search) {
      files = files.filter((f) => {
        const content = readFileSync(path.join(htmlDir, f.filename), 'utf-8');
        const plainText = content.replace(/<[^>]+>/g, '');
        const idx = plainText.toLowerCase().indexOf(search.toLowerCase());
        if (idx >= 0) {
          const start = Math.max(0, idx - 50);
          const end = Math.min(plainText.length, idx + search.length + 50);
          f.matchSnippet = (start > 0 ? '...' : '') + plainText.slice(start, end) + (end < plainText.length ? '...' : '');
          return true;
        }
        return false;
      });
    }

    return NextResponse.json({ files, total: files.length });
  } catch (e: any) {
    if (e.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth();
    const { id } = await params;
    const projectId = parseInt(id);
    if (!canAccessProject(user.userId!, user.role!, projectId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const { url: targetUrl, articleId, filename } = body;

    if (!targetUrl) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    let response: Response;
    try {
      response = await fetch(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'ja,en;q=0.9',
        },
        redirect: 'follow',
      });
    } catch (fetchErr: any) {
      return NextResponse.json({ error: `接続エラー: ${fetchErr.message}` }, { status: 400 });
    }

    if (!response.ok) {
      return NextResponse.json({ error: `HTTP ${response.status} ${response.statusText} (${targetUrl})` }, { status: 400 });
    }

    const html = await response.text();
    if (!html || html.length < 100) {
      return NextResponse.json({ error: `取得したHTMLが空または極端に短い (${html.length} bytes)` }, { status: 400 });
    }

    const htmlDir = getHtmlDir(projectId);
    const fname = filename || `article_${articleId || Date.now()}.html`;
    const filePath = path.join(htmlDir, fname);
    writeFileSync(filePath, html, 'utf-8');

    return NextResponse.json({ ok: true, filename: fname, size: html.length, dir: htmlDir });
  } catch (e: any) {
    if (e.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
