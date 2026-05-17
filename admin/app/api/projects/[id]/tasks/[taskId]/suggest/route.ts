import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireAuth } from '@/lib/session';
import { canAccessProject } from '@/lib/auth';
import { readFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { execSync } from 'child_process';
import path from 'path';

function getHtmlDir(projectId: number): string {
  const htmlDir = path.join(process.cwd(), 'data', String(projectId), 'html');
  mkdirSync(htmlDir, { recursive: true });
  return htmlDir;
}

function findHtmlForArticle(htmlDir: string, articleId: number): string | null {
  if (!existsSync(htmlDir)) return null;
  const files = readdirSync(htmlDir).filter((f) => f.endsWith('.html'));
  // Try exact match first
  const exact = files.find((f) => f === `article_${articleId}.html`);
  if (exact) return path.join(htmlDir, exact);
  // Try partial match
  const partial = files.find((f) => f.includes(String(articleId)));
  if (partial) return path.join(htmlDir, partial);
  return null;
}

function stripHtmlTags(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; taskId: string }> }) {
  try {
    const user = await requireAuth();
    const { id, taskId } = await params;
    const projectId = parseInt(id);
    if (!canAccessProject(user.userId!, user.role!, projectId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const db = getDb();
    const task = db.prepare('SELECT * FROM article_tasks WHERE id = ? AND project_id = ?').get(parseInt(taskId), projectId) as any;
    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });

    // Find HTML content for the article
    const htmlDir = getHtmlDir(projectId);
    const htmlFile = findHtmlForArticle(htmlDir, task.article_id);
    let articleContent = '';
    if (htmlFile && existsSync(htmlFile)) {
      const rawHtml = readFileSync(htmlFile, 'utf-8');
      articleContent = stripHtmlTags(rawHtml);
      // Limit content to avoid token limits
      if (articleContent.length > 8000) {
        articleContent = articleContent.slice(0, 8000) + '\n...(以下省略)';
      }
    }

    // Get project info for context
    const project = db.prepare('SELECT name, claude_model FROM projects WHERE id = ?').get(projectId) as any;

    const prompt = `あなたは記事修正のアシスタントです。以下の修正タスクに基づいて、具体的な修正案を提案してください。

## 修正タスク
- タイトル: ${task.title}
- 説明: ${task.description}
- 対象記事ID: ${task.article_id}

${articleContent ? `## 現在の記事内容\n${articleContent}` : '## 注意\n記事のHTMLファイルが見つかりません。一般的な修正案を提案してください。'}

## 指示
1. 修正タスクの意図を理解してください
2. 記事の該当箇所を特定してください
3. 具体的な修正案（修正前→修正後）の形式で提案してください
4. 修正理由も簡潔に説明してください

修正案をマークダウン形式で出力してください。`;

    let suggestion = '';
    try {
      const model = project?.claude_model || 'claude-sonnet-4-6';
      const result = execSync(
        `claude -p --model ${model} "${prompt.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`,
        { encoding: 'utf-8', timeout: 120000, maxBuffer: 10 * 1024 * 1024 }
      );
      suggestion = result.trim();
    } catch (err: any) {
      // If claude CLI fails, provide a structured template
      suggestion = `## 修正案（自動生成失敗）\n\nCLIでの提案生成に失敗しました。手動で修正案を入力してください。\n\nエラー: ${err.message?.slice(0, 200) || '不明'}`;
    }

    // Save suggestion to task
    db.prepare('UPDATE article_tasks SET suggested_content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(suggestion, parseInt(taskId));

    return NextResponse.json({ suggestion });
  } catch (e: any) {
    if (e.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
