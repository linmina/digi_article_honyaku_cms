'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

interface SidebarProps {
  user: { id: number; username: string; role: string } | null;
}

const navItems = [
  { href: '/projects', label: 'プロジェクト', icon: '📁' },
  { href: '/users', label: 'ユーザー管理', icon: '👤', adminOnly: true },
];

export default function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  }

  return (
    <aside className="w-64 bg-gray-900 text-white min-h-screen flex flex-col">
      <div className="p-4 border-b border-gray-700">
        <h1 className="text-lg font-bold">Writer Check</h1>
        <p className="text-xs text-gray-400 mt-1">管理画面</p>
      </div>
      <nav className="flex-1 p-4 space-y-1">
        {navItems
          .filter((item) => !item.adminOnly || user?.role === 'admin')
          .map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2 px-3 py-2 rounded text-sm ${
                  active ? 'bg-gray-700 text-white' : 'text-gray-300 hover:bg-gray-800'
                }`}
              >
                <span>{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
      </nav>
      <div className="p-4 border-t border-gray-700">
        <div className="text-sm text-gray-300 mb-2">
          {user?.username}
          {user?.role === 'admin' && (
            <span className="ml-2 text-xs bg-yellow-600 text-white px-1.5 py-0.5 rounded">admin</span>
          )}
        </div>
        <button
          onClick={handleLogout}
          className="text-sm text-gray-400 hover:text-white"
        >
          ログアウト
        </button>
      </div>
    </aside>
  );
}
