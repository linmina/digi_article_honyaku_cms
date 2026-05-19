# セットアップ手順書

このリポジトリ (`digi_article_honyaku_cms`) を新しい環境（akira 機など）に
展開するための完全手順。

---

## 必要なもの（前提）

| 項目 | 推奨 / 備考 |
|---|---|
| Python | 3.9 以上（3.10+ 推奨） |
| Node.js | 18 以上 |
| yarn | 1.22 以上 |
| Claude CLI | `claude --version` で 2.x 以上が出ること |
| Google サービスアカウント JSON | `nexus-notes-412407-ad4455fb74b4.json` |

Claude CLI が無い場合: <https://docs.claude.com/en/docs/agents-and-tools/claude-code>

---

## 1. リポジトリを clone

```bash
cd /Users/akira/work/git  # 任意の作業ディレクトリ
git clone https://github.com/linmina/digi_article_honyaku_cms.git
cd digi_article_honyaku_cms
```

## 2. サービスアカウント JSON を配置

リポジトリ外に置く（コミットしないため）。推奨は隣の `key/` ディレクトリ:

```bash
mkdir -p /Users/akira/work/key
# JSON は GTN Drive の所有者から共有してもらう
cp <受け取った場所>/nexus-notes-412407-ad4455fb74b4.json /Users/akira/work/key/
chmod 600 /Users/akira/work/key/nexus-notes-412407-ad4455fb74b4.json  # 推奨
```

> **重要**: この JSON は機密情報。リポジトリにコミットしない。
> `report@nexus-notes-412407.iam.gserviceaccount.com` という権限を持つ
> サービスアカウントが GTN Drive の翻訳作成 / 翻訳校閲フォルダに書き込める設定済み。

## 3. Python 依存をインストール

```bash
pip3 install requests beautifulsoup4 lxml google-api-python-client google-auth pymysql
```

確認:
```bash
python3 -c "import requests, bs4, lxml; from google.oauth2 import service_account; print('OK')"
```

## 4. Node 依存をインストール

```bash
cd admin
yarn install
cd ..
```

## 5. データベースを seed（初期データ投入）

GTN Magazine project + 標準カテゴリ + admin ユーザーを一発で作る:

```bash
cd admin
DEFAULT_GDRIVE_CREDENTIALS_PATH=/Users/akira/work/key/nexus-notes-412407-ad4455fb74b4.json \
  yarn seed
```

出力例:
```
Created admin user (username: admin, password: admin)
Created GTN Magazine project (id=1) with translation folder IDs preset
Created GTN Magazine 標準 category referencing override prompts at categories/gtn-magazine/

Seed complete!
  - Login: http://localhost:60017/login  (admin / admin)
  - Project: GTN Magazine
    - 翻訳作成 Drive: https://drive.google.com/drive/folders/1SYXlt3mWyxclvrZG5xXtt7IZ-f8kyihc
    - 翻訳校閲 Drive: https://drive.google.com/drive/folders/14rGRTsfjRzy1KdCV0-oke5pLxnVcjFJ7
    - 認証ファイルパス: /Users/akira/work/key/nexus-notes-412407-ad4455fb74b4.json
  - Category: GTN Magazine 標準 (prompt override 適用済み)
```

> `DEFAULT_GDRIVE_CREDENTIALS_PATH` を渡し忘れた場合: 認証ファイルパスは空になるが、後で admin UI から入力可能（手順 7-B 参照）。

## 6. 管理画面を起動

```bash
cd admin
yarn dev
```

→ http://localhost:60017 にアクセス

---

## 7. 初回ログイン

| 項目 | 値 |
|---|---|
| URL | http://localhost:60017/login |
| **ユーザー名** | `admin` |
| **パスワード** | `admin` |

> **本番運用前に必ずパスワードを変える**（手順 8 参照）。

### 7-A. ログイン後の確認

- 左メニュー「📁 プロジェクト」 → 「GTN Magazine」が見える
- プロジェクト名クリック → 上タブ「設定」
- 「Google Drive設定」セクションに ID 2 つと認証パスが入っていることを確認
- 「リポジトリパス」が正しいか確認（このリポジトリの絶対パス）

### 7-B. 認証ファイルパスを後から入れる場合（手順 5 でスキップした場合）

1. `/projects/1/settings` ページを開く
2. 「Google Drive設定」 → 「認証ファイルパス」に
   `/Users/akira/work/key/nexus-notes-412407-ad4455fb74b4.json` を入力
3. ページ下部「保存」ボタン

---

## 8. パスワード変更（必須・本番前）

### 方法 A: admin UI から

1. ログイン後 → 左メニュー「👤 ユーザー管理」
2. `admin` を編集 → パスワード変更

### 方法 B: CLI から（ハッシュ直接書き換え）

```bash
cd admin
node -e "
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const db = new Database('data/admin.db');
const hash = bcrypt.hashSync('新しいパスワード', 10);
db.prepare('UPDATE users SET password_hash = ? WHERE username = ?').run(hash, 'admin');
console.log('updated');
"
```

### 方法 C: 別ユーザーを追加して admin を削除

1. `/users/new` で新規 admin ロール作成
2. 新ユーザーでログインし直し
3. 元の `admin` ユーザーを削除 or パスワード変更

---

## 9. Drive 疎通の単体テスト

サービスアカウントが Drive にアクセスできるか即時確認:

```bash
cd /Users/akira/work/git/digi_article_honyaku_cms
echo "# Drive test $(date)" > /tmp/drive-test.md
python3 scripts/upload_gdrive.py \
  --file /tmp/drive-test.md \
  --folder-id 1SYXlt3mWyxclvrZG5xXtt7IZ-f8kyihc \
  --credentials /Users/akira/work/key/nexus-notes-412407-ad4455fb74b4.json \
  --as-doc
```

成功すると JSON で `"status": "success"` + Google Doc URL が返る。
Drive の「翻訳作成」フォルダに `drive-test.md` という Google Doc が現れる。
（不要なので Drive UI から削除）

---

## 10. 翻訳パイプラインの単体テスト（任意）

CLI 一発で 1 記事翻訳 → 校閲 → 修正 → Drive 保存:

```bash
# run_translate.sh 冒頭の ARTICLES 配列に追加
ARTICLES=(
  "100：https://www.gtn.co.jp/magazine/ja/article177/"
)
```

実行:
```bash
export DASHBOARD_GDRIVE_CREDENTIALS_PATH=/Users/akira/work/key/nexus-notes-412407-ad4455fb74b4.json
export DASHBOARD_GDRIVE_ARTICLE_FOLDER_ID=1SYXlt3mWyxclvrZG5xXtt7IZ-f8kyihc
export DASHBOARD_GDRIVE_REVIEW_FOLDER_ID=14rGRTsfjRzy1KdCV0-oke5pLxnVcjFJ7

./run_translate.sh --category gtn-magazine
```

所要時間: ~10 分（Claude 翻訳 + 校閲 + 修正）

完了後:
- 翻訳作成フォルダに英訳 Google Doc が追加
- 翻訳校閲フォルダに校閲レポート Google Doc が追加

---

## 11. 管理画面から翻訳ジョブを起動

1. ログイン → 「GTN Magazine」 → 「全記事」
2. 「新規記事」ボタン
3. フォーム:
   - **記事 ID**: 任意の数値（CMS 側の itemId に対応）
   - **翻訳元 URL**: 日本語記事の URL（旧ラベル「キーワード」表示の場合あり）
   - **カテゴリ**: 「GTN Magazine 標準」を選択
4. 一覧に追加されたら **実行** ボタン
5. 進捗が Phase 1: 翻訳 → Phase 2: 校閲 → Phase 3: 修正 → 完了 と推移
6. 完了後、`article_doc_url` / `review_doc_url` が記事に紐付く
7. 「全記事」リストでそれぞれの Google Doc リンクが表示される

---

## トラブルシューティング

### `claude --version` でエラー
Claude CLI 未インストール。<https://docs.claude.com/en/docs/agents-and-tools/claude-code> 参照。

### `pip3 install` で `google-api-python-client` が見つからない
古い pip の場合: `pip3 install --upgrade pip` してから再試行。

### admin にログインできない
- DB が破損している可能性 → `rm admin/data/admin.db*` してから `yarn seed` 再実行
- パスワードハッシュが壊れている → 手順 8-B でリセット

### Drive アップロードが 403 / 404
- サービスアカウント (`report@nexus-notes-412407.iam.gserviceaccount.com`) に該当 Drive フォルダの **Editor 権限** が付与されているか確認
- フォルダ ID が正しいか確認（admin UI の設定ページで再確認）

### 翻訳ジョブが Phase 1 で止まる
- `claude` CLI が PATH に通っているか確認
- 別ターミナルで `claude -p '/translate test'` を叩いて、`/translate` スラッシュコマンドが認識されるか確認
- `.claude/commands/translate.md` がリポジトリルートに存在するか

### Claude が writer ジョブと誤認識（`03_article.md` に書く等）
- ワークスペースに古いファイルが残っている → `rm -rf admin/output/job_*` してリトライ
- 詳細は CLAUDE.md「トラブルシューティング」参照

---

## ファイル / 環境変数早見表

| 環境変数 | 用途 | 設定タイミング |
|---|---|---|
| `DASHBOARD_GDRIVE_CREDENTIALS_PATH` | runner / shell が Drive upload 時に参照 | `yarn dev` 起動前、または `run_translate.sh` 実行前 |
| `DASHBOARD_GDRIVE_ARTICLE_FOLDER_ID` | 翻訳記事の Drive フォルダ ID（env で上書き可、通常は admin UI 設定が優先） | optional |
| `DASHBOARD_GDRIVE_REVIEW_FOLDER_ID` | 校閲レポートの Drive フォルダ ID | optional |
| `DEFAULT_GDRIVE_CREDENTIALS_PATH` | `yarn seed` 時に GTN Magazine project に credentials_path を prefill | `yarn seed` 実行時のみ |
| `DASHBOARD_SECRET_KEY` | iron-session 暗号鍵（admin ログインセッション署名用） | 本番環境で必須、未設定時は起動毎に変わる |

| パス | 内容 |
|---|---|
| `/Users/akira/work/key/nexus-notes-412407-ad4455fb74b4.json` | サービスアカウント JSON（リポジトリ外、要 chmod 600） |
| `admin/data/admin.db` | better-sqlite3 の管理画面 DB（gitignore 済み） |
| `output/`, `workspace/` | ジョブごとの中間生成物（gitignore 済み） |

| Drive フォルダ ID | 用途 |
|---|---|
| `1SYXlt3mWyxclvrZG5xXtt7IZ-f8kyihc` | 翻訳作成（英訳 Google Doc 保存先） |
| `14rGRTsfjRzy1KdCV0-oke5pLxnVcjFJ7` | 翻訳校閲（校閲レポート Google Doc 保存先） |
| `1vEjiayLas4jH8RMswFlIMOnQb8h32di7` | 親フォルダ（参考、直接は使わない） |
