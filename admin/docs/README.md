# Writer Check Admin - 管理画面ドキュメント

記事作成・校閲・入稿パイプラインを GUI で管理する Web アプリケーション。

---

## 1. 概要

Writer Check Admin は、`claude -p --dangerously-skip-permissions "/write-check-publish {ID} {keywords}"` コマンドを Web UI から実行・管理するための管理画面です。

### 主な機能

| 機能 | 説明 |
|------|------|
| マルチプロジェクト管理 | 複数のメディア・プロジェクトを独立して管理 |
| 記事実行 | GUI からワンクリックで記事作成→校閲→入稿を実行 |
| プロンプト管理 | プロジェクトごとに記事構成・執筆・校閲プロンプトを設定 |
| CMS/DB 設定 | プロジェクトごとに管理画面 URL・DB 接続情報を設定 |
| Google Drive 設定 | プロジェクトごとにフォルダ ID・認証情報を設定 |
| ユーザー認証 | ログイン機能付き、セッションベース |
| アクセス制御 | ユーザーごとにアクセス可能プロジェクトを制限 |
| ジョブ管理 | 実行状況・ログのリアルタイム閲覧 |

---

## 2. 技術スタック

| 項目 | 技術 |
|------|------|
| フレームワーク | Next.js 14 (App Router) |
| 言語 | TypeScript |
| DB | SQLite (better-sqlite3) |
| 認証 | iron-session (Cookie ベース) |
| パスワード | bcryptjs (ハッシュ化) |
| UI | Tailwind CSS |
| ポート | 3001 (デフォルト) |

---

## 3. ディレクトリ構成

```
admin/
├── package.json
├── next.config.js
├── tsconfig.json
├── tailwind.config.js
├── postcss.config.js
├── .gitignore
│
├── lib/                          # コアライブラリ
│   ├── db.ts                     # SQLite 接続 & マイグレーション
│   ├── auth.ts                   # 認証・アクセス制御ロジック
│   ├── session.ts                # セッション管理
│   └── seed.mjs                  # DB 初期化スクリプト
│
├── components/                   # 共通 UI コンポーネント
│   ├── AuthLayout.tsx            # 認証ラッパー + サイドバー
│   └── Sidebar.tsx               # サイドナビゲーション
│
├── app/                          # Next.js App Router
│   ├── layout.tsx                # ルートレイアウト
│   ├── globals.css               # グローバルスタイル
│   ├── page.tsx                  # / → /projects へリダイレクト
│   │
│   ├── login/
│   │   └── page.tsx              # ログイン画面
│   │
│   ├── projects/
│   │   ├── page.tsx              # プロジェクト一覧
│   │   ├── new/page.tsx          # プロジェクト新規作成
│   │   └── [id]/
│   │       ├── page.tsx          # プロジェクト詳細（記事一覧）
│   │       ├── settings/page.tsx # プロジェクト設定
│   │       └── articles/
│   │           └── [articleId]/
│   │               └── page.tsx  # 記事詳細（ジョブログ）
│   │
│   ├── users/
│   │   ├── page.tsx              # ユーザー一覧
│   │   ├── new/page.tsx          # ユーザー新規作成
│   │   └── [id]/page.tsx         # ユーザー編集
│   │
│   └── api/                      # API エンドポイント
│       ├── auth/
│       │   ├── login/route.ts    # POST: ログイン
│       │   ├── logout/route.ts   # POST: ログアウト
│       │   └── me/route.ts       # GET: 現在のユーザー情報
│       ├── projects/
│       │   ├── route.ts          # GET: 一覧 / POST: 作成
│       │   └── [id]/route.ts     # GET: 詳細 / PUT: 更新 / DELETE: 削除
│       ├── articles/
│       │   ├── route.ts          # POST: 作成
│       │   ├── [id]/route.ts     # GET: 詳細 / DELETE: 削除
│       │   └── execute/route.ts  # POST: 記事実行
│       ├── users/
│       │   ├── route.ts          # GET: 一覧 / POST: 作成
│       │   └── [id]/
│       │       ├── route.ts      # GET: 詳細 / PUT: 更新 / DELETE: 削除
│       │       └── projects/route.ts  # PUT: プロジェクトアクセス設定
│       └── jobs/
│           └── [id]/route.ts     # GET: ジョブ詳細
│
└── data/
    └── admin.db                  # SQLite データベース（自動生成）
```

---

## 4. セットアップ手順

### 4.1 前提条件

- Node.js 18 以上
- Claude CLI がインストール済み（`claude` コマンドが使える状態）

### 4.2 インストール

```bash
cd /config/workspace/writer_check_set/admin

# 依存パッケージのインストール
npm install

# データベース初期化 & 初期データ投入
npm run seed
```

### 4.3 起動

```bash
# 開発モード
npm run dev

# 本番モード
npm run build
npm run start
```

ブラウザで `http://localhost:3001` にアクセスします。

### 4.4 初期ログイン情報

| 項目 | 値 |
|------|-----|
| ユーザー名 | `admin` |
| パスワード | `admin` |

> **注意**: 本番運用時は必ずパスワードを変更してください。

---

## 5. 画面説明

### 5.1 ログイン画面 (`/login`)

ユーザー名とパスワードを入力してログインします。認証後、プロジェクト一覧へ遷移します。

### 5.2 プロジェクト一覧 (`/projects`)

- アクセス可能なプロジェクトがカード形式で表示されます
- admin ユーザーは全プロジェクトを閲覧可能
- 一般ユーザーは割り当てられたプロジェクトのみ表示
- 「+ 新規プロジェクト」ボタンから新規作成（admin のみ）

### 5.3 プロジェクト詳細 (`/projects/[id]`)

記事の一覧表示と管理を行います。

- **記事追加**: 「+ 記事追加」ボタンで管理画面 ID とキーワードを入力
- **実行**: 「実行」ボタンで記事作成→校閲→入稿パイプラインを開始
- **ステータス**: 待機中 / 実行中 / 完了 / 失敗 を表示（5秒ごと自動更新）
- **結果URL**: 完了後に CMS の URL が表示されます
- **詳細**: ジョブログを確認できます

### 5.4 プロジェクト設定 (`/projects/[id]/settings`)

プロジェクトの各種設定を管理します（admin のみ編集可）。

#### 設定項目一覧

| カテゴリ | 項目 | 説明 | 例 |
|----------|------|------|----|
| 基本情報 | プロジェクト名 | 表示名 | GTN Magazine |
| 基本情報 | 説明 | プロジェクトの説明 | GTNマガジン向けSEO記事 |
| パス | プロジェクトパス | writer_check プロジェクトの絶対パス | `/config/workspace/writer_check_set` |
| CMS | 管理画面ベースURL | CMS の記事編集 URL | `https://cmsv1-dot-...appspot.com/admin/create/contents/gtnArticles` |
| DB | ホスト | MySQL ホスト | `34.146.90.95` |
| DB | ポート | MySQL ポート | `3306` |
| DB | データベース名 | ターゲット DB | `content` |
| DB | ユーザー / パスワード | DB 認証情報 | - |
| Drive | 記事フォルダID | Google Drive のフォルダ ID | `10LLkJVze1uTnM0oqjf8RZANfYVoO48E5` |
| Drive | 校閲フォルダID | 校閲レポート用フォルダ ID | `1N3vBLWdxa514l53gwaBtvGLwet3UfTNK` |
| Drive | 認証ファイルパス | サービスアカウント JSON | `../key/nexus-notes-412407-ad4455fb74b4.json` |
| Claude | モデル | 使用する Claude モデル | `claude-opus-4-6` |
| プロンプト | 記事タイトル＆構成生成 | Phase 1 で使用するプロンプト | - |
| プロンプト | 記事生成 | Phase 3 で使用するプロンプト | - |
| プロンプト | 校閲 | Phase 5 で使用するプロンプト | - |

### 5.5 記事詳細 (`/projects/[id]/articles/[articleId]`)

- 記事のメタ情報（ID、キーワード、ステータス、結果 URL）を表示
- 「記事作成・校閲・入稿を実行」ボタンで再実行可能
- ジョブ履歴: 過去の実行ログをターミナル風に表示（3秒ごと自動更新）

### 5.6 ユーザー管理 (`/users`) - admin 専用

- ユーザー一覧の表示
- 新規ユーザー作成
- ユーザー編集（表示名・パスワード・権限変更）
- プロジェクトアクセス権の割り当て
- ユーザー削除

### 5.7 ユーザー編集 (`/users/[id]`) - admin 専用

- 基本情報（表示名・パスワード・権限）の変更
- アクセス可能プロジェクトのチェックボックス選択

---

## 6. 権限モデル

### ロール

| ロール | 説明 |
|--------|------|
| `admin` | 全プロジェクト・全機能にアクセス可能。ユーザー管理・プロジェクト作成/削除が可能 |
| `user` | 割り当てられたプロジェクトのみアクセス可能。記事の追加・実行が可能 |

### アクセス制御マトリクス

| 操作 | admin | user |
|------|-------|------|
| プロジェクト一覧表示 | 全プロジェクト | 割り当て済みのみ |
| プロジェクト作成 | ○ | × |
| プロジェクト設定変更 | ○ | × |
| プロジェクト削除 | ○ | × |
| 記事追加 | ○ | ○（自分のプロジェクトのみ） |
| 記事実行 | ○ | ○（自分のプロジェクトのみ） |
| 記事削除 | ○ | ○（自分のプロジェクトのみ） |
| ユーザー管理 | ○ | × |

---

## 7. 記事実行フロー

「実行」ボタンを押すと、以下のコマンドがバックグラウンドで実行されます：

```bash
cd {project_path}
claude -p --dangerously-skip-permissions "/write-check-publish {article_id} {keywords}"
```

### 実行される 7 フェーズ

```
Phase 1: /seo-analyze   → キーワード分析 & 記事構成生成
Phase 2: /seo-research   → 競合調査 & 情報収集
Phase 3: /seo-write      → 記事執筆 & Word文書 & HTML生成
Phase 4: Google Drive     → 記事ドキュメントをアップロード → URL取得
Phase 5: /factcheck       → 校閲 & ファクトチェックレポート生成
Phase 6: Google Drive     → 校閲レポートをアップロード → URL取得
Phase 7: DB更新           → タイトル・ディスクリプション・コンテンツ・メモ(URL)を入稿
```

### ステータス遷移

```
pending → running → completed
                  → failed
```

### 出力ファイル（`{project_path}/output/` 内に生成）

| ファイル | 内容 |
|----------|------|
| `01_structure_{keyword}.md` | 記事構成 |
| `02_research_{keyword}.md` | 競合調査結果 |
| `03_article_{keyword}.json` | 記事データ (JSON) |
| `03_article_{keyword}.docx` | 記事 Word 文書 |
| `03_article_{keyword}.html` | 記事 HTML |
| `factcheck_{keyword}.md` | 校閲レポート |

---

## 8. データベーススキーマ

### users テーブル

| カラム | 型 | 説明 |
|--------|-----|------|
| id | INTEGER PK | 自動採番 |
| username | TEXT UNIQUE | ログイン用ユーザー名 |
| password_hash | TEXT | bcrypt ハッシュ化パスワード |
| display_name | TEXT | 表示名 |
| role | TEXT | `admin` or `user` |
| created_at | DATETIME | 作成日時 |
| updated_at | DATETIME | 更新日時 |

### projects テーブル

| カラム | 型 | 説明 |
|--------|-----|------|
| id | INTEGER PK | 自動採番 |
| name | TEXT | プロジェクト名 |
| slug | TEXT UNIQUE | URL スラグ |
| description | TEXT | 説明 |
| cms_base_url | TEXT | CMS ベース URL |
| db_host | TEXT | MySQL ホスト |
| db_port | INTEGER | MySQL ポート |
| db_name | TEXT | DB 名 |
| db_user | TEXT | DB ユーザー |
| db_password | TEXT | DB パスワード |
| article_folder_id | TEXT | Google Drive 記事フォルダ ID |
| factcheck_folder_id | TEXT | Google Drive 校閲フォルダ ID |
| credentials_path | TEXT | サービスアカウント JSON パス |
| claude_model | TEXT | Claude モデル名 |
| project_path | TEXT | writer_check プロジェクトパス |
| prompt_structure | TEXT | 記事構成プロンプト |
| prompt_article | TEXT | 記事生成プロンプト |
| prompt_factcheck | TEXT | 校閲プロンプト |
| created_at | DATETIME | 作成日時 |
| updated_at | DATETIME | 更新日時 |

### user_projects テーブル

| カラム | 型 | 説明 |
|--------|-----|------|
| user_id | INTEGER FK | ユーザー ID |
| project_id | INTEGER FK | プロジェクト ID |

### articles テーブル

| カラム | 型 | 説明 |
|--------|-----|------|
| id | INTEGER PK | 自動採番 |
| project_id | INTEGER FK | 所属プロジェクト |
| article_id | INTEGER | CMS 上の記事 ID |
| keywords | TEXT | スペース区切りキーワード |
| status | TEXT | `pending` / `running` / `completed` / `failed` |
| result_url | TEXT | 完了後の CMS URL |
| error_message | TEXT | エラーメッセージ |
| created_at | DATETIME | 作成日時 |
| updated_at | DATETIME | 更新日時 |

### jobs テーブル

| カラム | 型 | 説明 |
|--------|-----|------|
| id | INTEGER PK | 自動採番 |
| article_row_id | INTEGER FK | 記事テーブルの ID |
| status | TEXT | `pending` / `running` / `completed` / `failed` |
| phase | TEXT | 現在の実行フェーズ |
| log | TEXT | 実行ログ（最大 50KB） |
| pid | INTEGER | プロセス ID |
| started_at | DATETIME | 開始日時 |
| completed_at | DATETIME | 完了日時 |
| created_at | DATETIME | 作成日時 |

---

## 9. API リファレンス

全 API は Cookie ベースのセッション認証が必要です。

### 認証

| メソッド | パス | 説明 | 権限 |
|----------|------|------|------|
| POST | `/api/auth/login` | ログイン | 不要 |
| POST | `/api/auth/logout` | ログアウト | 認証済み |
| GET | `/api/auth/me` | 現在のユーザー | 認証済み |

#### POST `/api/auth/login`

```json
// Request
{ "username": "admin", "password": "admin" }

// Response 200
{ "user": { "id": 1, "username": "admin", "role": "admin", "display_name": "Administrator" } }

// Response 401
{ "error": "ユーザー名またはパスワードが正しくありません" }
```

### プロジェクト

| メソッド | パス | 説明 | 権限 |
|----------|------|------|------|
| GET | `/api/projects` | プロジェクト一覧（アクセス可能分） | 認証済み |
| POST | `/api/projects` | プロジェクト作成 | admin |
| GET | `/api/projects/:id` | プロジェクト詳細 + 記事一覧 | 認証済み（アクセス権あり） |
| PUT | `/api/projects/:id` | プロジェクト更新 | admin |
| DELETE | `/api/projects/:id` | プロジェクト削除 | admin |

### 記事

| メソッド | パス | 説明 | 権限 |
|----------|------|------|------|
| POST | `/api/articles` | 記事作成 | 認証済み（プロジェクトアクセス権あり） |
| GET | `/api/articles/:id` | 記事詳細 + ジョブ一覧 | 認証済み（プロジェクトアクセス権あり） |
| DELETE | `/api/articles/:id` | 記事削除 | 認証済み（プロジェクトアクセス権あり） |

#### POST `/api/articles`

```json
// Request
{ "project_id": 1, "article_id": 230, "keywords": "賃貸 間取り 見方" }

// Response 201
{ "id": 1 }
```

### 記事実行

| メソッド | パス | 説明 | 権限 |
|----------|------|------|------|
| POST | `/api/articles/execute` | 記事パイプライン実行 | 認証済み（プロジェクトアクセス権あり） |

#### POST `/api/articles/execute`

```json
// Request
{ "article_row_id": 1 }

// Response 200
{ "jobId": 1, "message": "実行開始しました" }
```

### ジョブ

| メソッド | パス | 説明 | 権限 |
|----------|------|------|------|
| GET | `/api/jobs/:id` | ジョブ詳細（ログ含む） | 認証済み |

### ユーザー

| メソッド | パス | 説明 | 権限 |
|----------|------|------|------|
| GET | `/api/users` | ユーザー一覧 | admin |
| POST | `/api/users` | ユーザー作成 | admin |
| GET | `/api/users/:id` | ユーザー詳細 + プロジェクト割り当て | admin |
| PUT | `/api/users/:id` | ユーザー更新 | admin |
| DELETE | `/api/users/:id` | ユーザー削除 | admin |
| PUT | `/api/users/:id/projects` | プロジェクトアクセス権設定 | admin |

#### PUT `/api/users/:id/projects`

```json
// Request
{ "project_ids": [1, 3] }

// Response 200
{ "ok": true }
```

---

## 10. 運用手順

### 10.1 新しいプロジェクトを追加する

1. admin でログイン
2. 「+ 新規プロジェクト」をクリック
3. 必要な設定を入力して「作成」
4. 必要に応じてユーザーにプロジェクトアクセス権を付与

### 10.2 記事を作成・入稿する

1. プロジェクト詳細画面を開く
2. 「+ 記事追加」で管理画面 ID とキーワードを入力
3. 「実行」ボタンをクリック
4. ステータスが「完了」になるまで待機（自動更新）
5. 結果 URL をクリックして CMS で確認

### 10.3 新しいユーザーを追加する

1. admin でログイン
2. サイドバー「ユーザー管理」→「+ 新規ユーザー」
3. ユーザー名・パスワード・権限を設定して「作成」
4. ユーザー編集画面でアクセス可能プロジェクトにチェック

### 10.4 プロンプトを変更する

1. admin でログイン
2. プロジェクト詳細 →「設定」
3. 「プロンプト」セクションで各プロンプトを編集
4. 「保存」

---

## 11. 初期データ

`npm run seed` で以下が作成されます：

| 種別 | データ |
|------|--------|
| admin ユーザー | username: `admin`, password: `admin`, role: `admin` |
| GTN Magazine プロジェクト | CMS URL, DB 接続情報, Google Drive フォルダ ID 等が設定済み |

---

## 12. 注意事項

- SQLite DB ファイルは `admin/data/admin.db` に保存されます（`.gitignore` 済み）
- セッションシークレットは `SESSION_SECRET` 環境変数で変更可能（デフォルトはハードコード値）
- 記事実行は `child_process.spawn` でバックグラウンド実行されるため、Next.js サーバーが停止するとジョブも停止します
- ジョブログは最新 50KB のみ保持されます
- 本番運用時は `admin` ユーザーのパスワード変更と `SESSION_SECRET` の設定を必ず行ってください
