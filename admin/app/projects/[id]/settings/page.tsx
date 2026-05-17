'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import AuthLayout from '@/components/AuthLayout';
import ProjectNav from '@/components/ProjectNav';

export default function ProjectSettingsPage() {
  const { id } = useParams();
  const router = useRouter();
  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // CSV / column mapping
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvExists, setCsvExists] = useState(false);
  const [csvLastUpdated, setCsvLastUpdated] = useState('');
  const [csvRowCount, setCsvRowCount] = useState(0);
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [downloading, setDownloading] = useState(false);
  const [savingColumns, setSavingColumns] = useState(false);
  const [columnSuccess, setColumnSuccess] = useState('');

  useEffect(() => {
    fetch(`/api/projects/${id}`)
      .then((r) => r.json())
      .then((d) => {
        setProject(d.project);
        // Parse existing display columns
        const cols = (d.project?.spreadsheet_display_columns || '').split(',').map((c: string) => c.trim()).filter(Boolean);
        setSelectedColumns(cols);
      })
      .finally(() => setLoading(false));
  }, [id]);

  // Load CSV info
  function loadCsvInfo() {
    fetch(`/api/projects/${id}/spreadsheet`)
      .then((r) => r.json())
      .then((d) => {
        if (d.headers) {
          setCsvHeaders(d.headers);
          setCsvRowCount(d.rows?.length || 0);
        }
        setCsvExists(!!d.csvExists);
        if (d.lastUpdated) setCsvLastUpdated(d.lastUpdated);
      })
      .catch(() => {});
  }

  useEffect(() => {
    if (project) {
      loadCsvInfo();
    }
  }, [project, id]);

  async function handleDownloadCsv() {
    setDownloading(true);
    setError('');
    try {
      const res = await fetch(`/api/projects/${id}/spreadsheet`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCsvHeaders(data.headers || []);
      setCsvExists(true);
      setCsvLastUpdated(new Date().toISOString());
      setSuccess(`CSVダウンロード完了 (${data.rowCount}行)`);
      loadCsvInfo();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setDownloading(false);
    }
  }

  function toggleColumn(col: string) {
    setSelectedColumns((prev) =>
      prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col]
    );
    setColumnSuccess('');
  }

  async function handleSaveColumns() {
    setSavingColumns(true);
    setColumnSuccess('');
    setError('');
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...project,
          spreadsheet_display_columns: selectedColumns.join(','),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setColumnSuccess('カラム設定を保存しました');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSavingColumns(false);
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');

    const form = new FormData(e.currentTarget);
    const body: Record<string, any> = {};
    form.forEach((v, k) => {
      body[k] = (k === 'db_port' || k.startsWith('db_tag_')) ? parseInt(v as string) || 0 : v;
    });
    // Override display columns with checkbox selection
    body.spreadsheet_display_columns = selectedColumns.join(',');

    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuccess(data.warning ? `保存しました（${data.warning}）` : '保存しました');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm('このプロジェクトを削除しますか？関連する記事もすべて削除されます。')) return;
    await fetch(`/api/projects/${id}`, { method: 'DELETE' });
    router.push('/projects');
  }

  if (loading) return <AuthLayout><p className="text-gray-500">読み込み中...</p></AuthLayout>;
  if (!project) return <AuthLayout><p className="text-red-500">Not found</p></AuthLayout>;

  return (
    <AuthLayout>
      <div className="max-w-3xl">
        <ProjectNav projectId={id as string} projectName={project.name} />

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && <div className="bg-red-50 text-red-600 p-3 rounded text-sm">{error}</div>}
          {success && <div className="bg-green-50 text-green-600 p-3 rounded text-sm">{success}</div>}

          <Section title="基本情報">
            <Field label="プロジェクト名" name="name" defaultValue={project.name} required />
            <Field label="説明" name="description" defaultValue={project.description} textarea />
          </Section>

          <Section title="プロジェクトパス">
            <Field
              label="リポジトリパス"
              name="project_path"
              defaultValue={project.project_path}
              placeholder="例: /Users/akira/work/git/digi_article_honyaku_cms"
            />
            <p className="text-xs text-gray-500 -mt-2 mb-1">runner が scripts/ や prompts/ を参照するために必要（このリポジトリの絶対パス）</p>
          </Section>

          <Section title="CMS設定">
            <Field label="管理画面ベースURL" name="cms_base_url" defaultValue={project.cms_base_url} />
            <Field label="プレビューURLパターン" name="preview_url_pattern" defaultValue={project.preview_url_pattern} placeholder="https://preview.example.com/magazine/ja/article{id}/" />
            <Field label="公開URLパターン" name="public_url_pattern" defaultValue={project.public_url_pattern} placeholder="https://www.example.com/magazine/ja/article{id}/" />
            <p className="text-xs text-gray-500 -mt-2 mb-1">{'{id}'} が記事IDに置換されます</p>
          </Section>

          <Section title="DB設定">
            <Field label="DB設定JSONの保存先パス" name="db_config_path" defaultValue={project.db_config_path} placeholder="config/db.json" />
            <p className="text-xs text-gray-500 -mt-2 mb-3">保存時にこのパスへDB設定JSONが書き出されます。空欄の場合は書き出しません。</p>
            <h4 className="text-sm font-semibold mt-4 mb-2 text-gray-700">接続情報</h4>
            <div className="grid grid-cols-2 gap-4">
              <Field label="ホスト" name="db_host" defaultValue={project.db_host} />
              <Field label="ポート" name="db_port" type="number" defaultValue={project.db_port} />
              <Field label="データベース名" name="db_name" defaultValue={project.db_name} />
              <Field label="ユーザー" name="db_user" defaultValue={project.db_user} />
            </div>
            <Field label="パスワード" name="db_password" type="password" defaultValue={project.db_password} />
            <h4 className="text-sm font-semibold mt-6 mb-2 text-gray-700">tagIdマッピング</h4>
            <div className="grid grid-cols-3 gap-4">
              <Field label="タイトル" name="db_tag_title" type="number" defaultValue={project.db_tag_title ?? 26} />
              <Field label="ディスクリプション" name="db_tag_description" type="number" defaultValue={project.db_tag_description ?? 27} />
              <Field label="コンテンツ" name="db_tag_content" type="number" defaultValue={project.db_tag_content ?? 29} />
              <Field label="メモ" name="db_tag_memo" type="number" defaultValue={project.db_tag_memo ?? 51} />
              <Field label="公開フラグ" name="db_tag_publish_flag" type="number" defaultValue={project.db_tag_publish_flag ?? 23} />
              <Field label="タイプ" name="db_tag_type" type="number" defaultValue={project.db_tag_type ?? 5} />
            </div>
            <h4 className="text-sm font-semibold mt-6 mb-2 text-gray-700">タグ値</h4>
            <div className="grid grid-cols-2 gap-4">
              <Field label="公開" name="db_val_publish_open" defaultValue={project.db_val_publish_open || '24'} />
              <Field label="非公開" name="db_val_publish_close" defaultValue={project.db_val_publish_close || '25'} />
              <Field label="ページ" name="db_val_type_page" defaultValue={project.db_val_type_page || '6'} />
              <Field label="セクション" name="db_val_type_section" defaultValue={project.db_val_type_section || '7'} />
            </div>
            <h4 className="text-sm font-semibold mt-6 mb-2 text-gray-700">テーブル名</h4>
            <Field label="記事テーブル名" name="db_table_name" defaultValue={project.db_table_name || 'gtnArticles'} placeholder="gtnArticles" />
            <p className="text-xs text-gray-500 -mt-2 mb-1">SQLは自動生成されます。タグテーブルは「テーブル名+Tag」（例: gtnArticlesTag）が使用されます。</p>
          </Section>

          <Section title="Google Drive設定">
            <Field
              label="翻訳作成 フォルダID"
              name="article_folder_id"
              defaultValue={project.article_folder_id}
              placeholder="例: 1SYXlt3mWyxclvrZG5xXtt7IZ-f8kyihc"
            />
            <p className="text-xs text-gray-500 -mt-2 mb-1">翻訳済み英訳記事 (Phase 1 / Phase 3 の最終 Markdown) の Google Doc 保存先</p>
            <Field
              label="翻訳校閲 フォルダID"
              name="review_folder_id"
              defaultValue={project.review_folder_id || project.factcheck_folder_id}
              placeholder="例: 14rGRTsfjRzy1KdCV0-oke5pLxnVcjFJ7"
            />
            <p className="text-xs text-gray-500 -mt-2 mb-1">校閲レポート (Phase 2) の Google Doc 保存先</p>
            <Field
              label="認証ファイルパス"
              name="credentials_path"
              defaultValue={project.credentials_path}
              placeholder="/path/to/service-account.json"
            />
            <p className="text-xs text-gray-500 -mt-2 mb-1">Google サービスアカウント JSON 鍵ファイル（環境変数 DASHBOARD_GDRIVE_CREDENTIALS_PATH でも上書き可）</p>
          </Section>

          <Section title="Claude設定">
            <Field label="モデル" name="claude_model" defaultValue={project.claude_model} />
          </Section>

          <Section title="スプレッドシート設定">
            <Field label="スプレッドシートURL" name="spreadsheet_url" defaultValue={project.spreadsheet_url} placeholder="https://docs.google.com/spreadsheets/d/xxxxx/edit" />
            <Field label="シート名" name="spreadsheet_sheet_name" defaultValue={project.spreadsheet_sheet_name} placeholder="Sheet1（空欄でデフォルトシート）" />
            <Field label="ID列（ヘッダー名またはA,B,C...）" name="spreadsheet_id_column" defaultValue={project.spreadsheet_id_column || 'A'} placeholder="A" />

            {/* CSV Download */}
            <div className="mt-4 p-4 bg-gray-50 rounded border">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h4 className="text-sm font-semibold">CSVデータ</h4>
                  {csvExists ? (
                    <p className="text-xs text-gray-500 mt-1">
                      {csvRowCount}行 / 最終更新: {csvLastUpdated ? new Date(csvLastUpdated).toLocaleString('ja-JP') : '-'}
                    </p>
                  ) : (
                    <p className="text-xs text-gray-500 mt-1">まだダウンロードされていません</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleDownloadCsv}
                  disabled={downloading || !project.spreadsheet_url}
                  className="bg-purple-600 text-white px-4 py-1.5 rounded text-sm hover:bg-purple-700 disabled:opacity-50"
                >
                  {downloading ? 'ダウンロード中...' : csvExists ? 'CSV再ダウンロード' : 'CSVダウンロード'}
                </button>
              </div>

              {/* Column Mapping */}
              {csvHeaders.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-2 pt-3 border-t">記事一覧に表示するカラム</h4>
                  <p className="text-xs text-gray-500 mb-3">チェックしたカラムが記事一覧テーブルに表示されます</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {csvHeaders.map((header) => (
                      <label
                        key={header}
                        className={`flex items-center gap-2 text-sm px-3 py-2 rounded border cursor-pointer transition ${
                          selectedColumns.includes(header)
                            ? 'bg-purple-50 border-purple-300 text-purple-700'
                            : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedColumns.includes(header)}
                          onChange={() => toggleColumn(header)}
                          className="rounded text-purple-600"
                        />
                        <span className="truncate">{header}</span>
                      </label>
                    ))}
                  </div>
                  <div className="flex items-center gap-3 mt-3">
                    <button
                      type="button"
                      onClick={handleSaveColumns}
                      disabled={savingColumns}
                      className="bg-purple-600 text-white px-4 py-1.5 rounded text-sm hover:bg-purple-700 disabled:opacity-50"
                    >
                      {savingColumns ? '保存中...' : 'カラム設定を保存'}
                    </button>
                    {columnSuccess && <span className="text-xs text-green-600">{columnSuccess}</span>}
                  </div>
                </div>
              )}
              {csvExists && (
                <Link
                  href={`/projects/${id}/spreadsheet`}
                  className="inline-block mt-2 text-sm text-purple-600 hover:text-purple-800 hover:underline"
                >
                  データプレビューを開く →
                </Link>
              )}
            </div>
            {/* Hidden field for form submission */}
            <input type="hidden" name="spreadsheet_display_columns" value={selectedColumns.join(',')} />
          </Section>

          <Section title="プロンプト（プロジェクト既定値）">
            <p className="text-xs text-gray-500 mb-3">
              ここで設定したプロンプトはカテゴリ override が空のとき採用されます。
              通常は空のままにし、`prompts/translation-system.md` / `prompts/translation-review.md`
              （リポジトリ内の汎用ベース）をそのまま使うことを推奨。
            </p>
            <Field
              label="翻訳プロンプト override"
              name="prompt_translation"
              defaultValue={project.prompt_translation}
              textarea
              rows={8}
              placeholder="空欄なら prompts/translation-system.md を使用"
            />
            <Field
              label="校閲プロンプト override"
              name="prompt_review"
              defaultValue={project.prompt_review}
              textarea
              rows={8}
              placeholder="空欄なら prompts/translation-review.md を使用"
            />
          </Section>

          <div className="flex justify-between">
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={saving}
                className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? '保存中...' : '保存'}
              </button>
              <button
                type="button"
                onClick={() => router.push(`/projects/${id}`)}
                className="bg-gray-200 text-gray-700 px-6 py-2 rounded hover:bg-gray-300"
              >
                戻る
              </button>
            </div>
            <button
              type="button"
              onClick={handleDelete}
              className="bg-red-600 text-white px-6 py-2 rounded hover:bg-red-700"
            >
              プロジェクト削除
            </button>
          </div>
        </form>
      </div>
    </AuthLayout>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-lg shadow p-5">
      <h3 className="text-lg font-semibold mb-4 pb-2 border-b">{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({
  label, name, type = 'text', defaultValue = '', placeholder, required, textarea, rows = 3,
}: {
  label: string; name: string; type?: string; defaultValue?: any; placeholder?: string;
  required?: boolean; textarea?: boolean; rows?: number;
}) {
  const cls = 'w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
  return (
    <div>
      <label className="block text-sm font-medium mb-1">{label}</label>
      {textarea ? (
        <textarea name={name} defaultValue={defaultValue} placeholder={placeholder} required={required} rows={rows} className={cls} />
      ) : (
        <input type={type} name={name} defaultValue={defaultValue} placeholder={placeholder} required={required} className={cls} />
      )}
    </div>
  );
}
