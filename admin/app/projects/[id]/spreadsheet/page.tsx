'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import AuthLayout from '@/components/AuthLayout';
import ProjectNav from '@/components/ProjectNav';

interface SheetData {
  headers: string[];
  rows: string[][];
  idColumn: string;
  displayColumns: string[];
  csvExists: boolean;
  lastUpdated?: string;
}

export default function SpreadsheetPreviewPage() {
  const { id } = useParams();
  const [project, setProject] = useState<any>(null);
  const [sheetData, setSheetData] = useState<SheetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [savingColumns, setSavingColumns] = useState(false);
  const [columnSuccess, setColumnSuccess] = useState('');

  const fetchProject = useCallback(() => {
    fetch(`/api/projects/${id}`)
      .then((r) => r.json())
      .then((d) => {
        setProject(d.project);
        const cols = (d.project?.spreadsheet_display_columns || '').split(',').map((c: string) => c.trim()).filter(Boolean);
        setSelectedColumns(cols);
      });
  }, [id]);

  const fetchCsv = useCallback(() => {
    setLoading(true);
    setError('');
    fetch(`/api/projects/${id}/spreadsheet`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) {
          setError(d.error);
        } else {
          setSheetData(d);
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    fetchProject();
    fetchCsv();
  }, [fetchProject, fetchCsv]);

  async function handleSync() {
    setSyncing(true);
    setError('');
    try {
      const res = await fetch(`/api/projects/${id}/spreadsheet`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      fetchCsv();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSyncing(false);
    }
  }

  function toggleColumn(col: string) {
    setSelectedColumns((prev) =>
      prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col]
    );
    setColumnSuccess('');
  }

  async function handleSaveColumns() {
    setSavingColumns(true);
    setColumnSuccess('');
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...project,
          spreadsheet_display_columns: selectedColumns.join(','),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setColumnSuccess('保存しました');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSavingColumns(false);
    }
  }

  const headers = sheetData?.headers || [];
  const rows = sheetData?.rows || [];
  const hasCsv = sheetData?.csvExists && headers.length > 0;

  return (
    <AuthLayout>
      <div className="max-w-full">
        <ProjectNav projectId={id as string} projectName={project?.name || '...'} />
        <div className="flex justify-between items-start mb-4">
          <h2 className="text-2xl font-bold">スプレッドシートデータ</h2>
          <div className="flex gap-2">
            <button
              onClick={handleSync}
              disabled={syncing}
              className="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700 text-sm disabled:opacity-50"
            >
              {syncing ? '同期中...' : 'スプレッドシートから再取得'}
            </button>
          </div>
        </div>

        {error && <div className="bg-red-50 text-red-600 p-3 rounded text-sm mb-4">{error}</div>}

        {/* Info bar */}
        {hasCsv && sheetData?.lastUpdated && (
          <div className="mb-3 text-xs text-gray-500 flex items-center gap-4">
            <span>{rows.length}行 x {headers.length}列</span>
            <span>最終同期: {new Date(sheetData.lastUpdated).toLocaleString('ja-JP')}</span>
          </div>
        )}

        {/* Column selection bar */}
        {hasCsv && (
          <div className="mb-4 p-3 bg-white rounded-lg shadow flex items-center gap-3 flex-wrap">
            <span className="text-sm font-medium whitespace-nowrap">記事一覧に表示:</span>
            <span className="text-xs text-gray-500">
              {selectedColumns.length > 0 ? selectedColumns.join(', ') : 'なし（ヘッダーのチェックボックスで選択）'}
            </span>
            <button
              onClick={handleSaveColumns}
              disabled={savingColumns}
              className="ml-auto bg-purple-600 text-white px-4 py-1.5 rounded text-sm hover:bg-purple-700 disabled:opacity-50 whitespace-nowrap"
            >
              {savingColumns ? '保存中...' : 'カラム設定を保存'}
            </button>
            {columnSuccess && <span className="text-xs text-green-600">{columnSuccess}</span>}
          </div>
        )}

        {/* Data table */}
        {loading ? (
          <p className="text-gray-500">読み込み中...</p>
        ) : !hasCsv ? (
          <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
            CSVデータがありません。「スプレッドシートから再取得」ボタンでダウンロードしてください。
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="overflow-x-auto max-h-[calc(100vh-250px)] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-gray-100">
                    <th className="p-2 text-left text-gray-500 border-b border-r whitespace-nowrap">#</th>
                    {headers.map((h, i) => (
                      <th
                        key={i}
                        className={`p-2 text-left border-b border-r whitespace-nowrap cursor-pointer transition ${
                          selectedColumns.includes(h)
                            ? 'bg-purple-100 text-purple-700 font-bold'
                            : 'text-gray-600 hover:bg-gray-200'
                        }`}
                        onClick={() => toggleColumn(h)}
                        title={selectedColumns.includes(h) ? `「${h}」を記事一覧から除外` : `「${h}」を記事一覧に追加`}
                      >
                        <span className="flex items-center gap-1">
                          <input
                            type="checkbox"
                            checked={selectedColumns.includes(h)}
                            onChange={() => toggleColumn(h)}
                            className="rounded text-purple-600"
                            onClick={(e) => e.stopPropagation()}
                          />
                          {h}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, ri) => (
                    <tr key={ri} className="hover:bg-gray-50 border-b">
                      <td className="p-2 text-gray-400 border-r">{ri + 1}</td>
                      {headers.map((h, ci) => (
                        <td
                          key={ci}
                          className={`p-2 border-r max-w-[300px] truncate ${
                            selectedColumns.includes(h) ? 'bg-purple-50' : ''
                          }`}
                          title={row[ci] || ''}
                        >
                          {row[ci] || ''}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </AuthLayout>
  );
}
