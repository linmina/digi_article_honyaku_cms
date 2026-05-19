#!/bin/bash
# ==============================================================================
# Digi Article Honyaku CMS - 翻訳パイプライン CLI ランナー
#
# 使い方:
#   ./run_translate.sh [--model MODEL] [--category SLUG] [--no-fix] [--db-config PATH]
#
#   --model MODEL       使用するモデル（デフォルト: claude-opus-4-6）
#   --category SLUG     カテゴリ override slug（例: gtn-magazine）
#   --no-fix            Phase 3（修正）をスキップ
#   --db-config PATH    CMS DB 設定 JSON（指定時 Phase 7 で UPSERT を実行）
#
# フロー（各記事ごと）:
#   Phase 0: 元記事 URL を fetch → source.html / source.md を workspace に staging
#   Phase 1: /translate でスラッシュコマンド起動（claude が markdown を生成）
#     - Phase 1 (翻訳) → 01_translation.md
#     - Phase 2 (校閲) → 02_review.md
#     - Phase 3 (修正) → 03_translation_fixed.md  (--no-fix の場合スキップ)
#   Phase 4: 最終 markdown を Google Drive にアップ → article_doc_url 取得
#   Phase 5: 校閲レポートを Google Drive にアップ → review_doc_url 取得
#   Phase 6: --db-config 指定時、update_article.py で CMS DB に UPSERT
# ==============================================================================

set -euo pipefail

# ===== .env 自動読み込み =====
# 同階層に .env があれば読み込む（chmod 600 推奨、.gitignore 済み）
PROJECT_DIR_EARLY="$(cd "$(dirname "$0")" && pwd)"
if [ -f "${PROJECT_DIR_EARLY}/.env" ]; then
  set -a
  # shellcheck disable=SC1090
  . "${PROJECT_DIR_EARLY}/.env"
  set +a
  echo "Loaded env from ${PROJECT_DIR_EARLY}/.env" >&2
fi

# ===== 引数パース =====
MODEL="claude-opus-4-6"
CATEGORY=""
NO_FIX=""
DB_CONFIG=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --model)      MODEL="$2"; shift 2 ;;
    --category)   CATEGORY="$2"; shift 2 ;;
    --no-fix)     NO_FIX="--no-fix"; shift ;;
    --db-config)  DB_CONFIG="$2"; shift 2 ;;
    *) echo "不明なオプション: $1" >&2; exit 1 ;;
  esac
done

# ===== 設定 =====
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
WORKSPACE_ROOT="${PROJECT_DIR}/workspace/jobs"
GDRIVE_CREDENTIALS_PATH="${DASHBOARD_GDRIVE_CREDENTIALS_PATH:-}"
GDRIVE_ARTICLE_FOLDER_ID="${DASHBOARD_GDRIVE_ARTICLE_FOLDER_ID:-}"
GDRIVE_REVIEW_FOLDER_ID="${DASHBOARD_GDRIVE_REVIEW_FOLDER_ID:-}"

# Claude CLI の共通オプション
CLAUDE_OPTS="--dangerously-skip-permissions --model ${MODEL}"

# ===== 記事リスト: "ID：日本語記事URL" の形式 =====
# 編集してください
ARTICLES=(
  # "100：https://www.gtn.co.jp/magazine/ja/article177/"
)

# ===== ヘルパー関数 =====
log() {
  echo ""
  echo "=========================================="
  echo " $1"
  echo "=========================================="
  echo ""
}

error_log() { echo "ERROR: $1" >&2; }

extract_web_link() {
  # upload_gdrive.py returns a JSON array ([{...}]) on success
  echo "$1" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    if isinstance(d, list) and d:
        print(d[0].get('web_link', ''))
    elif isinstance(d, dict):
        print(d.get('web_link', ''))
except Exception:
    pass
" 2>/dev/null || echo ""
}

# ===== 前提条件チェック =====
log "前提条件チェック"
command -v claude >/dev/null 2>&1 || { error_log "claude CLI が見つかりません"; exit 1; }
command -v python3 >/dev/null 2>&1 || { error_log "python3 が見つかりません"; exit 1; }

python3 -c "import requests, bs4, lxml" 2>/dev/null \
  || { error_log "Python 依存パッケージが不足です。pip install requests beautifulsoup4 lxml google-api-python-client google-auth"; exit 1; }

if [ -n "$GDRIVE_CREDENTIALS_PATH" ] && [ ! -f "$GDRIVE_CREDENTIALS_PATH" ]; then
  error_log "DASHBOARD_GDRIVE_CREDENTIALS_PATH のファイルが見つかりません: $GDRIVE_CREDENTIALS_PATH"
  exit 1
fi

if [ ${#ARTICLES[@]} -eq 0 ]; then
  error_log "ARTICLES 配列が空です。スクリプト先頭の ARTICLES に '<article_id>：<URL>' 形式で記事を追加してください"
  exit 1
fi

mkdir -p "${WORKSPACE_ROOT}"
echo "チェック完了"
echo "  モデル: ${MODEL}"
echo "  カテゴリ: ${CATEGORY:-(なし=汎用プロンプト)}"
echo "  修正適用: $([ -z "$NO_FIX" ] && echo 'ON' || echo 'OFF')"
echo "  Drive アップ: $([ -n "$GDRIVE_CREDENTIALS_PATH" ] && echo 'ON' || echo 'OFF')"
echo "  CMS DB 入稿: $([ -n "$DB_CONFIG" ] && echo "ON ($DB_CONFIG)" || echo 'OFF')"

# ===== メイン処理 =====
TOTAL=${#ARTICLES[@]}
SUCCESS=0
FAILED=0
RESULTS=()

for i in "${!ARTICLES[@]}"; do
  ENTRY="${ARTICLES[$i]}"
  ARTICLE_ID=$(echo "${ENTRY}" | sed 's/：.*//')
  SOURCE_URL=$(echo "${ENTRY}" | sed 's/[^：]*：//')
  NUM=$((i + 1))

  log "[${NUM}/${TOTAL}] article_id=${ARTICLE_ID}  source=${SOURCE_URL}"

  WORKSPACE="${WORKSPACE_ROOT}/job_${ARTICLE_ID}_$(date +%s)"
  mkdir -p "${WORKSPACE}"

  # ----- Phase 0: fetch + extract -----
  echo "--- Phase 0: 元記事を取得 ---"
  python3 "${PROJECT_DIR}/scripts/fetch_article.py" "${SOURCE_URL}" -o "${WORKSPACE}/source.html" \
    || { error_log "fetch 失敗"; FAILED=$((FAILED + 1)); continue; }
  python3 "${PROJECT_DIR}/scripts/extract_content.py" "${WORKSPACE}/source.html" \
    --base-url "${SOURCE_URL}" -o "${WORKSPACE}/source.md" \
    || { error_log "extract 失敗"; FAILED=$((FAILED + 1)); continue; }

  # ----- カテゴリ override 設定 -----
  if [ -n "$CATEGORY" ]; then
    CATEGORY_DIR="${PROJECT_DIR}/categories/${CATEGORY}"
    if [ -d "$CATEGORY_DIR" ]; then
      python3 -c "
import json, os
cat_dir = '$CATEGORY_DIR'
config = {}
for key, fname in [('prompt_translation', 'prompt_translation.md'), ('prompt_review', 'prompt_review.md')]:
    p = os.path.join(cat_dir, fname)
    if os.path.exists(p):
        config[key] = p
with open('${WORKSPACE}/_category_config.json', 'w') as f:
    json.dump(config, f, ensure_ascii=False, indent=2)
print(f'category override: {config}')
"
    else
      error_log "カテゴリディレクトリが見つかりません: $CATEGORY_DIR"
    fi
  fi

  # ----- _context.md (記事メタ参考情報) -----
  cat > "${WORKSPACE}/_context.md" <<EOF
# 記事メタ

- article_id: ${ARTICLE_ID}
- source_url: ${SOURCE_URL}
- category: ${CATEGORY:-(none)}
- apply_fix: $([ -z "$NO_FIX" ] && echo 'true' || echo 'false')
EOF

  # ----- Phase 1-3: スラッシュコマンド -----
  echo "--- Phase 1〜3: /translate 起動 ---"
  cd "${WORKSPACE}"
  claude -p ${CLAUDE_OPTS} "/translate ${ARTICLE_ID} --log ${NO_FIX}" 2>&1 | tail -20
  cd "${PROJECT_DIR}"

  # ----- 最終 markdown を決定 -----
  if [ -z "$NO_FIX" ] && [ -s "${WORKSPACE}/03_translation_fixed.md" ]; then
    FINAL_MD="${WORKSPACE}/03_translation_fixed.md"
  elif [ -s "${WORKSPACE}/01_translation.md" ]; then
    FINAL_MD="${WORKSPACE}/01_translation.md"
  else
    error_log "翻訳出力が見つかりません"
    FAILED=$((FAILED + 1))
    continue
  fi
  echo "最終翻訳: ${FINAL_MD}"
  REVIEW_MD="${WORKSPACE}/02_review.md"

  # ----- Phase 4-5: Google Drive アップロード（任意） -----
  ARTICLE_DOC_URL=""
  REVIEW_DOC_URL=""
  if [ -n "$GDRIVE_CREDENTIALS_PATH" ] && [ -n "$GDRIVE_ARTICLE_FOLDER_ID" ]; then
    echo "--- Phase 4: 翻訳記事を Drive にアップロード ---"
    ART_RESULT=$(python3 "${PROJECT_DIR}/scripts/upload_gdrive.py" \
      --file "${FINAL_MD}" \
      --folder-id "${GDRIVE_ARTICLE_FOLDER_ID}" \
      --credentials "${GDRIVE_CREDENTIALS_PATH}" \
      --as-doc 2>/tmp/gdrive_art.err) || cat /tmp/gdrive_art.err
    ARTICLE_DOC_URL=$(extract_web_link "${ART_RESULT}")
    echo "翻訳記事 Google Doc: ${ARTICLE_DOC_URL}"
  fi
  if [ -n "$GDRIVE_CREDENTIALS_PATH" ] && [ -n "$GDRIVE_REVIEW_FOLDER_ID" ] && [ -s "$REVIEW_MD" ]; then
    echo "--- Phase 5: 校閲レポートを Drive にアップロード ---"
    REV_RESULT=$(python3 "${PROJECT_DIR}/scripts/upload_gdrive.py" \
      --file "${REVIEW_MD}" \
      --folder-id "${GDRIVE_REVIEW_FOLDER_ID}" \
      --credentials "${GDRIVE_CREDENTIALS_PATH}" \
      --as-doc 2>/tmp/gdrive_rev.err) || cat /tmp/gdrive_rev.err
    REVIEW_DOC_URL=$(extract_web_link "${REV_RESULT}")
    echo "校閲レポート Google Doc: ${REVIEW_DOC_URL}"
  fi

  # ----- Phase 6: CMS DB UPSERT（任意） -----
  if [ -n "$DB_CONFIG" ]; then
    echo "--- Phase 6: CMS DB へ UPSERT (dry-run) ---"
    # title / description / content / memo を 翻訳 markdown から抽出してUPSERT
    # 詳細は scripts/update_article.py の --json-file を参照
    MEMO_TEXT="記事Google Doc: ${ARTICLE_DOC_URL}"
    if [ -n "$REVIEW_DOC_URL" ]; then
      MEMO_TEXT="${MEMO_TEXT}
校閲Google Doc: ${REVIEW_DOC_URL}"
    fi
    # JSON 生成: title / description / content を MD から推測
    UPLOAD_JSON="${WORKSPACE}/upload_payload.json"
    python3 -c "
import json, re
md = open('${FINAL_MD}').read()
# meta description from <!-- meta description: ... -->
m = re.search(r'<!--\s*meta description:\s*(.+?)\s*-->', md)
description = m.group(1) if m else ''
# title from first '# '
m = re.search(r'^# (.+)$', md, re.MULTILINE)
title = m.group(1) if m else ''
# content = markdown sans the first line meta comment + the # title line
content = re.sub(r'<!--.*?-->\n?', '', md, count=1)
content = re.sub(r'^# .+\n', '', content, count=1).strip()
out = {
  'title': title,
  'description': description,
  'content': content,
  'memo': '''${MEMO_TEXT}''',
  'publish': True,
}
with open('${UPLOAD_JSON}', 'w', encoding='utf-8') as f:
  json.dump(out, f, ensure_ascii=False, indent=2)
print(f'upload payload: {UPLOAD_JSON} (title=\"{title[:40]}...\")')
"
    python3 "${PROJECT_DIR}/scripts/update_article.py" \
      --db-config "${DB_CONFIG}" \
      --id "${ARTICLE_ID}" \
      --json-file "${UPLOAD_JSON}"
  fi

  SUCCESS=$((SUCCESS + 1))
  RESULTS+=("article_id=${ARTICLE_ID}  final=${FINAL_MD}  doc=${ARTICLE_DOC_URL}")
done

# ===== 結果サマリ =====
log "処理完了サマリ"
echo "合計: ${TOTAL} 記事"
echo "成功: ${SUCCESS}"
echo "失敗: ${FAILED}"
echo ""
echo "--- 成果物 ---"
for r in "${RESULTS[@]}"; do echo "  ${r}"; done
