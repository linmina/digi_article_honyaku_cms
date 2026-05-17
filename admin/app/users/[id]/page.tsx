'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import AuthLayout from '@/components/AuthLayout';

interface Project {
  id: number;
  name: string;
  slug: string;
}

export default function EditUserPage() {
  const { id } = useParams();
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [userProjects, setUserProjects] = useState<number[]>([]);
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    Promise.all([
      fetch(`/api/users/${id}`).then((r) => r.json()),
      fetch('/api/projects').then((r) => r.json()),
    ]).then(([userData, projectsData]) => {
      setUser(userData.user);
      setUserProjects((userData.projects || []).map((p: Project) => p.id));
      setAllProjects(projectsData.projects || []);
    }).finally(() => setLoading(false));
  }, [id]);

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');

    const form = new FormData(e.currentTarget);
    const body: any = {
      display_name: form.get('display_name'),
      role: form.get('role'),
    };
    const newPassword = form.get('password') as string;
    if (newPassword) body.password = newPassword;

    try {
      const res = await fetch(`/api/users/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }

      // Update project access
      await fetch(`/api/users/${id}/projects`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_ids: userProjects }),
      });

      setSuccess('保存しました');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  function toggleProject(projectId: number) {
    setUserProjects((prev) =>
      prev.includes(projectId)
        ? prev.filter((id) => id !== projectId)
        : [...prev, projectId]
    );
  }

  if (loading) return <AuthLayout><p className="text-gray-500">読み込み中...</p></AuthLayout>;
  if (!user) return <AuthLayout><p className="text-red-500">Not found</p></AuthLayout>;

  return (
    <AuthLayout>
      <div className="max-w-lg">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/users" className="text-blue-600 hover:underline text-sm">ユーザー管理</Link>
          <span className="text-gray-400">/</span>
          <h2 className="text-2xl font-bold">{user.username}</h2>
        </div>

        <form onSubmit={handleSave} className="space-y-6">
          {error && <div className="bg-red-50 text-red-600 p-3 rounded text-sm">{error}</div>}
          {success && <div className="bg-green-50 text-green-600 p-3 rounded text-sm">{success}</div>}

          <div className="bg-white rounded-lg shadow p-5 space-y-4">
            <h3 className="font-semibold pb-2 border-b">基本情報</h3>
            <div>
              <label className="block text-sm font-medium mb-1">ユーザー名</label>
              <input type="text" value={user.username} disabled className="w-full border rounded px-3 py-2 text-sm bg-gray-50" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">表示名</label>
              <input type="text" name="display_name" defaultValue={user.display_name} className="w-full border rounded px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">新しいパスワード（変更する場合のみ）</label>
              <input type="password" name="password" className="w-full border rounded px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">権限</label>
              <select name="role" defaultValue={user.role} className="w-full border rounded px-3 py-2 text-sm">
                <option value="user">user</option>
                <option value="admin">admin</option>
              </select>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-5">
            <h3 className="font-semibold pb-2 border-b mb-3">アクセス可能プロジェクト</h3>
            <p className="text-xs text-gray-500 mb-3">adminユーザーは全プロジェクトにアクセスできます</p>
            {allProjects.length === 0 ? (
              <p className="text-sm text-gray-500">プロジェクトがありません</p>
            ) : (
              <div className="space-y-2">
                {allProjects.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={userProjects.includes(p.id)}
                      onChange={() => toggleProject(p.id)}
                      className="rounded"
                    />
                    {p.name}
                    <span className="text-xs text-gray-400">({p.slug})</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <button type="submit" disabled={saving} className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 disabled:opacity-50">
              {saving ? '保存中...' : '保存'}
            </button>
            <button type="button" onClick={() => router.push('/users')} className="bg-gray-200 text-gray-700 px-6 py-2 rounded hover:bg-gray-300">
              戻る
            </button>
          </div>
        </form>
      </div>
    </AuthLayout>
  );
}
