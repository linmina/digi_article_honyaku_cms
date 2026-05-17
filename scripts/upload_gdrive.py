"""
upload_gdrive.py - Google Driveにファイルをアップロードするツール
"""
import sys
import json
import argparse
from pathlib import Path


def upload_file(file_path: str, folder_id: str, credentials_path: str, mime_type: str = None, as_doc: bool = False) -> dict:
    """ファイルをGoogle Driveの指定フォルダにアップロードする"""
    try:
        from google.oauth2 import service_account
        from googleapiclient.discovery import build
        from googleapiclient.http import MediaFileUpload
    except ImportError:
        return {"error": "google-api-python-client, google-auth が必要です。pip install google-api-python-client google-auth"}

    filepath = Path(file_path)
    if not filepath.exists():
        return {"error": f"ファイルが見つかりません: {file_path}"}

    if mime_type is None:
        suffix = filepath.suffix.lower()
        mime_map = {
            ".md": "text/markdown",
            ".json": "application/json",
            ".csv": "text/csv",
            ".txt": "text/plain",
            ".pdf": "application/pdf",
            ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        }
        mime_type = mime_map.get(suffix, "application/octet-stream")

    try:
        creds = service_account.Credentials.from_service_account_file(
            credentials_path,
            scopes=["https://www.googleapis.com/auth/drive"]
        )
        service = build("drive", "v3", credentials=creds)

        file_metadata = {
            "name": filepath.name,
            "parents": [folder_id],
        }
        if as_doc:
            file_metadata["mimeType"] = "application/vnd.google-apps.document"
        media = MediaFileUpload(str(filepath), mimetype=mime_type)

        uploaded = service.files().create(
            body=file_metadata,
            media_body=media,
            fields="id, name, webViewLink",
            supportsAllDrives=True
        ).execute()

        return {
            "status": "success",
            "file_id": uploaded.get("id"),
            "file_name": uploaded.get("name"),
            "web_link": uploaded.get("webViewLink"),
        }
    except Exception as e:
        return {"error": f"アップロードエラー: {str(e)}"}


def upload_multiple(file_paths: list, folder_id: str, credentials_path: str, as_doc: bool = False) -> list:
    """複数ファイルをアップロードする"""
    results = []
    for fp in file_paths:
        result = upload_file(fp, folder_id, credentials_path, as_doc=as_doc)
        results.append(result)
        status = "OK" if result.get("status") == "success" else "FAIL"
        print(f"  [{status}] {Path(fp).name}", file=sys.stderr)
    return results


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Google Driveファイルアップロード")
    parser.add_argument("--file", required=True, nargs="+", help="アップロードするファイルパス")
    parser.add_argument("--folder-id", required=True, help="Google DriveフォルダID")
    parser.add_argument("--credentials", required=True, help="サービスアカウントJSON鍵ファイルパス")
    parser.add_argument("--as-doc", action="store_true", help="Google Docsとして変換アップロード")
    args = parser.parse_args()

    results = upload_multiple(args.file, args.folder_id, args.credentials, as_doc=args.as_doc)
    print(json.dumps(results, ensure_ascii=False, indent=2))

    has_error = any(r.get("error") for r in results)
    sys.exit(1 if has_error else 0)
