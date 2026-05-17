'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import AuthLayout from '@/components/AuthLayout';
import ProjectNav from '@/components/ProjectNav';

interface Job {
  id: number;
  status: string;
  phase: string;
  log: string;
  started_at: string;
  completed_at: string;
}

export default function ArticleDetailPage() {
  const { id: projectId, articleId } = useParams();
  const [article, setArticle] = useState<any>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState(false);

  const fetchData = useCallback(() => {
    fetch(`/api/articles/${articleId}`)
      .then((r) => r.json())
      .then((d) => {
        setArticle(d.article);
        setJobs(d.jobs || []);
      })
      .finally(() => setLoading(false));
  }, [articleId]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, [fetchData]);

  async function handleExecute() {
    setExecuting(true);
    try {
      const res = await fetch('/api/articles/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ article_row_id: parseInt(articleId as string) }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error);
      }
      fetchData();
    } finally {
      setExecuting(false);
    }
  }

  if (loading) return <AuthLayout><p className="text-gray-500">読み込み中...</p></AuthLayout>;
  if (!article) return <AuthLayout><p className="text-red-500">Not found</p></AuthLayout>;

  return (
    <AuthLayout>
      <div className="max-w-5xl">
        <ProjectNav projectId={projectId as string} projectName={`プロジェクト`} />
        <h2 className="text-2xl font-bold mb-6">記事 #{article.article_id}</h2>

        <div className="bg-white rounded-lg shadow p-5 mb-6">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-500">管理画面ID:</span>
              <span className="ml-2 font-mono">{article.article_id}</span>
            </div>
            <div>
              <span className="text-gray-500">キーワード:</span>
              <span className="ml-2 font-semibold">{article.keywords}</span>
            </div>
            <div>
              <span className="text-gray-500">ステータス:</span>
              <span className={`ml-2 px-2 py-0.5 rounded text-xs ${
                article.status === 'completed' ? 'bg-green-100 text-green-700' :
                article.status === 'running' ? 'bg-blue-100 text-blue-700' :
                article.status === 'failed' ? 'bg-red-100 text-red-700' :
                'bg-gray-100 text-gray-700'
              }`}>
                {article.status}
              </span>
            </div>
            <div>
              <span className="text-gray-500">結果URL:</span>
              {article.result_url ? (
                <a href={article.result_url} target="_blank" rel="noopener noreferrer" className="ml-2 text-blue-600 hover:underline">
                  {article.result_url}
                </a>
              ) : (
                <span className="ml-2 text-gray-400">-</span>
              )}
            </div>
          </div>

          {/* Google Doc URLs */}
          <div className="mt-4 pt-4 border-t flex gap-3">
            {article.article_doc_url ? (
              <a href={article.article_doc_url} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 bg-blue-50 text-blue-700 px-3 py-1.5 rounded text-sm hover:bg-blue-100">
                記事 Google Doc
              </a>
            ) : (
              <span className="text-sm text-gray-400">記事Doc: 未生成</span>
            )}
            {article.factcheck_doc_url ? (
              <a href={article.factcheck_doc_url} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 bg-orange-50 text-orange-700 px-3 py-1.5 rounded text-sm hover:bg-orange-100">
                校閲 Google Doc
              </a>
            ) : (
              <span className="text-sm text-gray-400">校閲Doc: 未生成</span>
            )}
          </div>
          <div className="mt-4">
            {article.status !== 'running' && (
              <button
                onClick={handleExecute}
                disabled={executing}
                className="bg-green-600 text-white px-4 py-2 rounded text-sm hover:bg-green-700 disabled:opacity-50"
              >
                {executing ? '開始中...' : '記事作成・校閲・入稿を実行'}
              </button>
            )}
            {article.status === 'running' && (
              <span className="text-blue-600 text-sm font-medium">実行中... (自動更新中)</span>
            )}
          </div>
        </div>

        <h3 className="text-lg font-semibold mb-3">ジョブ履歴</h3>
        {jobs.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-6 text-center text-gray-500">まだ実行されていません</div>
        ) : (
          <div className="space-y-4">
            {jobs.map((job) => (
              <div key={job.id} className="bg-white rounded-lg shadow p-4">
                <div className="flex justify-between items-center mb-2">
                  <div className="flex items-center gap-3">
                    <span className={`text-xs px-2 py-1 rounded ${
                      job.status === 'completed' ? 'bg-green-100 text-green-700' :
                      job.status === 'running' ? 'bg-blue-100 text-blue-700' :
                      job.status === 'failed' ? 'bg-red-100 text-red-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {job.status}
                    </span>
                    {job.phase && <span className="text-xs text-gray-500">Phase: {job.phase}</span>}
                  </div>
                  <div className="text-xs text-gray-400">
                    {job.started_at && <span>開始: {new Date(job.started_at).toLocaleString('ja-JP')}</span>}
                    {job.completed_at && <span className="ml-3">完了: {new Date(job.completed_at).toLocaleString('ja-JP')}</span>}
                  </div>
                </div>
                {job.log && (
                  <pre className="bg-gray-900 text-green-400 p-3 rounded text-xs overflow-x-auto max-h-96 overflow-y-auto whitespace-pre-wrap">
                    {job.log}
                  </pre>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </AuthLayout>
  );
}
