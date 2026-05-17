'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import AuthLayout from '@/components/AuthLayout';

export default function NewProjectPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError('');

    const form = new FormData(e.currentTarget);
    const body: Record<string, any> = {};
    form.forEach((v, k) => {
      body[k] = k === 'db_port' ? parseInt(v as string) || 3306 : v;
    });

    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      router.push(`/projects/${data.id}`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <AuthLayout>
      <div className="max-w-3xl">
        <h2 className="text-2xl font-bold mb-6">新規プロジェクト作成</h2>
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && <div className="bg-red-50 text-red-600 p-3 rounded text-sm">{error}</div>}

          <Section title="基本情報">
            <Field label="プロジェクト名" name="name" required />
            <Field label="スラグ" name="slug" placeholder="自動生成（空欄可）" />
            <Field label="説明" name="description" textarea />
          </Section>

          <Section title="プロジェクトパス">
            <Field label="writer_checkプロジェクトのパス" name="project_path" placeholder="/config/workspace/writer_check_set" />
          </Section>

          <Section title="CMS設定">
            <Field label="管理画面ベースURL" name="cms_base_url" placeholder="https://cmsv1-dot-project-gtn-439607.an.r.appspot.com/admin/create/contents/gtnArticles" />
          </Section>

          <Section title="DB設定">
            <div className="grid grid-cols-2 gap-4">
              <Field label="ホスト" name="db_host" placeholder="34.146.90.95" />
              <Field label="ポート" name="db_port" type="number" placeholder="3306" />
              <Field label="データベース名" name="db_name" placeholder="content" />
              <Field label="ユーザー" name="db_user" />
            </div>
            <Field label="パスワード" name="db_password" type="password" />
          </Section>

          <Section title="Google Drive設定">
            <Field label="記事フォルダID" name="article_folder_id" placeholder="10LLkJVze1uTnM0oqjf8RZANfYVoO48E5" />
            <Field label="校閲フォルダID" name="factcheck_folder_id" placeholder="1N3vBLWdxa514l53gwaBtvGLwet3UfTNK" />
            <Field label="認証ファイルパス" name="credentials_path" placeholder="../key/nexus-notes-412407-ad4455fb74b4.json" />
          </Section>

          <Section title="Claude設定">
            <Field label="モデル" name="claude_model" placeholder="claude-opus-4-6" />
          </Section>

          <Section title="スプレッドシート設定">
            <Field label="スプレッドシートURL" name="spreadsheet_url" placeholder="https://docs.google.com/spreadsheets/d/xxxxx/edit" />
            <Field label="シート名" name="spreadsheet_sheet_name" placeholder="Sheet1（空欄でデフォルトシート）" />
            <Field label="ID列（ヘッダー名またはA,B,C...）" name="spreadsheet_id_column" placeholder="A" />
            <p className="text-xs text-gray-500">表示カラムの設定は、プロジェクト作成後にCSVダウンロードしてから行えます</p>
          </Section>

          <Section title="プロンプト">
            <Field label="記事タイトル＆構成生成プロンプト" name="prompt_structure" textarea rows={6} />
            <Field label="記事生成プロンプト" name="prompt_article" textarea rows={6} />
            <Field label="校閲プロンプト" name="prompt_factcheck" textarea rows={6} />
          </Section>

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={saving}
              className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? '作成中...' : '作成'}
            </button>
            <button
              type="button"
              onClick={() => router.back()}
              className="bg-gray-200 text-gray-700 px-6 py-2 rounded hover:bg-gray-300"
            >
              キャンセル
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
  label, name, type = 'text', placeholder, required, textarea, rows = 3,
}: {
  label: string; name: string; type?: string; placeholder?: string;
  required?: boolean; textarea?: boolean; rows?: number;
}) {
  const cls = 'w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
  return (
    <div>
      <label className="block text-sm font-medium mb-1">{label}</label>
      {textarea ? (
        <textarea name={name} placeholder={placeholder} required={required} rows={rows} className={cls} />
      ) : (
        <input type={type} name={name} placeholder={placeholder} required={required} className={cls} />
      )}
    </div>
  );
}
