'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import AuthLayout from '@/components/AuthLayout';
import ProjectNav from '@/components/ProjectNav';

export default function CategoryEditPage() {
  const { id, categoryId } = useParams();
  const router = useRouter();
  const [projectName, setProjectName] = useState('');
  const [name, setName] = useState('');
  const [promptStructure, setPromptStructure] = useState('');
  const [promptArticle, setPromptArticle] = useState('');
  const [promptFactcheck, setPromptFactcheck] = useState('');
  const [docCheck, setDocCheck] = useState('');
  const [docCheckUrl, setDocCheckUrl] = useState('');
  const [docContent, setDocContent] = useState('');
  const [docContentUrl, setDocContentUrl] = useState('');
  const [promptStructurePath, setPromptStructurePath] = useState('');
  const [promptArticlePath, setPromptArticlePath] = useState('');
  const [promptFactcheckPath, setPromptFactcheckPath] = useState('');
  const [docCheckPath, setDocCheckPath] = useState('');
  const [docContentPath, setDocContentPath] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [writeErrors, setWriteErrors] = useState<string[]>([]);
  const [writtenFiles, setWrittenFiles] = useState<string[]>([]);

  useEffect(() => {
    Promise.all([
      fetch(`/api/projects/${id}`).then((r) => r.json()),
      fetch(`/api/projects/${id}/categories/${categoryId}`).then((r) => r.json()),
    ]).then(([projData, catData]) => {
      setProjectName(projData.project?.name || '');
      if (catData.category) {
        setName(catData.category.name);
        setPromptStructure(catData.category.prompt_structure || '');
        setPromptArticle(catData.category.prompt_article || '');
        setPromptFactcheck(catData.category.prompt_factcheck || '');
        setDocCheck(catData.category.doc_check || '');
        setDocCheckUrl(catData.category.doc_check_url || '');
        setDocContent(catData.category.doc_content || '');
        setDocContentUrl(catData.category.doc_content_url || '');
        setPromptStructurePath(catData.category.prompt_structure_path || '');
        setPromptArticlePath(catData.category.prompt_article_path || '');
        setPromptFactcheckPath(catData.category.prompt_factcheck_path || '');
        setDocCheckPath(catData.category.doc_check_path || '');
        setDocContentPath(catData.category.doc_content_path || '');
      }
    }).finally(() => setLoading(false));
  }, [id, categoryId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    setWriteErrors([]);
    setWrittenFiles([]);
    try {
      const res = await fetch(`/api/projects/${id}/categories/${categoryId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          prompt_structure: promptStructure,
          prompt_article: promptArticle,
          prompt_factcheck: promptFactcheck,
          doc_check: docCheck,
          doc_check_url: docCheckUrl,
          doc_content: docContent,
          doc_content_url: docContentUrl,
          prompt_structure_path: promptStructurePath,
          prompt_article_path: promptArticlePath,
          prompt_factcheck_path: promptFactcheckPath,
          doc_check_path: docCheckPath,
          doc_content_path: docContentPath,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (data.writtenFiles) setWrittenFiles(data.writtenFiles);
      if (data.writeErrors && data.writeErrors.length > 0) {
        setWriteErrors(data.writeErrors);
        setSuccess(`DB保存しました（${data.writtenFiles?.length || 0}件書き出し、${data.writeErrors.length}件エラー）`);
      } else {
        setSuccess(`保存しました（${data.writtenFiles?.length || 0}件のファイルを書き出し）`);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <AuthLayout><p className="text-gray-500">読み込み中...</p></AuthLayout>;

  const pathInput = (value: string, onChange: (v: string) => void) => (
    <div className="mt-2">
      <label className="block text-xs text-gray-500 mb-1">出力先パス（プロジェクトルートからの相対パス）</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border border-dashed border-gray-300 rounded px-3 py-1.5 text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 font-mono"
        placeholder={`categories/${categoryId}/...`}
      />
    </div>
  );

  return (
    <AuthLayout>
      <div className="max-w-3xl">
        <ProjectNav projectId={id as string} projectName={projectName} />
        <h2 className="text-2xl font-bold mb-6">カテゴリ編集</h2>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && <div className="bg-red-50 text-red-600 p-3 rounded text-sm">{error}</div>}
          {success && <div className="bg-green-50 text-green-600 p-3 rounded text-sm">{success}</div>}
          {writtenFiles.length > 0 && (
            <div className="bg-blue-50 text-blue-700 p-3 rounded text-sm">
              <p className="font-medium mb-1">書き出し済みファイル:</p>
              {writtenFiles.map((f, i) => <p key={i} className="text-xs font-mono">{f}</p>)}
            </div>
          )}
          {writeErrors.length > 0 && (
            <div className="bg-yellow-50 text-yellow-700 p-3 rounded text-sm">
              <p className="font-medium mb-1">ファイル書き出しエラー:</p>
              {writeErrors.map((e, i) => <p key={i} className="text-xs">{e}</p>)}
            </div>
          )}

          <div className="bg-white rounded-lg shadow p-5">
            <h3 className="text-lg font-semibold mb-4 pb-2 border-b">基本情報</h3>
            <div>
              <label className="block text-sm font-medium mb-1">カテゴリ名</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-5">
            <h3 className="text-lg font-semibold mb-4 pb-2 border-b">プロンプト</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">記事タイトル＆構成生成プロンプト</label>
                <textarea
                  value={promptStructure}
                  onChange={(e) => setPromptStructure(e.target.value)}
                  rows={8}
                  className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {pathInput(promptStructurePath, setPromptStructurePath)}
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">記事生成プロンプト</label>
                <textarea
                  value={promptArticle}
                  onChange={(e) => setPromptArticle(e.target.value)}
                  rows={8}
                  className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {pathInput(promptArticlePath, setPromptArticlePath)}
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">校閲プロンプト</label>
                <textarea
                  value={promptFactcheck}
                  onChange={(e) => setPromptFactcheck(e.target.value)}
                  rows={8}
                  className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {pathInput(promptFactcheckPath, setPromptFactcheckPath)}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-5">
            <h3 className="text-lg font-semibold mb-4 pb-2 border-b">ドキュメント</h3>
            <p className="text-sm text-gray-500 mb-4">カテゴリ固有のドキュメントを設定できます。空の場合はプロジェクトのドキュメントが使用されます。</p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">校閲ガイドライン</label>
                <div className="mb-2">
                  <label className="block text-xs text-gray-500 mb-1">元ネタURL</label>
                  <input
                    type="url"
                    value={docCheckUrl}
                    onChange={(e) => setDocCheckUrl(e.target.value)}
                    className="w-full border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="https://docs.google.com/..."
                  />
                </div>
                <textarea
                  value={docCheck}
                  onChange={(e) => setDocCheck(e.target.value)}
                  rows={12}
                  className="w-full border rounded px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="校閲ガイドラインをMarkdownで記述...（空欄の場合はプロジェクト設定を使用）"
                />
                {pathInput(docCheckPath, setDocCheckPath)}
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">コンテンツDB</label>
                <div className="mb-2">
                  <label className="block text-xs text-gray-500 mb-1">元ネタURL</label>
                  <input
                    type="url"
                    value={docContentUrl}
                    onChange={(e) => setDocContentUrl(e.target.value)}
                    className="w-full border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="https://docs.google.com/..."
                  />
                </div>
                <textarea
                  value={docContent}
                  onChange={(e) => setDocContent(e.target.value)}
                  rows={12}
                  className="w-full border rounded px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="コンテンツDBをMarkdownで記述...（空欄の場合はプロジェクト設定を使用）"
                />
                {pathInput(docContentPath, setDocContentPath)}
              </div>
            </div>
          </div>

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
              onClick={() => router.push(`/projects/${id}/categories`)}
              className="bg-gray-200 text-gray-700 px-6 py-2 rounded hover:bg-gray-300"
            >
              戻る
            </button>
          </div>
        </form>
      </div>
    </AuthLayout>
  );
}
