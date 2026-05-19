import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const DB_PATH = path.join(dataDir, 'admin.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Repo root (one level up from admin/) — used for category prompt file paths
const REPO_ROOT = path.resolve(__dirname, '..', '..');

// ---------------------------------------------------------------------------
// Schema (mirrors admin/lib/db.ts migrate() — kept in sync for fresh installs)
// ---------------------------------------------------------------------------
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT 'user',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description TEXT DEFAULT '',
    cms_base_url TEXT DEFAULT '',
    db_host TEXT DEFAULT '',
    db_port INTEGER DEFAULT 3306,
    db_name TEXT DEFAULT '',
    db_user TEXT DEFAULT '',
    db_password TEXT DEFAULT '',
    article_folder_id TEXT DEFAULT '',
    factcheck_folder_id TEXT DEFAULT '',
    review_folder_id TEXT DEFAULT '',
    credentials_path TEXT DEFAULT '',
    claude_model TEXT DEFAULT 'claude-opus-4-6',
    project_path TEXT DEFAULT '',
    prompt_structure TEXT DEFAULT '',
    prompt_article TEXT DEFAULT '',
    prompt_factcheck TEXT DEFAULT '',
    prompt_translation TEXT DEFAULT '',
    prompt_review TEXT DEFAULT '',
    spreadsheet_url TEXT DEFAULT '',
    spreadsheet_sheet_name TEXT DEFAULT '',
    spreadsheet_id_column TEXT DEFAULT 'A',
    spreadsheet_display_columns TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS user_projects (
    user_id INTEGER NOT NULL,
    project_id INTEGER NOT NULL,
    PRIMARY KEY (user_id, project_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    prompt_structure TEXT DEFAULT '',
    prompt_article TEXT DEFAULT '',
    prompt_factcheck TEXT DEFAULT '',
    prompt_translation TEXT DEFAULT '',
    prompt_review TEXT DEFAULT '',
    prompt_translation_path TEXT DEFAULT '',
    prompt_review_path TEXT DEFAULT '',
    doc_check TEXT DEFAULT '',
    doc_content TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS articles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    article_id INTEGER NOT NULL,
    keywords TEXT NOT NULL DEFAULT '',
    source_url TEXT NOT NULL DEFAULT '',
    apply_fix INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'pending',
    result_url TEXT DEFAULT '',
    article_doc_url TEXT DEFAULT '',
    factcheck_doc_url TEXT DEFAULT '',
    review_doc_url TEXT DEFAULT '',
    category_id INTEGER DEFAULT NULL,
    error_message TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    article_row_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    phase TEXT DEFAULT '',
    log TEXT DEFAULT '',
    log_file TEXT DEFAULT '',
    pid INTEGER DEFAULT 0,
    started_at DATETIME,
    completed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (article_row_id) REFERENCES articles(id) ON DELETE CASCADE
  );
`);

// ---------------------------------------------------------------------------
// Admin user
// ---------------------------------------------------------------------------
const adminHash = bcrypt.hashSync('admin', 10);
const existing = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
if (!existing) {
  db.prepare('INSERT INTO users (username, password_hash, display_name, role) VALUES (?, ?, ?, ?)')
    .run('admin', adminHash, 'Administrator', 'admin');
  console.log('Created admin user (username: admin, password: admin)');
} else {
  console.log('Admin user already exists');
}

// ---------------------------------------------------------------------------
// GTN Magazine project (default preset)
// ---------------------------------------------------------------------------
// Folder IDs provided by the GTN team (Drive 上で sub-folder の "翻訳作成" /
// "翻訳校閲"). 認証 JSON は別途配置し、UI の「認証ファイルパス」または
// 環境変数 DASHBOARD_GDRIVE_CREDENTIALS_PATH で渡す。
const GTN_ARTICLE_FOLDER = '1SYXlt3mWyxclvrZG5xXtt7IZ-f8kyihc';  // 翻訳作成
const GTN_REVIEW_FOLDER  = '14rGRTsfjRzy1KdCV0-oke5pLxnVcjFJ7';  // 翻訳校閲

// 認証 JSON は環境変数で渡せば seed が prefill する。未設定なら空のまま
// （UI から後で入れる）。例:
//   DEFAULT_GDRIVE_CREDENTIALS_PATH=/Users/akira/work/key/nexus-notes-412407-ad4455fb74b4.json yarn seed
const DEFAULT_CREDENTIALS_PATH = process.env.DEFAULT_GDRIVE_CREDENTIALS_PATH || '';

let gtnProjectId;
const existingProject = db.prepare('SELECT id FROM projects WHERE slug = ?').get('gtn-magazine');
if (!existingProject) {
  const result = db.prepare(`
    INSERT INTO projects (
      name, slug, description, cms_base_url,
      article_folder_id, factcheck_folder_id, review_folder_id,
      credentials_path, project_path
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'GTN Magazine',
    'gtn-magazine',
    'GTNマガジン向け 日英翻訳・校閲・修正・CMS入稿',
    'https://cmsv1-dot-project-gtn-439607.an.r.appspot.com/admin/create/contents/gtnArticles',
    GTN_ARTICLE_FOLDER,
    GTN_REVIEW_FOLDER,
    GTN_REVIEW_FOLDER, // mirror legacy factcheck_folder_id
    DEFAULT_CREDENTIALS_PATH, // set via DEFAULT_GDRIVE_CREDENTIALS_PATH env or admin UI later
    REPO_ROOT, // project_path = repo root so the runner can find scripts/ and prompts/
  );
  gtnProjectId = Number(result.lastInsertRowid);
  console.log(`Created GTN Magazine project (id=${gtnProjectId}) with translation folder IDs preset`);
} else {
  gtnProjectId = Number(existingProject.id);
  console.log(`GTN Magazine project already exists (id=${gtnProjectId})`);
}

// ---------------------------------------------------------------------------
// GTN category — references the repo-level prompt override files
// ---------------------------------------------------------------------------
const promptTranslationPath = path.join(REPO_ROOT, 'categories', 'gtn-magazine', 'prompt_translation.md');
const promptReviewPath = path.join(REPO_ROOT, 'categories', 'gtn-magazine', 'prompt_review.md');

const existingCategory = db.prepare(
  'SELECT id FROM categories WHERE project_id = ? AND name = ?'
).get(gtnProjectId, 'GTN Magazine 標準');

if (!existingCategory) {
  db.prepare(`
    INSERT INTO categories (
      project_id, name, prompt_translation_path, prompt_review_path
    ) VALUES (?, ?, ?, ?)
  `).run(
    gtnProjectId,
    'GTN Magazine 標準',
    promptTranslationPath,
    promptReviewPath,
  );
  console.log(`Created GTN Magazine 標準 category referencing override prompts at categories/gtn-magazine/`);
} else {
  console.log('GTN Magazine 標準 category already exists');
}

// ---------------------------------------------------------------------------
// Link admin user to GTN project
// ---------------------------------------------------------------------------
const adminId = db.prepare('SELECT id FROM users WHERE username = ?').get('admin').id;
const linkExists = db.prepare(
  'SELECT 1 FROM user_projects WHERE user_id = ? AND project_id = ?'
).get(adminId, gtnProjectId);
if (!linkExists) {
  db.prepare('INSERT INTO user_projects (user_id, project_id) VALUES (?, ?)')
    .run(adminId, gtnProjectId);
}

db.close();
console.log('\nSeed complete!');
console.log('  - Login: http://localhost:60017/login  (admin / admin)');
console.log('  - Project: GTN Magazine');
console.log(`    - 翻訳作成 Drive: https://drive.google.com/drive/folders/${GTN_ARTICLE_FOLDER}`);
console.log(`    - 翻訳校閲 Drive: https://drive.google.com/drive/folders/${GTN_REVIEW_FOLDER}`);
console.log(`    - 認証ファイルパス: ${DEFAULT_CREDENTIALS_PATH || '(未設定 — UI または DEFAULT_GDRIVE_CREDENTIALS_PATH で設定)'}`);
console.log('  - Category: GTN Magazine 標準 (prompt override 適用済み)');
