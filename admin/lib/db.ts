import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'data', 'admin.db');

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = ON');
    migrate(_db);
  }
  return _db;
}

function migrate(db: Database.Database) {
  // Migrate existing tables - add new columns if missing
  const addColumnIfNotExists = (table: string, column: string, type: string) => {
    try {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
    } catch {
      // Column already exists
    }
  };

  addColumnIfNotExists('articles', 'article_doc_url', "TEXT DEFAULT ''");
  addColumnIfNotExists('articles', 'factcheck_doc_url', "TEXT DEFAULT ''"); // legacy alias for review_doc_url
  addColumnIfNotExists('articles', 'review_doc_url', "TEXT DEFAULT ''");
  addColumnIfNotExists('articles', 'category_id', "INTEGER DEFAULT NULL");
  // Translator-specific columns
  addColumnIfNotExists('articles', 'source_url', "TEXT NOT NULL DEFAULT ''");
  addColumnIfNotExists('articles', 'apply_fix', "INTEGER NOT NULL DEFAULT 1");
  // Translator per-category prompt overrides
  addColumnIfNotExists('categories', 'prompt_translation', "TEXT DEFAULT ''");
  addColumnIfNotExists('categories', 'prompt_review', "TEXT DEFAULT ''");
  addColumnIfNotExists('categories', 'prompt_translation_path', "TEXT DEFAULT ''");
  addColumnIfNotExists('categories', 'prompt_review_path', "TEXT DEFAULT ''");
  // Translator per-project default prompts (fallback when category override is empty)
  addColumnIfNotExists('projects', 'prompt_translation', "TEXT DEFAULT ''");
  addColumnIfNotExists('projects', 'prompt_review', "TEXT DEFAULT ''");
  // Drive folder for review docs (renamed from factcheck_folder_id semantically)
  addColumnIfNotExists('projects', 'review_folder_id', "TEXT DEFAULT ''");
  addColumnIfNotExists('projects', 'doc_check', "TEXT DEFAULT ''");
  addColumnIfNotExists('projects', 'doc_content', "TEXT DEFAULT ''");
  addColumnIfNotExists('categories', 'doc_check', "TEXT DEFAULT ''");
  addColumnIfNotExists('categories', 'doc_content', "TEXT DEFAULT ''");
  addColumnIfNotExists('jobs', 'log_file', "TEXT DEFAULT ''");
  addColumnIfNotExists('projects', 'db_config_path', "TEXT DEFAULT ''");
  addColumnIfNotExists('projects', 'db_tag_title', "INTEGER DEFAULT 26");
  addColumnIfNotExists('projects', 'db_tag_description', "INTEGER DEFAULT 27");
  addColumnIfNotExists('projects', 'db_tag_content', "INTEGER DEFAULT 29");
  addColumnIfNotExists('projects', 'db_tag_memo', "INTEGER DEFAULT 51");
  addColumnIfNotExists('projects', 'db_tag_publish_flag', "INTEGER DEFAULT 23");
  addColumnIfNotExists('projects', 'db_tag_type', "INTEGER DEFAULT 5");
  addColumnIfNotExists('projects', 'db_val_publish_open', "TEXT DEFAULT '24'");
  addColumnIfNotExists('projects', 'db_val_publish_close', "TEXT DEFAULT '25'");
  addColumnIfNotExists('projects', 'db_val_type_page', "TEXT DEFAULT '6'");
  addColumnIfNotExists('projects', 'db_val_type_section', "TEXT DEFAULT '7'");
  addColumnIfNotExists('projects', 'db_sql_upsert', "TEXT DEFAULT ''");
  addColumnIfNotExists('projects', 'db_sql_verify', "TEXT DEFAULT ''");
  addColumnIfNotExists('projects', 'db_sql_check_article', "TEXT DEFAULT ''");
  addColumnIfNotExists('projects', 'db_table_name', "TEXT DEFAULT 'gtnArticles'");
  addColumnIfNotExists('categories', 'doc_check_url', "TEXT DEFAULT ''");
  addColumnIfNotExists('categories', 'doc_content_url', "TEXT DEFAULT ''");
  addColumnIfNotExists('categories', 'prompt_structure_path', "TEXT DEFAULT ''");
  addColumnIfNotExists('categories', 'prompt_article_path', "TEXT DEFAULT ''");
  addColumnIfNotExists('categories', 'prompt_factcheck_path', "TEXT DEFAULT ''");
  addColumnIfNotExists('categories', 'doc_check_path', "TEXT DEFAULT ''");
  addColumnIfNotExists('categories', 'doc_content_path', "TEXT DEFAULT ''");
  addColumnIfNotExists('projects', 'spreadsheet_url', "TEXT DEFAULT ''");
  addColumnIfNotExists('projects', 'spreadsheet_sheet_name', "TEXT DEFAULT ''");
  addColumnIfNotExists('projects', 'spreadsheet_id_column', "TEXT DEFAULT 'A'");
  addColumnIfNotExists('projects', 'spreadsheet_display_columns', "TEXT DEFAULT ''");
  addColumnIfNotExists('articles', 'scheduled_at', "TEXT DEFAULT NULL");

  // URL pattern columns
  addColumnIfNotExists('projects', 'preview_url_pattern', "TEXT DEFAULT ''");
  addColumnIfNotExists('projects', 'public_url_pattern', "TEXT DEFAULT ''");

  // article_tasks migration
  addColumnIfNotExists('article_tasks', 'suggested_content', "TEXT DEFAULT ''");
  addColumnIfNotExists('article_tasks', 'article_ids', "TEXT DEFAULT ''");

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

      -- CMS settings
      cms_base_url TEXT DEFAULT '',

      -- DB settings
      db_host TEXT DEFAULT '',
      db_port INTEGER DEFAULT 3306,
      db_name TEXT DEFAULT '',
      db_user TEXT DEFAULT '',
      db_password TEXT DEFAULT '',

      -- Google Drive settings
      article_folder_id TEXT DEFAULT '',
      factcheck_folder_id TEXT DEFAULT '',
      credentials_path TEXT DEFAULT '',

      -- Claude settings
      claude_model TEXT DEFAULT 'claude-opus-4-6',
      project_path TEXT DEFAULT '',

      -- Prompts
      prompt_structure TEXT DEFAULT '',
      prompt_article TEXT DEFAULT '',
      prompt_factcheck TEXT DEFAULT '',

      -- Documents
      doc_check TEXT DEFAULT '',
      doc_content TEXT DEFAULT '',

      -- Spreadsheet settings
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
      keywords TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      result_url TEXT DEFAULT '',
      category_id INTEGER DEFAULT NULL,
      article_doc_url TEXT DEFAULT '',
      factcheck_doc_url TEXT DEFAULT '',
      error_message TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS article_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      article_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'open',
      priority TEXT NOT NULL DEFAULT 'medium',
      suggested_content TEXT DEFAULT '',
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
}
