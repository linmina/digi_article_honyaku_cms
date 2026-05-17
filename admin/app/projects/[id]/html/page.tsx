'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import AuthLayout from '@/components/AuthLayout';
import ProjectNav from '@/components/ProjectNav';

interface HtmlFile {
  filename: string;
  title: string;
  size: number;
  updatedAt: string;
  matchSnippet: string;
}

interface Project {
  id: number;
  name: string;
}

export default function HtmlSearchPage() {
  const { id } = useParams();
  const [project, setProject] = useState<Project | null>(null);
  const [files, setFiles] = useState<HtmlFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [error, setError] = useState('');
  const [viewingFile, setViewingFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState('');
  const [loadingContent, setLoadingContent] = useState(false);

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      const res = await fetch(`/api/projects/${id}/html?${params}`);
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        setFiles([]);
      } else {
        setFiles(data.files || []);
      }
    } catch {
      setError('データの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [id, search]);

  useEffect(() => {
    fetch(`/api/projects/${id}`).then((r) => r.json()).then((d) => setProject(d.project));
  }, [id]);

  useEffect(() => { fetchFiles(); }, [fetchFiles]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearch(searchInput);
  }

  async function viewFile(filename: string) {
    setViewingFile(filename);
    setLoadingContent(true);
    try {
      const res = await fetch(`/api/projects/${id}/html/${encodeURIComponent(filename)}`);
      const data = await res.json();
      setFileContent(data.content || '');
    } catch {
      setFileContent('ファイルの読み込みに失敗しました');
    } finally {
      setLoadingContent(false);
    }
  }

  function highlightSearch(text: string): string {
    if (!search) return text;
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return text.replace(new RegExp(`(${escaped})`, 'gi'), '<mark class="bg-yellow-200">$1</mark>');
  }

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return (
    <AuthLayout>
      <div className="space-y-6">
        <ProjectNav projectId={id as string} projectName={project?.name || '...'} />
        <div>
          <h1 className="text-2xl font-bold">HTMLコンテンツ検索</h1>
          <p className="text-sm text-gray-500 mt-1">
            ダウンロード済みHTMLファイル {files.length}件
          </p>
        </div>

        {/* Search */}
        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="HTMLコンテンツを検索..."
            className="flex-1 border rounded px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
          >
            検索
          </button>
          {search && (
            <button
              type="button"
              onClick={() => { setSearch(''); setSearchInput(''); }}
              className="px-3 py-2 bg-gray-200 rounded text-sm hover:bg-gray-300"
            >
              クリア
            </button>
          )}
        </form>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-center py-8 text-gray-500">読み込み中...</div>
        ) : files.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            {search ? `「${search}」に一致するファイルがありません` : 'HTMLファイルがありません。公開記事一覧からダウンロードしてください。'}
          </div>
        ) : (
          <div className="space-y-3">
            {files.map((file) => (
              <div
                key={file.filename}
                className="bg-white rounded-lg shadow p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="font-medium text-gray-900">{file.title}</h3>
                    <div className="flex gap-4 mt-1 text-xs text-gray-500">
                      <span>{file.filename}</span>
                      <span>{formatSize(file.size)}</span>
                      <span>{new Date(file.updatedAt).toLocaleString('ja-JP')}</span>
                    </div>
                    {file.matchSnippet && (
                      <div
                        className="mt-2 text-sm text-gray-600 bg-gray-50 px-3 py-2 rounded"
                        dangerouslySetInnerHTML={{ __html: highlightSearch(file.matchSnippet) }}
                      />
                    )}
                  </div>
                  <button
                    onClick={() => viewFile(file.filename)}
                    className="ml-4 px-3 py-1 bg-blue-100 text-blue-700 rounded text-sm hover:bg-blue-200"
                  >
                    表示
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* File Viewer Modal */}
        {viewingFile && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
              <div className="flex items-center justify-between px-4 py-3 border-b">
                <h3 className="font-medium">{viewingFile}</h3>
                <button
                  onClick={() => { setViewingFile(null); setFileContent(''); }}
                  className="text-gray-400 hover:text-gray-600 text-xl"
                >
                  &times;
                </button>
              </div>
              <div className="flex-1 overflow-auto p-4">
                {loadingContent ? (
                  <div className="text-center py-8 text-gray-500">読み込み中...</div>
                ) : (
                  <div
                    className="prose max-w-none"
                    dangerouslySetInnerHTML={{ __html: fileContent }}
                  />
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </AuthLayout>
  );
}
