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

// Create tables
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
    credentials_path TEXT DEFAULT '',
    claude_model TEXT DEFAULT 'claude-opus-4-6',
    project_path TEXT DEFAULT '',
    prompt_structure TEXT DEFAULT '',
    prompt_article TEXT DEFAULT '',
    prompt_factcheck TEXT DEFAULT '',
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

  CREATE TABLE IF NOT EXISTS articles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    article_id INTEGER NOT NULL,
    keywords TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    result_url TEXT DEFAULT '',
    article_doc_url TEXT DEFAULT '',
    factcheck_doc_url TEXT DEFAULT '',
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
    pid INTEGER DEFAULT 0,
    started_at DATETIME,
    completed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (article_row_id) REFERENCES articles(id) ON DELETE CASCADE
  );
`);

// Seed admin user
const adminHash = bcrypt.hashSync('admin', 10);
const existing = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
if (!existing) {
  db.prepare('INSERT INTO users (username, password_hash, display_name, role) VALUES (?, ?, ?, ?)')
    .run('admin', adminHash, 'Administrator', 'admin');
  console.log('Created admin user (username: admin, password: admin)');
} else {
  console.log('Admin user already exists');
}

// Seed GTN project
const existingProject = db.prepare('SELECT id FROM projects WHERE slug = ?').get('gtn-magazine');
if (!existingProject) {
  db.prepare(`
    INSERT INTO projects (name, slug, description, cms_base_url, db_host, db_port, db_name,
      article_folder_id, factcheck_folder_id, credentials_path, project_path)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'GTN Magazine',
    'gtn-magazine',
    'GTNマガジン向けSEO記事の作成・校閲・入稿',
    'https://cmsv1-dot-project-gtn-439607.an.r.appspot.com/admin/create/contents/gtnArticles',
    '34.146.90.95',
    3306,
    'content',
    '10LLkJVze1uTnM0oqjf8RZANfYVoO48E5',
    '1N3vBLWdxa514l53gwaBtvGLwet3UfTNK',
    '../key/nexus-notes-412407-ad4455fb74b4.json',
    '/config/workspace/writer_check_set'
  );
  console.log('Created GTN Magazine project');
} else {
  console.log('GTN Magazine project already exists');
}

db.close();
console.log('Seed complete!');
