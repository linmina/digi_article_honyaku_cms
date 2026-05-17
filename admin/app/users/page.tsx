'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import AuthLayout from '@/components/AuthLayout';

interface User {
  id: number;
  username: string;
  display_name: string;
  role: string;
  created_at: string;
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  function fetchUsers() {
    fetch('/api/users')
      .then((r) => r.json())
      .then((d) => setUsers(d.users || []))
      .finally(() => setLoading(false));
  }

  useEffect(() => { fetchUsers(); }, []);

  async function deleteUser(userId: number, username: string) {
    if (!confirm(`ユーザー "${username}" を削除しますか？`)) return;
    await fetch(`/api/users/${userId}`, { method: 'DELETE' });
    fetchUsers();
  }

  return (
    <AuthLayout>
      <div className="max-w-4xl">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">ユーザー管理</h2>
          <Link
            href="/users/new"
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 text-sm"
          >
            + 新規ユーザー
          </Link>
        </div>

        {loading ? (
          <p className="text-gray-500">読み込み中...</p>
        ) : (
          <div className="bg-white rounded-lg shadow">
            <table className="w-full">
              <thead>
                <tr className="text-left text-sm text-gray-500 border-b">
                  <th className="p-3">ユーザー名</th>
                  <th className="p-3">表示名</th>
                  <th className="p-3">権限</th>
                  <th className="p-3">作成日</th>
                  <th className="p-3">アクション</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b hover:bg-gray-50">
                    <td className="p-3 text-sm font-mono">{u.username}</td>
                    <td className="p-3 text-sm">{u.display_name}</td>
                    <td className="p-3">
                      <span className={`text-xs px-2 py-1 rounded ${
                        u.role === 'admin' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-700'
                      }`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="p-3 text-sm text-gray-500">
                      {new Date(u.created_at).toLocaleDateString('ja-JP')}
                    </td>
                    <td className="p-3">
                      <div className="flex gap-2">
                        <Link
                          href={`/users/${u.id}`}
                          className="bg-gray-200 text-gray-700 px-3 py-1 rounded text-xs hover:bg-gray-300"
                        >
                          編集
                        </Link>
                        <button
                          onClick={() => deleteUser(u.id, u.username)}
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
          </div>
        )}
      </div>
    </AuthLayout>
  );
}
