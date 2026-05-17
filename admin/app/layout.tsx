import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Writer Check Admin',
  description: '記事作成・校閲・入稿 管理画面',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
