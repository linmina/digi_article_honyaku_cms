'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import AuthLayout from '@/components/AuthLayout';
import ProjectNav from '@/components/ProjectNav';

interface PublishedArticle {
  id: number;
  name: string;
  title: string;
  description: string;
  content: string;
  memo: string;
  image: string;
  publishFlag: string;
  articleType: string;
  articleStatus: string;
  cmsUrl: string;
  previewUrl: string;
  publicUrl: string;
  contentSnippets: string[];
  hitCount: number;
}

interface Project {
  id: number;
  name: string;
  cms_base_url: string;
  preview_url_pattern: string;
  public_url_pattern: string;
}

export default function PublishedArticlesPage() {
  const { id } = useParams();
  const [project, setProject] = useState<Project | null>(null);
  const [articles, setArticles] = useState<PublishedArticle[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState<number | null>(null);
  const limit = 50;

  const fetchArticles = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (search) params.set('search', search);
      const res = await fetch(`/api/projects/${id}/published?${params}`);
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        setArticles([]);
      } else {
        setArticles(data.articles || []);
        setTotal(data.total || 0);
      }
    } catch {
      setError('データの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [id, search, page]);

  useEffect(() => {
    fetch(`/api/projects/${id}`).then((r) => r.json()).then((d) => setProject(d.project));
  }, [id]);

  useEffect(() => { fetchArticles(); }, [fetchArticles]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput);
  }

  function getDownloadUrl(article: PublishedArticle): string {
    return article.previewUrl || article.publicUrl || '';
  }

  async function handleDownloadHtml(article: PublishedArticle) {
    const dlUrl = getDownloadUrl(article);
    if (!dlUrl) return;
    setDownloading(article.id);
    try {
      const res = await fetch(`/api/projects/${id}/html`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: dlUrl,
          articleId: article.id,
          filename: `article_${article.id}.html`,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        alert(`HTMLダウンロード完了: ${data.filename}`);
      } else {
        alert(`エラー: ${data.error}`);
      }
    } catch {
      alert('ダウンロードに失敗しました');
    } finally {
      setDownloading(null);
    }
  }

  async function handleDownloadAll() {
    const urlArticles = articles.filter((a) => getDownloadUrl(a));
    if (urlArticles.length === 0) {
      alert('ダウンロード可能な記事がありません。設定画面で「プレビューURLパターン」を設定してください。');
      return;
    }
    if (!confirm(`${urlArticles.length}件の記事HTMLをダウンロードしますか？`)) return;

    let success = 0;
    let failed = 0;
    const errors: string[] = [];
    for (const article of urlArticles) {
      setDownloading(article.id);
      try {
        const res = await fetch(`/api/projects/${id}/html`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: getDownloadUrl(article),
            articleId: article.id,
            filename: `article_${article.id}.html`,
          }),
        });
        const data = await res.json();
        if (data.ok) {
          success++;
        } else {
          failed++;
          errors.push(`ID ${article.id}: ${data.error}`);
        }
      } catch (e: any) {
        failed++;
        errors.push(`ID ${article.id}: ${e.message || '通信エラー'}`);
      }
    }
    setDownloading(null);
    let msg = `完了: ${success}件成功`;
    if (failed > 0) {
      msg += ` / ${failed}件失敗\n\n${errors.slice(0, 5).join('\n')}`;
    }
    alert(msg);
  }

  const totalPages = Math.ceil(total / limit);

  function stripHtml(html: string): string {
    return html.replace(/<[^>]+>/g, '').slice(0, 200);
  }

  function highlightKeyword(text: string, keyword: string): React.ReactNode {
    if (!keyword) return text;
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
    return parts.map((part, i) =>
      part.toLowerCase() === keyword.toLowerCase()
        ? <mark key={i} className="bg-yellow-300 text-yellow-900 px-0.5 rounded">{part}</mark>
        : part
    );
  }

  return (
    <AuthLayout>
      <div className="space-y-6">
        <ProjectNav projectId={id as string} projectName={project?.name || '...'} />
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">公開記事一覧</h1>
            <p className="text-sm text-gray-500 mt-1">
              公開中の記事 {total}件
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleDownloadAll}
              className="px-3 py-2 bg-green-600 text-white rounded text-sm hover:bg-green-700"
            >
              HTML一括ダウンロード
            </button>
          </div>
        </div>

        {/* Search */}
        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="キーワードで記事を検索..."
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
              onClick={() => { setSearch(''); setSearchInput(''); setPage(1); }}
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
        ) : articles.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            {search ? `「${search}」に一致する記事がありません` : '公開記事がありません'}
          </div>
        ) : (
          <>
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-600 w-20">ID</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600 w-12">画像</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">タイトル</th>
                    {search && (
                      <th className="px-4 py-3 text-left font-medium text-gray-600">コンテンツ (ヒット数)</th>
                    )}
                    <th className="px-4 py-3 text-left font-medium text-gray-600 w-20">公開</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600 w-20">タイプ</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600 w-24">ステータス</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600 w-36">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {articles.map((article) => (
                    <tr key={article.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-500">{article.id}</td>
                      <td className="px-4 py-3">
                        {article.image ? (
                          <img
                            src={article.image}
                            alt=""
                            className="w-10 h-10 object-cover rounded"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        ) : (
                          <span className="text-xs text-gray-300">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">
                          {stripHtml(article.title) || article.name || `記事 ${article.id}`}
                        </div>
                        {article.memo && (
                          <div className="text-xs text-gray-400 mt-1 truncate max-w-md">
                            {stripHtml(article.memo)}
                          </div>
                        )}
                      </td>
                      {search && (
                        <td className="px-4 py-3">
                          <div className="mb-1.5">
                            <span className="inline-block px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium">
                              {article.hitCount}件ヒット
                            </span>
                          </div>
                          {article.contentSnippets && article.contentSnippets.length > 0 ? (
                            <div className="space-y-1.5">
                              {article.contentSnippets.map((snippet, i) => (
                                <div key={i} className="text-xs text-gray-700 bg-gray-50 px-2 py-1.5 rounded border border-gray-100 leading-relaxed">
                                  {highlightKeyword(snippet, search)}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400">-</span>
                          )}
                        </td>
                      )}
                      <td className="px-4 py-3 text-center">
                        <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">
                          {article.publishFlag || '-'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600 text-center">
                        {article.articleType || '-'}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600 text-center">
                        {article.articleStatus || '-'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1 flex-wrap">
                          {article.previewUrl && (
                            <a
                              href={article.previewUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded text-xs hover:bg-yellow-200"
                            >
                              プレビュー
                            </a>
                          )}
                          {article.publicUrl && (
                            <a
                              href={article.publicUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs hover:bg-blue-200"
                            >
                              公開
                            </a>
                          )}
                          {article.cmsUrl && (
                            <a
                              href={article.cmsUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs hover:bg-gray-200"
                            >
                              CMS
                            </a>
                          )}
                          <button
                            onClick={() => handleDownloadHtml(article)}
                            disabled={downloading === article.id || !getDownloadUrl(article)}
                            className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs hover:bg-green-200 disabled:opacity-50"
                          >
                            {downloading === article.id ? '...' : 'DL'}
                          </button>
                          <Link
                            href={`/projects/${id}/tasks?article_id=${article.id}`}
                            className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs hover:bg-purple-200"
                          >
                            タスク
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex justify-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1 border rounded text-sm disabled:opacity-50"
                >
                  前へ
                </button>
                <span className="px-3 py-1 text-sm text-gray-600">
                  {page} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1 border rounded text-sm disabled:opacity-50"
                >
                  次へ
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </AuthLayout>
  );
}
