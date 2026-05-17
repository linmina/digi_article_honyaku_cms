'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import AuthLayout from '@/components/AuthLayout';

interface Project {
  id: number;
  name: string;
  slug: string;
  description: string;
  spreadsheet_url: string;
  created_at: string;
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/projects')
      .then((r) => r.json())
      .then((d) => setProjects(d.projects || []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <AuthLayout>
      <div className="max-w-6xl">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">プロジェクト一覧</h2>
          <Link
            href="/projects/new"
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 text-sm"
          >
            + 新規プロジェクト
          </Link>
        </div>

        {loading ? (
          <p className="text-gray-500">読み込み中...</p>
        ) : projects.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
            プロジェクトがありません
          </div>
        ) : (
          <div className="grid gap-4">
            {projects.map((p) => (
              <div key={p.id} className="bg-white rounded-lg shadow p-5 hover:shadow-md transition">
                <div className="flex justify-between items-start">
                  <Link href={`/projects/${p.id}`} className="flex-1">
                    <h3 className="text-lg font-semibold">{p.name}</h3>
                    <p className="text-sm text-gray-500 mt-1">{p.description}</p>
                  </Link>
                  <div className="flex items-center gap-2 ml-4">
                    {p.spreadsheet_url && (
                      <a
                        href={p.spreadsheet_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="bg-purple-50 text-purple-600 px-3 py-1 rounded text-xs hover:bg-purple-100 whitespace-nowrap"
                      >
                        スプレッドシート
                      </a>
                    )}
                    <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded">
                      {p.slug}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AuthLayout>
  );
}
