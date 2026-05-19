import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireAuth } from '@/lib/session';
import { canAccessProject } from '@/lib/auth';
import { spawn } from 'child_process';
import { writeFileSync, appendFileSync, mkdirSync } from 'fs';
import path from 'path';

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth();
    const { article_row_id, with_log } = await req.json();

    const db = getDb();
    const article = db.prepare('SELECT * FROM articles WHERE id = ?').get(article_row_id) as any;
    if (!article) return NextResponse.json({ error: 'Article not found' }, { status: 404 });

    if (!canAccessProject(user.userId!, user.role!, article.project_id)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (article.status === 'running') {
      return NextResponse.json({ error: 'Already running' }, { status: 400 });
    }

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(article.project_id) as any;
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    // Create job record
    const job = db.prepare(
      'INSERT INTO jobs (article_row_id, status, phase, started_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)'
    ).run(article_row_id, 'running', 'starting');

    const jobId = job.lastInsertRowid;

    // Update article status and clear schedule
    db.prepare('UPDATE articles SET status = ?, scheduled_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run('running', article_row_id);

    // Build and execute the claude command
    const projectPath = project.project_path || process.cwd().replace('/admin', '');
    const keywords = article.keywords.replace(/\s+/g, ' ').trim();

    // Write DB config JSON for update_article.py
    const outputDir = path.join(projectPath, 'output');
    mkdirSync(outputDir, { recursive: true });

    const tableName = project.db_table_name || 'gtnArticles';
    const tagTable = `${tableName}Tag`;
    const generatedSql = {
      upsert: `INSERT INTO ${tagTable} (itemId, tagId, class, value, update_at) VALUES (%s, %s, 'item', %s, NOW()) ON DUPLICATE KEY UPDATE value = VALUES(value), update_at = NOW()`,
      verify: `SELECT itemId, tagId, LEFT(value, 100) AS value_preview, update_at FROM ${tagTable} WHERE itemId = %s ORDER BY tagId`,
      check_article: `SELECT id, name, depth FROM ${tableName} WHERE id = %s`,
    };
    if (project.db_host) {
      const dbConfigJson = JSON.stringify({
        connection: {
          host: project.db_host, port: project.db_port || 3306,
          database: project.db_name, user: project.db_user,
          password: project.db_password, charset: 'utf8mb4',
        },
        tag_ids: {
          title: project.db_tag_title || 26, description: project.db_tag_description || 27,
          content: project.db_tag_content || 29, memo: project.db_tag_memo || 51,
          publish_flag: project.db_tag_publish_flag || 23, type: project.db_tag_type || 5,
        },
        tag_values: {
          publish_open: project.db_val_publish_open || '24', publish_close: project.db_val_publish_close || '25',
          type_page: project.db_val_type_page || '6', type_section: project.db_val_type_section || '7',
        },
        sql: generatedSql,
      }, null, 2);
      const defaultDbConfigPath = article.category_id
        ? path.join(projectPath, `categories/${article.category_id}/db.json`)
        : path.join(outputDir, '_db_config.json');
      const dbConfigOutputPath = project.db_config_path || defaultDbConfigPath;
      const dbDir = path.dirname(dbConfigOutputPath);
      mkdirSync(dbDir, { recursive: true });
      writeFileSync(dbConfigOutputPath, dbConfigJson, 'utf-8');
    }

    // Write category config if article has a category
    const categoryConfigPath = path.join(outputDir, '_category_config.json');

    if (article.category_id) {
      const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(article.category_id) as any;
      if (category) {
        const categoryConfig = {
          prompt_structure: category.prompt_structure || '',
          prompt_article: category.prompt_article || '',
          prompt_factcheck: category.prompt_factcheck || '',
          doc_check: category.doc_check || project.doc_check || '',
          doc_content: category.doc_content || project.doc_content || '',
          prompt_structure_path: category.prompt_structure_path || '',
          prompt_article_path: category.prompt_article_path || '',
          prompt_factcheck_path: category.prompt_factcheck_path || '',
          doc_check_path: category.doc_check_path || '',
          doc_content_path: category.doc_content_path || '',
        };
        writeFileSync(categoryConfigPath, JSON.stringify(categoryConfig, null, 2), 'utf-8');
      } else {
        writeFileSync(categoryConfigPath, JSON.stringify({
          prompt_structure: '',
          prompt_article: '',
          prompt_factcheck: '',
          doc_check: project.doc_check || '',
          doc_content: project.doc_content || '',
          prompt_structure_path: '',
          prompt_article_path: '',
          prompt_factcheck_path: '',
          doc_check_path: '',
          doc_content_path: '',
        }, null, 2), 'utf-8');
      }
    } else {
      writeFileSync(categoryConfigPath, JSON.stringify({
        prompt_structure: '',
        prompt_article: '',
        prompt_factcheck: '',
        doc_check: project.doc_check || '',
        doc_content: project.doc_content || '',
        prompt_structure_path: '',
        prompt_article_path: '',
        prompt_factcheck_path: '',
        doc_check_path: '',
        doc_content_path: '',
      }, null, 2), 'utf-8');
    }

    // Translator: pre-fetch + extract the source article into the workspace.
    // The slash command runs with `Read,Write,Edit,Glob,Grep,WebFetch,WebSearch`
    // tools — no Bash — so HTTP fetch happens here BEFORE spawning claude.
    const sourceUrl: string = (article as any).source_url || article.keywords || '';
    if (!sourceUrl) {
      return NextResponse.json(
        { error: 'article.source_url is empty — set the JA URL first' },
        { status: 400 },
      );
    }
    const applyFix: boolean = (article as any).apply_fix !== 0;
    const workspaceDir = path.join(outputDir, `job_${jobId}`);
    mkdirSync(workspaceDir, { recursive: true });
    try {
      const { execFileSync } = await import('child_process');
      execFileSync(
        'python3',
        [
          path.join(projectPath, 'scripts', 'fetch_article.py'),
          sourceUrl,
          '-o',
          path.join(workspaceDir, 'source.html'),
        ],
        { stdio: 'inherit' },
      );
      execFileSync(
        'python3',
        [
          path.join(projectPath, 'scripts', 'extract_content.py'),
          path.join(workspaceDir, 'source.html'),
          '--base-url',
          sourceUrl,
          '-o',
          path.join(workspaceDir, 'source.md'),
        ],
        { stdio: 'inherit' },
      );
    } catch (e: any) {
      db.prepare("UPDATE jobs SET status = 'failed', log = ? WHERE id = ?")
        .run(`fetch/extract failed: ${e.message}`, jobId);
      db.prepare("UPDATE articles SET status = 'failed', error_message = ? WHERE id = ?")
        .run(e.message, article_row_id);
      return NextResponse.json(
        { error: `fetch/extract failed: ${e.message}` },
        { status: 502 },
      );
    }

    // Build category override config JSON (read by the slash command)
    let categoryOverrideConfig: Record<string, string> = {};
    if (article.category_id) {
      const cat = db.prepare('SELECT * FROM categories WHERE id = ?').get(article.category_id) as any;
      if (cat) {
        if (cat.prompt_translation_path) categoryOverrideConfig.prompt_translation = cat.prompt_translation_path;
        if (cat.prompt_review_path) categoryOverrideConfig.prompt_review = cat.prompt_review_path;
      }
    }
    writeFileSync(
      path.join(workspaceDir, '_category_config.json'),
      JSON.stringify(categoryOverrideConfig, null, 2),
      'utf-8',
    );

    // Article meta context (informational; claude reads if helpful)
    writeFileSync(
      path.join(workspaceDir, '_context.md'),
      [
        '# 記事メタ',
        '',
        `- article_id: ${article.article_id}`,
        `- source_url: ${sourceUrl}`,
        `- category_id: ${article.category_id || '(none)'}`,
        `- apply_fix: ${applyFix}`,
      ].join('\n'),
      'utf-8',
    );

    const command = `claude`;
    const promptParts = [`/translate ${article.article_id} --log`];
    if (!applyFix) promptParts.push('--no-fix');
    const args = [
      '-p',
      '--dangerously-skip-permissions',
      promptParts.join(' '),
    ];

    // Build command info for logging
    const fullCommand = [command, ...args].join(' ');
    const startTime = new Date().toISOString();
    const commandLog = [
      `=== 実行コマンド (translator) ===`,
      `日時: ${startTime}`,
      `記事ID: ${article.article_id}`,
      `翻訳元 URL: ${sourceUrl}`,
      `apply_fix: ${applyFix}`,
      `カテゴリID: ${article.category_id || 'なし'}`,
      `プロジェクトパス: ${projectPath}`,
      `workspace: ${workspaceDir}`,
      `コマンド: ${fullCommand}`,
      `${'='.repeat(60)}`,
      '',
    ].join('\n');

    // Save command to job log immediately
    db.prepare('UPDATE jobs SET log = ? WHERE id = ?').run(commandLog, jobId);

    // claude runs IN the workspace dir so its Read/Write are scoped to job_N
    const child = spawn(command, args, {
      cwd: workspaceDir,
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    });

    // Save PID
    db.prepare('UPDATE jobs SET pid = ? WHERE id = ?').run(child.pid || 0, jobId);

    // Setup log file
    const logsDir = path.join(projectPath, 'output', 'logs');
    mkdirSync(logsDir, { recursive: true });
    const logFilePath = path.join(logsDir, `job_${jobId}_article_${article.article_id}.log`);
    writeFileSync(logFilePath, commandLog, 'utf-8');
    db.prepare('UPDATE jobs SET log_file = ? WHERE id = ?').run(logFilePath, jobId);

    let output = commandLog;
    let currentPhase = 'starting';

    // Phase detection patterns (translator pipeline)
    // Translator-specific markers carry "翻訳" so they win priority over the
    // legacy writer patterns left below as fallback.
    const phasePatterns: [RegExp, string][] = [
      // translator
      [/Phase\s*1.*翻訳|pachinko-translate|\/translate\b/i, 'Phase 1: 翻訳'],
      [/Phase\s*2.*翻訳.*校閲|Phase\s*2.*翻訳記事|translation.*review/i, 'Phase 2: 校閲'],
      [/Phase\s*3.*翻訳.*修正|Phase\s*3.*翻訳記事|translation.*fix/i, 'Phase 3: 修正'],
      [/翻訳.*Google\s*Doc|記事.*Google\s*Doc/i, 'Phase 4: 翻訳記事 Drive アップロード'],
      [/校閲.*Google\s*Doc/i, 'Phase 5: 校閲レポート Drive アップロード'],
      [/CMS\s*DB.*UPSERT|update_article\.py|入稿/i, 'Phase 6: CMS 入稿'],
      // legacy writer (for backward compat)
      [/Phase\s*1|キーワード分析|seo-analyze/i, 'Phase 1: キーワード分析'],
      [/Phase\s*2|競合調査|seo-research/i, 'Phase 2: 競合調査'],
      [/Phase\s*3|記事執筆|seo-write/i, 'Phase 3: 記事執筆'],
    ];

    function detectPhase(text: string): string {
      for (const [pattern, phase] of phasePatterns) {
        if (pattern.test(text)) return phase;
      }
      return currentPhase;
    }

    child.stdout.on('data', (data: Buffer) => {
      const chunk = data.toString();
      output += chunk;
      // Detect phase from new output
      const detectedPhase = detectPhase(chunk);
      if (detectedPhase !== currentPhase) {
        currentPhase = detectedPhase;
        const phaseBanner = `\n${'='.repeat(60)}\n${currentPhase}\n${'='.repeat(60)}\n`;
        output += phaseBanner;
          appendFileSync(logFilePath, phaseBanner, 'utf-8');
      }
      // Write to log file (full output, no truncation)
      appendFileSync(logFilePath, chunk, 'utf-8');
      // DB log: truncated to keep DB size manageable
      const dbLog = output.slice(-10000);
      db.prepare('UPDATE jobs SET log = ?, phase = ? WHERE id = ?')
        .run(dbLog, currentPhase, jobId);
    });

    child.stderr.on('data', (data: Buffer) => {
      const stderrLine = '[STDERR] ' + data.toString();
      output += stderrLine;
      appendFileSync(logFilePath, stderrLine, 'utf-8');
    });

    child.on('close', async (code: number | null) => {
      const finalStatus = code === 0 ? 'completed' : 'failed';
      const footer = `\n${'='.repeat(60)}\n完了: ${new Date().toISOString()}\nステータス: ${finalStatus}\n終了コード: ${code}\n${'='.repeat(60)}\n`;
      appendFileSync(logFilePath, footer, 'utf-8');
      const dbLog = output.slice(-50000);
      db.prepare('UPDATE jobs SET status = ?, log = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(finalStatus, dbLog, jobId);
      db.prepare('UPDATE articles SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(finalStatus, article_row_id);

      if (finalStatus !== 'completed') return;

      // ----- Translator post-processing -----
      // Defensive size guard: a tiny (<100B) leftover from a crashed prior
      // job must not be confused for a real output.
      const minBytes = 100;
      const usable = (p: string): boolean => {
        try {
          return require('fs').statSync(p).size > minBytes;
        } catch {
          return false;
        }
      };
      const fs = require('fs');
      const translationMd = path.join(workspaceDir, '01_translation.md');
      const fixedMd = path.join(workspaceDir, '03_translation_fixed.md');
      const reviewMd = path.join(workspaceDir, '02_review.md');
      const finalMdPath = usable(fixedMd) ? fixedMd : translationMd;

      // Stash review report into job.log tail (UI display)
      if (usable(reviewMd)) {
        try {
          const reviewText = fs.readFileSync(reviewMd, 'utf-8');
          db.prepare('UPDATE jobs SET log = ? WHERE id = ?')
            .run(reviewText.slice(-50000), jobId);
        } catch {}
      }

      // Optional: Google Drive uploads
      const credsPath = process.env.DASHBOARD_GDRIVE_CREDENTIALS_PATH || project.credentials_path || '';
      const articleFolder = process.env.DASHBOARD_GDRIVE_ARTICLE_FOLDER_ID || project.article_folder_id || '';
      const reviewFolder = process.env.DASHBOARD_GDRIVE_REVIEW_FOLDER_ID || project.review_folder_id || project.factcheck_folder_id || '';

      const uploadToDrive = (file: string, folder: string): string => {
        try {
          const { execFileSync } = require('child_process');
          const result = execFileSync(
            'python3',
            [
              path.join(projectPath, 'scripts', 'upload_gdrive.py'),
              '--file', file,
              '--folder-id', folder,
              '--credentials', credsPath,
              '--as-doc',
              // Convert ![alt](url) → 🖼 [filename | alt](url) before upload
              // so Google Doc 変換時に画像原寸埋め込みでレイアウトが崩れない
              '--text-images',
            ],
            { encoding: 'utf-8' },
          );
          // upload_gdrive.py returns a JSON array ([{...}]) — extract first element
          const parsed = JSON.parse(result);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed[0].web_link || '';
          }
          if (parsed && typeof parsed === 'object') {
            return parsed.web_link || '';
          }
          return '';
        } catch (e: any) {
          appendFileSync(logFilePath, `\n[gdrive-warning] upload failed: ${e.message}\n`, 'utf-8');
          return '';
        }
      };

      if (credsPath && articleFolder && usable(finalMdPath)) {
        const webLink = uploadToDrive(finalMdPath, articleFolder);
        if (webLink) {
          db.prepare('UPDATE articles SET article_doc_url = ? WHERE id = ?')
            .run(webLink, article_row_id);
        }
      }
      if (credsPath && reviewFolder && usable(reviewMd)) {
        const webLink = uploadToDrive(reviewMd, reviewFolder);
        if (webLink) {
          db.prepare('UPDATE articles SET review_doc_url = ?, factcheck_doc_url = ? WHERE id = ?')
            .run(webLink, webLink, article_row_id);
        }
      }
    });

    child.on('error', (err: Error) => {
      db.prepare('UPDATE jobs SET status = ?, log = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run('failed', `Error: ${err.message}\n${output}`, jobId);
      db.prepare('UPDATE articles SET status = ?, error_message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run('failed', err.message, article_row_id);
    });

    return NextResponse.json({ jobId, message: '実行開始しました' });
  } catch (e: any) {
    if (e.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
