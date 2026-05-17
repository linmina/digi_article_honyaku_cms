"""
download_spreadsheet.py - スプレッドシート設定からデータをダウンロードするツール

管理画面のDBからプロジェクトのスプレッドシート設定を読み取り、
Google Sheets APIでデータを取得してCSVまたはExcel(.xlsx)として保存する。
"""
import sys
import csv
import io
import argparse
import sqlite3
from pathlib import Path


def get_project(db_path: str, project_id: int) -> dict:
    """DBからプロジェクト設定を取得"""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    row = conn.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()
    conn.close()
    if not row:
        raise ValueError(f"プロジェクトID {project_id} が見つかりません")
    return dict(row)


def extract_spreadsheet_id(url: str) -> str:
    """スプレッドシートURLからIDを抽出"""
    import re
    match = re.search(r"/spreadsheets/d/([a-zA-Z0-9_-]+)", url)
    if not match:
        raise ValueError(f"無効なスプレッドシートURL: {url}")
    return match.group(1)


def column_index_to_letter(index: int) -> str:
    """カラムインデックス(0始まり)をアルファベットに変換"""
    letter = ""
    i = index
    while i >= 0:
        letter = chr(65 + (i % 26)) + letter
        i = i // 26 - 1
    return letter


def download_sheet_data(credentials_path: str, spreadsheet_url: str, sheet_name: str = "") -> list:
    """Google Sheets APIでスプレッドシートデータを取得"""
    try:
        from google.oauth2 import service_account
        from googleapiclient.discovery import build
    except ImportError:
        print("エラー: google-api-python-client, google-auth が必要です", file=sys.stderr)
        print("  pip install google-api-python-client google-auth", file=sys.stderr)
        sys.exit(1)

    spreadsheet_id = extract_spreadsheet_id(spreadsheet_url)

    creds_path = Path(credentials_path)
    if not creds_path.is_absolute():
        creds_path = Path(__file__).resolve().parent.parent / credentials_path

    creds = service_account.Credentials.from_service_account_file(
        str(creds_path),
        scopes=["https://www.googleapis.com/auth/spreadsheets.readonly"],
    )
    service = build("sheets", "v4", credentials=creds)

    sheet_title = sheet_name or "Sheet1"

    # Step 1: ヘッダー行のみ取得してカラム範囲を特定
    header_res = service.spreadsheets().values().get(
        spreadsheetId=spreadsheet_id,
        range=f"'{sheet_title}'!1:1",
        valueRenderOption="UNFORMATTED_VALUE",
    ).execute()

    headers = header_res.get("values", [[]])[0]
    if not headers:
        return []

    # Step 2: ヘッダーカラム分だけデータ取得（余分な列を避ける）
    last_col = column_index_to_letter(len(headers) - 1)
    data_range = f"'{sheet_title}'!A:{last_col}"

    response = service.spreadsheets().values().get(
        spreadsheetId=spreadsheet_id,
        range=data_range,
        valueRenderOption="UNFORMATTED_VALUE",
    ).execute()

    values = response.get("values", [])
    if len(values) <= 1:
        return values

    # ヘッダー + 空でない行のみ保持
    header = values[0]
    filtered = [
        row for row in values[1:]
        if any(str(cell).strip() for cell in row if cell is not None)
    ]
    return [header] + filtered


def save_as_csv(data: list, output_path: str):
    """データをCSVファイルとして保存"""
    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)

    with open(output, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        for row in data:
            writer.writerow(row)


def save_as_excel(data: list, output_path: str):
    """データをExcel(.xlsx)ファイルとして保存"""
    try:
        import openpyxl
    except ImportError:
        print("エラー: openpyxl が必要です", file=sys.stderr)
        print("  pip install openpyxl", file=sys.stderr)
        sys.exit(1)

    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Sheet1"

    for row in data:
        ws.append([str(cell) if cell is not None else "" for cell in row])

    # ヘッダー行を太字にする
    if data:
        from openpyxl.styles import Font
        for cell in ws[1]:
            cell.font = Font(bold=True)

    wb.save(str(output))
    wb.close()


def main():
    parser = argparse.ArgumentParser(description="スプレッドシート設定からデータダウンロード")
    parser.add_argument("--project-id", type=int, required=True, help="プロジェクトID")
    parser.add_argument("--db-path", default=None, help="admin.dbのパス (デフォルト: admin/data/admin.db)")
    parser.add_argument("--output", default=None, help="出力ファイルパス (デフォルト: admin/data/csv/{project_id}.xlsx)")
    parser.add_argument("--format", choices=["xlsx", "csv"], default="xlsx", help="出力形式 (デフォルト: xlsx)")
    args = parser.parse_args()

    base_dir = Path(__file__).resolve().parent.parent
    db_path = args.db_path or str(base_dir / "admin" / "data" / "admin.db")
    ext = args.format
    output_path = args.output or str(base_dir / "admin" / "data" / "csv" / f"{args.project_id}.{ext}")

    # DB からプロジェクト設定を取得
    print(f"プロジェクト {args.project_id} の設定を読み込み中...", file=sys.stderr)
    project = get_project(db_path, args.project_id)

    spreadsheet_url = project.get("spreadsheet_url", "")
    sheet_name = project.get("spreadsheet_sheet_name", "")
    credentials_path = project.get("credentials_path", "")

    if not spreadsheet_url:
        print("エラー: スプレッドシートURLが設定されていません", file=sys.stderr)
        sys.exit(1)
    if not credentials_path:
        print("エラー: 認証ファイルパスが設定されていません", file=sys.stderr)
        sys.exit(1)

    print(f"  スプレッドシートURL: {spreadsheet_url}", file=sys.stderr)
    print(f"  シート名: {sheet_name or 'Sheet1'}", file=sys.stderr)
    print(f"  認証ファイル: {credentials_path}", file=sys.stderr)

    # スプレッドシートからデータ取得
    print("スプレッドシートをダウンロード中...", file=sys.stderr)
    data = download_sheet_data(credentials_path, spreadsheet_url, sheet_name)

    if not data:
        print("データが空です", file=sys.stderr)
        sys.exit(0)

    headers = data[0]
    row_count = len(data) - 1
    print(f"  {row_count}行 x {len(headers)}列 取得完了", file=sys.stderr)

    # 保存
    if args.format == "xlsx":
        save_as_excel(data, output_path)
        print(f"Excel保存完了: {output_path}", file=sys.stderr)
    else:
        save_as_csv(data, output_path)
        print(f"CSV保存完了: {output_path}", file=sys.stderr)
    print(output_path)


if __name__ == "__main__":
    main()
