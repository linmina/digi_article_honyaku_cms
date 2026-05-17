'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import AuthLayout from '@/components/AuthLayout';
import ProjectNav from '@/components/ProjectNav';

type DocType = 'check' | 'content';

export default function ProjectDocsPage() {
  const { id } = useParams();
  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<DocType>('check');
  const [checkDoc, setCheckDoc] = useState('');
  const [contentDoc, setContentDoc] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetch(`/api/projects/${id}`)
      .then((r) => r.json())
      .then((d) => {
        setProject(d.project);
        setCheckDoc(d.project?.doc_check || '');
        setContentDoc(d.project?.doc_content || '');
      })
      .finally(() => setLoading(false));
  }, [id]);

  async function handleSave() {
    setSaving(true);
    setMessage('');
    try {
      const body: Record<string, string> = {};
      if (activeTab === 'check') {
        body.doc_check = checkDoc;
      } else {
        body.doc_content = contentDoc;
      }

      const res = await fetch(`/api/projects/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...project, ...body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMessage('保存しました');
    } catch (e: any) {
      setMessage(`エラー: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <AuthLayout><p className="text-gray-500">読み込み中...</p></AuthLayout>;
  if (!project) return <AuthLayout><p className="text-red-500">Not found</p></AuthLayout>;

  const tabs: { key: DocType; label: string; description: string }[] = [
    { key: 'check', label: '校閲ガイドライン (check.md)', description: '編集ガイドライン・ファクトチェック基準' },
    { key: 'content', label: 'コンテンツDB (content.md)', description: '編集部との議論内容・記事生成の参照データ' },
  ];

  return (
    <AuthLayout>
      <div className="max-w-5xl">
        <ProjectNav projectId={id as string} projectName={project.name} />

        {/* Tabs */}
        <div className="flex border-b mb-4">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => { setActiveTab(tab.key); setMessage(''); }}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition ${
                activeTab === tab.key
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="bg-white rounded-lg shadow">
          <div className="p-4 border-b">
            <p className="text-sm text-gray-500">
              {tabs.find((t) => t.key === activeTab)?.description}
            </p>
          </div>

          <div className="p-4">
            <textarea
              value={activeTab === 'check' ? checkDoc : contentDoc}
              onChange={(e) => {
                if (activeTab === 'check') setCheckDoc(e.target.value);
                else setContentDoc(e.target.value);
                setMessage('');
              }}
              className="w-full h-[600px] border rounded px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
              placeholder={activeTab === 'check'
                ? '校閲ガイドラインをMarkdownで記述...'
                : 'コンテンツDBをMarkdownで記述...'}
            />
          </div>

          <div className="p-4 border-t flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 disabled:opacity-50 text-sm"
            >
              {saving ? '保存中...' : '保存'}
            </button>
            {message && (
              <span className={`text-sm ${message.startsWith('エラー') ? 'text-red-600' : 'text-green-600'}`}>
                {message}
              </span>
            )}
          </div>
        </div>
      </div>
    </AuthLayout>
  );
}
