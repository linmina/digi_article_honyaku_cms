"""
upload_gdrive.py - Google Drive にファイルをアップロードするツール

`--text-images` を指定すると、`.md` 入力中の `![alt](url)` を
`🖼 [filename | alt](url)` のテキストリンクに置換してからアップする。
Google Doc 変換時に画像が原寸で埋め込まれてレイアウトが崩れるのを回避する。
原本ファイルは触らず、一時ファイル経由でアップロードする。
"""
from __future__ import annotations  # Python 3.9 で PEP 604 `X | Y` を有効化

import argparse
import json
import re
import sys
import tempfile
from pathlib import Path
from urllib.parse import urlparse


_IMG_PATTERN = re.compile(r'!\[([^\]]*)\]\(([^)]+)\)')


def _filename_from_url(url: str) -> str:
    """画像URLからファイル名を抽出（クエリ・パラメータを除去）。"""
    path = urlparse(url).path
    name = path.rsplit("/", 1)[-1]
    return name or "image"


def transform_images_to_text_links(md_text: str) -> str:
    """`![alt](url)` を `🖼 [filename | alt](url)` に置換。

    Google Doc 変換時に原寸の画像が貼られて 1 ページ占有するのを回避する。
    変換後はテキストリンクなので Doc 上の縦伸びを抑えられ、URL クリックで
    原画像を確認できる。
    """
    def _replace(m: re.Match) -> str:
        alt = (m.group(1) or "").strip()
        url = m.group(2).strip()
        filename = _filename_from_url(url)
        label = f"{filename} | {alt}" if alt else filename
        return f"🖼 [{label}]({url})"

    return _IMG_PATTERN.sub(_replace, md_text)


def _maybe_preprocess(
    file_path: Path, text_images: bool
) -> tuple[Path, bool]:
    """`text_images=True` かつ .md なら preprocess したテンポラリを返す。

    Returns (effective_path, is_temp). is_temp=True なら呼出側が後で削除する。
    """
    if not text_images or file_path.suffix.lower() != ".md":
        return file_path, False
    transformed = transform_images_to_text_links(
        file_path.read_text(encoding="utf-8")
    )
    tmp = tempfile.NamedTemporaryFile(
        mode="w",
        suffix=".md",
        prefix=f"{file_path.stem}_drive_",
        delete=False,
        encoding="utf-8",
    )
    tmp.write(transformed)
    tmp.close()
    return Path(tmp.name), True


def upload_file(
    file_path: str,
    folder_id: str,
    credentials_path: str,
    mime_type: str | None = None,
    as_doc: bool = False,
    text_images: bool = False,
) -> dict:
    """ファイルを Google Drive の指定フォルダにアップロードする。

    `text_images=True` で .md の画像埋め込みをテキストリンクに置換。
    """
    try:
        from google.oauth2 import service_account
        from googleapiclient.discovery import build
        from googleapiclient.http import MediaFileUpload
    except ImportError:
        return {
            "error": (
                "google-api-python-client, google-auth が必要です。"
                "pip install google-api-python-client google-auth"
            )
        }

    src_path = Path(file_path)
    if not src_path.exists():
        return {"error": f"ファイルが見つかりません: {file_path}"}

    effective_path, is_temp = _maybe_preprocess(src_path, text_images)
    try:
        if mime_type is None:
            suffix = src_path.suffix.lower()
            mime_map = {
                ".md": "text/markdown",
                ".json": "application/json",
                ".csv": "text/csv",
                ".txt": "text/plain",
                ".pdf": "application/pdf",
                ".docx": (
                    "application/vnd.openxmlformats-officedocument."
                    "wordprocessingml.document"
                ),
            }
            mime_type = mime_map.get(suffix, "application/octet-stream")

        try:
            creds = service_account.Credentials.from_service_account_file(
                credentials_path,
                scopes=["https://www.googleapis.com/auth/drive"],
            )
            service = build("drive", "v3", credentials=creds)

            file_metadata: dict = {
                "name": src_path.name,  # original filename, not the temp path
                "parents": [folder_id],
            }
            if as_doc:
                file_metadata["mimeType"] = "application/vnd.google-apps.document"
            media = MediaFileUpload(str(effective_path), mimetype=mime_type)

            uploaded = (
                service.files()
                .create(
                    body=file_metadata,
                    media_body=media,
                    fields="id, name, webViewLink",
                    supportsAllDrives=True,
                )
                .execute()
            )

            return {
                "status": "success",
                "file_id": uploaded.get("id"),
                "file_name": uploaded.get("name"),
                "web_link": uploaded.get("webViewLink"),
            }
        except Exception as e:
            return {"error": f"アップロードエラー: {e}"}
    finally:
        if is_temp:
            try:
                effective_path.unlink()
            except OSError:
                pass


def upload_multiple(
    file_paths: list,
    folder_id: str,
    credentials_path: str,
    as_doc: bool = False,
    text_images: bool = False,
) -> list:
    """複数ファイルをアップロード。"""
    results = []
    for fp in file_paths:
        result = upload_file(
            fp,
            folder_id,
            credentials_path,
            as_doc=as_doc,
            text_images=text_images,
        )
        results.append(result)
        status = "OK" if result.get("status") == "success" else "FAIL"
        print(f"  [{status}] {Path(fp).name}", file=sys.stderr)
    return results


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Google Drive ファイルアップロード")
    parser.add_argument(
        "--file", required=True, nargs="+", help="アップロードするファイルパス"
    )
    parser.add_argument("--folder-id", required=True, help="Google Drive フォルダ ID")
    parser.add_argument(
        "--credentials", required=True, help="サービスアカウント JSON 鍵ファイルパス"
    )
    parser.add_argument(
        "--as-doc",
        action="store_true",
        help="Google Docs として変換アップロード",
    )
    parser.add_argument(
        "--text-images",
        action="store_true",
        help=(
            "`.md` 入力中の `![alt](url)` を `🖼 [filename | alt](url)` の"
            "テキストリンクに変換してからアップ。Doc 化時のレイアウト崩れ回避用。"
        ),
    )
    args = parser.parse_args()

    results = upload_multiple(
        args.file,
        args.folder_id,
        args.credentials,
        as_doc=args.as_doc,
        text_images=args.text_images,
    )
    print(json.dumps(results, ensure_ascii=False, indent=2))

    has_error = any(r.get("error") for r in results)
    sys.exit(1 if has_error else 0)
