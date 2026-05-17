"""
記事更新スクリプト
DB設定は外部JSONファイルで管理し、--db-config で指定する。

使い方:
  python3 scripts/update_article.py --db-config config/db.json --id 226 --json-file output/article_226.json
  python3 scripts/update_article.py --db-config config/db.json --id 226 --json-file output/article_226.json --dry-run

オプション:
  --db-config       DB設定JSONファイルパス（必須）
  --id              記事ID（必須）
  --title           タイトル
  --description     ディスクリプション
  --content         コンテンツHTML
  --content-file    コンテンツHTMLファイルパス
  --memo            メモ
  --publish         公開状態にする
  --unpublish       非公開状態にする
  --type-page       タイプ=ページ
  --type-section    タイプ=セクション
  --json            JSON文字列で一括指定
  --json-file       JSONファイルで一括指定
  --dry-run         実行内容の表示のみ
"""
import argparse
import json
import sys
import pymysql


def load_db_config(config_path):
    """DB設定JSONファイルを読み込む"""
    with open(config_path, 'r', encoding='utf-8') as f:
        config = json.load(f)

    conn = config.get('connection', {})
    db_config = {
        'host': conn.get('host', ''),
        'user': conn.get('user', ''),
        'password': conn.get('password', ''),
        'database': conn.get('database', ''),
        'port': int(conn.get('port', 3306)),
        'charset': conn.get('charset', 'utf8mb4'),
    }
    tag_ids = config.get('tag_ids', {})
    tag_values = config.get('tag_values', {})
    sql = config.get('sql', {})

    tag_names = {}
    for key, tid in tag_ids.items():
        tag_names[int(tid)] = key

    return db_config, tag_ids, tag_values, sql, tag_names


def build_fields(args, tag_ids, tag_values):
    """引数から更新フィールドリストを構築する"""
    fields = []

    json_data = None
    if args.json:
        json_data = json.loads(args.json)
    elif args.json_file:
        with open(args.json_file, 'r', encoding='utf-8') as f:
            json_data = json.load(f)

    if json_data:
        if 'title' in json_data and 'title' in tag_ids:
            fields.append((int(tag_ids['title']), json_data['title']))
        if 'description' in json_data and 'description' in tag_ids:
            desc = json_data['description']
            if not desc.strip().startswith('<p>'):
                desc = f'<p>{desc}</p>'
            fields.append((int(tag_ids['description']), desc))
        if 'content' in json_data and 'content' in tag_ids:
            fields.append((int(tag_ids['content']), json_data['content']))
        if 'memo' in json_data and 'memo' in tag_ids:
            fields.append((int(tag_ids['memo']), json_data['memo']))
        if json_data.get('publish') is True:
            if 'publish_flag' in tag_ids and 'publish_open' in tag_values:
                fields.append((int(tag_ids['publish_flag']), str(tag_values['publish_open'])))
            if 'type' in tag_ids and 'type_page' in tag_values:
                fields.append((int(tag_ids['type']), str(tag_values['type_page'])))
        return fields

    if args.title and 'title' in tag_ids:
        fields.append((int(tag_ids['title']), args.title))
    if args.description and 'description' in tag_ids:
        desc = args.description
        if not desc.strip().startswith('<p>'):
            desc = f'<p>{desc}</p>'
        fields.append((int(tag_ids['description']), desc))
    if args.content and 'content' in tag_ids:
        fields.append((int(tag_ids['content']), args.content))
    elif args.content_file and 'content' in tag_ids:
        with open(args.content_file, 'r', encoding='utf-8') as f:
            fields.append((int(tag_ids['content']), f.read()))
    if args.memo and 'memo' in tag_ids:
        fields.append((int(tag_ids['memo']), args.memo))
    if args.publish and 'publish_flag' in tag_ids and 'publish_open' in tag_values:
        fields.append((int(tag_ids['publish_flag']), str(tag_values['publish_open'])))
    elif args.unpublish and 'publish_flag' in tag_ids and 'publish_close' in tag_values:
        fields.append((int(tag_ids['publish_flag']), str(tag_values['publish_close'])))
    if args.type_page and 'type' in tag_ids and 'type_page' in tag_values:
        fields.append((int(tag_ids['type']), str(tag_values['type_page'])))
    elif args.type_section and 'type' in tag_ids and 'type_section' in tag_values:
        fields.append((int(tag_ids['type']), str(tag_values['type_section'])))

    return fields


def update_article(article_id, fields, db_config, sql, tag_names, dry_run=False):
    """記事フィールドを更新する"""
    conn = pymysql.connect(**db_config)
    try:
        with conn.cursor() as cur:
            cur.execute(sql['check_article'], (article_id,))
            article = cur.fetchone()
            if not article:
                print(f"エラー: 記事ID {article_id} が見つかりません")
                return False
            print(f"対象記事: id={article[0]}, name=\"{article[1]}\", depth={article[2]}")
            print()

            if not fields:
                print("更新するフィールドがありません")
                return False

            print(f"更新フィールド ({len(fields)}件):")
            for tag_id, value in fields:
                name = tag_names.get(tag_id, f'tagId={tag_id}')
                preview = value[:80] + '...' if len(value) > 80 else value
                print(f"  {name} (tagId={tag_id}): {preview}")
            print()

            if dry_run:
                print("[dry-run] 実際の更新はスキップされました")
                return True

            for tag_id, value in fields:
                cur.execute(sql['upsert'], (article_id, tag_id, value))
            conn.commit()
            print(f"記事 {article_id} の更新が完了しました")

        with conn.cursor() as cur:
            cur.execute(sql['verify'], (article_id,))
            rows = cur.fetchall()
            print(f"\n--- 確認 (itemId={article_id}) ---")
            for row in rows:
                name = tag_names.get(row[1], f'tagId={row[1]}')
                print(f"  {name} (tagId={row[1]}): {row[2]}  [{row[3]}]")

        return True
    except Exception as e:
        print(f"エラー: {e}")
        conn.rollback()
        return False
    finally:
        conn.close()


def main():
    parser = argparse.ArgumentParser(description='記事更新スクリプト')
    parser.add_argument('--db-config', type=str, required=True, help='DB設定JSONファイルパス（必須）')
    parser.add_argument('--id', type=int, required=True, help='記事ID')
    parser.add_argument('--title', type=str, help='タイトル')
    parser.add_argument('--description', type=str, help='ディスクリプション')
    parser.add_argument('--content', type=str, help='コンテンツHTML')
    parser.add_argument('--content-file', type=str, help='コンテンツHTMLファイルパス')
    parser.add_argument('--memo', type=str, help='メモ')
    parser.add_argument('--publish', action='store_true', help='公開状態にする')
    parser.add_argument('--unpublish', action='store_true', help='非公開状態にする')
    parser.add_argument('--type-page', action='store_true', help='タイプ=ページ')
    parser.add_argument('--type-section', action='store_true', help='タイプ=セクション')
    parser.add_argument('--json', type=str, help='JSON文字列で一括指定')
    parser.add_argument('--json-file', type=str, help='JSONファイルで一括指定')
    parser.add_argument('--dry-run', action='store_true', help='実行内容の表示のみ')

    args = parser.parse_args()
    db_config, tag_ids, tag_values, sql, tag_names = load_db_config(args.db_config)

    print(f"DB設定: {args.db_config}")
    print(f"  接続先: {db_config['host']}:{db_config['port']}/{db_config['database']}")
    print()

    fields = build_fields(args, tag_ids, tag_values)
    success = update_article(args.id, fields, db_config, sql, tag_names, dry_run=args.dry_run)
    sys.exit(0 if success else 1)


if __name__ == '__main__':
    main()
