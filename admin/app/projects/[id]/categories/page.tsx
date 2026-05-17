'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import AuthLayout from '@/components/AuthLayout';
import ProjectNav from '@/components/ProjectNav';

interface Category {
  id: number;
  name: string;
  prompt_structure: string;
  prompt_article: string;
  prompt_factcheck: string;
  created_at: string;
}

interface Project {
  id: number;
  name: string;
}

export default function CategoriesPage() {
  const { id } = useParams();
  const [project, setProject] = useState<Project | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);

  function fetchData() {
    Promise.all([
      fetch(`/api/projects/${id}`).then((r) => r.json()),
      fetch(`/api/projects/${id}/categories`).then((r) => r.json()),
    ]).then(([projData, catData]) => {
      setProject(projData.project);
      setCategories(catData.categories || []);
    }).finally(() => setLoading(false));
  }

  useEffect(() => { fetchData(); }, [id]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true);
    try {
      const res = await fetch(`/api/projects/${id}/categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName }),
      });
      if (res.ok) {
        setNewName('');
        setShowAddForm(false);
        fetchData();
      }
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(categoryId: number) {
    if (!confirm('このカテゴリを削除しますか？関連する記事のカテゴリ設定は解除されます。')) return;
    await fetch(`/api/projects/${id}/categories/${categoryId}`, { method: 'DELETE' });
    fetchData();
  }

  if (loading) return <AuthLayout><p className="text-gray-500">読み込み中...</p></AuthLayout>;
  if (!project) return <AuthLayout><p className="text-red-500">プロジェクトが見つかりません</p></AuthLayout>;

  return (
    <AuthLayout>
      <div className="max-w-4xl">
        <ProjectNav projectId={id as string} projectName={project.name} />

        <div className="bg-white rounded-lg shadow">
          <div className="flex justify-between items-center p-4 border-b">
            <h3 className="font-semibold">カテゴリ一覧</h3>
            <button
              onClick={() => setShowAddForm(true)}
              className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm hover:bg-blue-700"
            >
              + カテゴリ追加
            </button>
          </div>

          {showAddForm && (
            <form onSubmit={handleAdd} className="p-4 bg-blue-50 border-b flex gap-3 items-end">
              <div className="flex-1">
                <label className="block text-xs font-medium mb-1">カテゴリ名</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="例: SEO記事、コラム"
                  className="border rounded px-3 py-1.5 text-sm w-full"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={adding}
                className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm hover:bg-blue-700 disabled:opacity-50"
              >
                {adding ? '追加中...' : '追加'}
              </button>
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="text-gray-500 hover:text-gray-700 text-sm"
              >
                キャンセル
              </button>
            </form>
          )}

          {categories.length === 0 ? (
            <div className="p-8 text-center text-gray-500">カテゴリがありません</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="text-left text-sm text-gray-500 border-b">
                  <th className="p-3">カテゴリ名</th>
                  <th className="p-3">構成プロンプト</th>
                  <th className="p-3">記事プロンプト</th>
                  <th className="p-3">校閲プロンプト</th>
                  <th className="p-3">作成日時</th>
                  <th className="p-3">アクション</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((cat) => (
                  <tr key={cat.id} className="border-b hover:bg-gray-50">
                    <td className="p-3 text-sm font-medium">{cat.name}</td>
                    <td className="p-3 text-xs text-gray-500">
                      {cat.prompt_structure ? `${cat.prompt_structure.substring(0, 30)}...` : <span className="text-gray-300">未設定</span>}
                    </td>
                    <td className="p-3 text-xs text-gray-500">
                      {cat.prompt_article ? `${cat.prompt_article.substring(0, 30)}...` : <span className="text-gray-300">未設定</span>}
                    </td>
                    <td className="p-3 text-xs text-gray-500">
                      {cat.prompt_factcheck ? `${cat.prompt_factcheck.substring(0, 30)}...` : <span className="text-gray-300">未設定</span>}
                    </td>
                    <td className="p-3 text-sm text-gray-500 whitespace-nowrap">
                      {new Date(cat.created_at).toLocaleString('ja-JP')}
                    </td>
                    <td className="p-3">
                      <div className="flex gap-2">
                        <Link
                          href={`/projects/${id}/categories/${cat.id}`}
                          className="bg-gray-200 text-gray-700 px-3 py-1 rounded text-xs hover:bg-gray-300"
                        >
                          編集
                        </Link>
                        <button
                          onClick={() => handleDelete(cat.id)}
                          className="text-red-500 hover:text-red-700 text-xs px-2"
                        >
                          削除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AuthLayout>
  );
}
