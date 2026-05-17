# digi_article_honyaku_cms

日本語 Web メディア記事を **英語に翻訳・校閲・修正して CMS に入稿** するための
管理画面 + バッチ実行ツール。

メディアごとの読者像・固有名詞ルールは **カテゴリ別 prompt override** で
切り替え可能（同梱の GTN Magazine プリセットあり、他媒体は追加自由）。

## 機能フロー

```
[日本語記事 URL] ──┬─→ Phase 1: 翻訳 (Claude)        → 01_translation.md
                  ├─→ Phase 2: 校閲 (Claude)        → 02_review.md
                  ├─→ Phase 3: 修正 (Claude)        → 03_translation_fixed.md
                  ├─→ Phase 4: Google Doc アップ    → article_doc_url
                  ├─→ Phase 5: Google Doc アップ    → review_doc_url
                  └─→ Phase 6: CMS DB UPSERT        → title / description / content
```

## ディレクトリ構成

```
.
├── README.md
├── CLAUDE.md                     # Claude Code 用ガイド
├── LICENSE
├── package.json                  # ルート (Node)
├── pyproject 系は不要、依存は pip
│
├── .claude/
│   └── commands/translate.md     # スラッシュコマンド (claude -p /translate)
│
├── prompts/                      # 汎用ベースプロンプト
│   ├── translation-system.md    # 翻訳ルール（HTML禁止/画像URL保持/AI文体回避）
│   └── translation-review.md    # 校閲ルール（10 観点）
│
├── categories/                   # メディアごとの override
│   └── gtn-magazine/
│       ├── prompt_translation.md # 在日外国人向け・固有名詞テーブル
│       └── prompt_review.md      # GTN 重大度判定基準
│
├── scripts/                      # Python ヘルパー
│   ├── fetch_article.py         # ブラウザ風 UA で記事 HTML 取得
│   ├── extract_content.py       # HTML → 構造化 Markdown (画像 URL 絶対化)
│   ├── upload_gdrive.py         # Google Doc 化アップロード
│   ├── update_article.py        # MySQL CMS への UPSERT
│   └── download_spreadsheet.py  # スプレッドシートから記事リスト取得
│
├── run_translate.sh              # CLI 一発実行（admin UI 経由しない）
│
├── config/
│   ├── client-sources.json      # クライアント情報テンプレ
│   └── media-profile.json       # メディアプロフィールテンプレ
│
└── admin/                        # Next.js 14 管理画面 (port 60017)
    ├── app/                      # App Router
    │   ├── login/
    │   ├── projects/
    │   │   └── [id]/             # all/articles/categories/tasks/settings ...
    │   └── api/
    │       ├── auth/
    │       ├── articles/execute/ # ★ translator パイプライン起動
    │       └── projects/
    ├── lib/db.ts                 # better-sqlite3 schema + migrate
    ├── components/
    └── package.json
```

## セットアップ

### 1. Python 依存

```bash
pip install requests beautifulsoup4 lxml google-api-python-client google-auth pymysql
```

### 2. Node 依存（管理画面）

```bash
cd admin && yarn install
```

### 3. Google Drive サービスアカウント

サービスアカウント JSON 鍵ファイルを用意し、環境変数で渡す:

```bash
export DASHBOARD_GDRIVE_CREDENTIALS_PATH=/path/to/sa.json
export DASHBOARD_GDRIVE_ARTICLE_FOLDER_ID=<翻訳記事用フォルダID>
export DASHBOARD_GDRIVE_REVIEW_FOLDER_ID=<校閲レポート用フォルダID>
```

未設定時は Drive アップロードがスキップされる（パイプラインは続行）。

### 4. 管理画面起動

```bash
cd admin && yarn dev      # → http://localhost:60017
```

初回はシードユーザーを作成:

```bash
cd admin && yarn seed
```

## 使い方

### A. 管理画面経由

1. ログイン → プロジェクト選択
2. 「新規記事」で **翻訳元 URL**（日本語記事の URL）を入力
3. カテゴリ選択（gtn-magazine など、任意）
4. 「実行」ボタン → translator パイプラインが起動
5. 完了後、Google Doc URL + 校閲レポート Doc URL が記事に紐づく

### B. CLI 一発実行

`run_translate.sh` 冒頭の `ARTICLES` 配列に
`<article_id>：<URL>` 形式で追加して実行:

```bash
./run_translate.sh --category gtn-magazine
./run_translate.sh --no-fix                # 修正フェーズスキップ
./run_translate.sh --db-config config/db.json  # CMS UPSERT も実行
```

## 翻訳ルールのカスタマイズ

### 汎用ルール変更

`prompts/translation-system.md` / `prompts/translation-review.md` を編集。
全カテゴリに影響する。

### 新規メディア用カテゴリ追加

`categories/<slug>/prompt_translation.md` と `prompt_review.md` を新規作成。
管理画面の「カテゴリ管理」で同 slug を登録して `prompt_translation_path` /
`prompt_review_path` を指定すると、そのカテゴリで起動した記事は
**汎用 + override 合成版** のルールで翻訳・校閲される。

### 固有名詞テーブルだけ差し替え

カテゴリの `prompt_translation.md` 内の固有名詞テーブルだけ書き換える。
他のルール（HTML禁止/画像URL保持など）は汎用に任せる。

## CMS 入稿の設定

`scripts/update_article.py` で MySQL CMS に UPSERT する。
プロジェクトごとに `db.json` を用意:

```json
{
  "connection": {
    "host": "...",
    "port": 3306,
    "database": "...",
    "user": "...",
    "password": "..."
  },
  "tag_ids": {
    "title": 26,
    "description": 27,
    "content": 29,
    "memo": 51,
    "publish_flag": 23,
    "type": 5
  },
  "tag_values": {
    "publish_open": "24",
    "publish_close": "25",
    "type_page": "6",
    "type_section": "7"
  },
  "sql": {
    "upsert": "INSERT INTO gtnArticlesTag (itemId, tagId, class, value, update_at) VALUES (%s, %s, 'item', %s, NOW()) ON DUPLICATE KEY UPDATE value = VALUES(value), update_at = NOW()",
    "verify": "SELECT itemId, tagId, LEFT(value, 100) AS value_preview, update_at FROM gtnArticlesTag WHERE itemId = %s ORDER BY tagId",
    "check_article": "SELECT id, name, depth FROM gtnArticles WHERE id = %s"
  }
}
```

## 既知の polish 課題（初版時点）

- 管理画面の入力ラベルが一部「キーワード」のまま（DB 側は `source_url` を使用、機能は OK）
- 古い writer 系のフィールド（`prompt_structure` / `prompt_article` / `factcheck_doc_url`）が schema に残っている（後方互換、translator パイプラインでは未使用）
- 管理画面の categories UI で新規 `prompt_translation` / `prompt_review` フィールドの入力欄はまだない（DB は対応済み）

これらは順次入稿運用しながら polish する想定。

## 参考

- 翻訳エージェントの設計詳細: `.claude/commands/translate.md`
- 既存記事生成ツール（writer 系の original）: `../writer_check_set_python/`
- 翻訳スキルの original: `../writer_translation_set/`（参考のみ、本リポジトリには含めない）
