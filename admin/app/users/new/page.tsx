'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import AuthLayout from '@/components/AuthLayout';

export default function NewUserPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError('');

    const form = new FormData(e.currentTarget);
    const body = {
      username: form.get('username'),
      password: form.get('password'),
      display_name: form.get('display_name'),
      role: form.get('role'),
    };

    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      router.push('/users');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <AuthLayout>
      <div className="max-w-lg">
        <h2 className="text-2xl font-bold mb-6">新規ユーザー作成</h2>
        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-5 space-y-4">
          {error && <div className="bg-red-50 text-red-600 p-3 rounded text-sm">{error}</div>}
          <div>
            <label className="block text-sm font-medium mb-1">ユーザー名</label>
            <input type="text" name="username" required className="w-full border rounded px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">パスワード</label>
            <input type="password" name="password" required className="w-full border rounded px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">表示名</label>
            <input type="text" name="display_name" className="w-full border rounded px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">権限</label>
            <select name="role" className="w-full border rounded px-3 py-2 text-sm">
              <option value="user">user</option>
              <option value="admin">admin</option>
            </select>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={saving} className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 disabled:opacity-50">
              {saving ? '作成中...' : '作成'}
            </button>
            <button type="button" onClick={() => router.back()} className="bg-gray-200 text-gray-700 px-6 py-2 rounded hover:bg-gray-300">
              キャンセル
            </button>
          </div>
        </form>
      </div>
    </AuthLayout>
  );
}
