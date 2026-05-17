'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface ProjectNavProps {
  projectId: string | string[];
  projectName: string;
}

const navItems = [
  { key: 'articles', label: '記事一覧', path: '' },
  { key: 'all', label: '全記事', path: '/all' },
  { key: 'published', label: '公開記事', path: '/published' },
  { key: 'html', label: 'HTML検索', path: '/html' },
  { key: 'tasks', label: '修正タスク', path: '/tasks' },
  { key: 'spreadsheet', label: 'スプレッドシート', path: '/spreadsheet' },
  { key: 'categories', label: 'カテゴリ', path: '/categories' },
  { key: 'docs', label: 'ドキュメント', path: '/docs' },
  { key: 'settings', label: '設定', path: '/settings' },
];

export default function ProjectNav({ projectId, projectName }: ProjectNavProps) {
  const pathname = usePathname();
  const basePath = `/projects/${projectId}`;

  function isActive(itemPath: string) {
    if (itemPath === '') {
      return pathname === basePath;
    }
    return pathname.startsWith(`${basePath}${itemPath}`);
  }

  return (
    <div className="mb-6">
      <div className="flex items-center gap-3 mb-3">
        <Link href="/projects" className="text-blue-600 hover:underline text-sm">
          プロジェクト
        </Link>
        <span className="text-gray-400">/</span>
        <h2 className="text-xl font-bold">{projectName}</h2>
      </div>
      <nav className="flex gap-1 border-b border-gray-200">
        {navItems.map((item) => {
          const active = isActive(item.path);
          return (
            <Link
              key={item.key}
              href={`${basePath}${item.path}`}
              className={`px-3 py-2 text-sm rounded-t transition-colors ${
                active
                  ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-600 font-medium'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
