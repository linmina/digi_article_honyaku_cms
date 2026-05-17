'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import AuthLayout from '@/components/AuthLayout';
import ProjectNav from '@/components/ProjectNav';

type SortKey = 'article_id' | 'keywords' | 'status' | 'category_id' | 'created_at';
type SortDir = 'asc' | 'desc';

interface Category {
  id: number;
  name: string;
}

interface Article {
  id: number;
  article_id: number;
  keywords: string;
  status: string;
  result_url: string;
  article_doc_url: string;
  factcheck_doc_url: string;
  category_id: number | null;
  scheduled_at: string | null;
  created_at: string;
}

interface Project {
  id: number;
  name: string;
  slug: string;
  description: string;
  spreadsheet_url: string;
  spreadsheet_sheet_name: string;
  spreadsheet_id_column: string;
  spreadsheet_display_columns: string;
  cms_base_url: string;
}

interface SheetData {
  headers: string[];
  rows: string[][];
  idColumn: string;
  displayColumns: string[];
  csvExists: boolean;
  lastUpdated?: string;
}

const statusBadge: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-700',
  running: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
};

const statusLabel: Record<string, string> = {
  pending: '待機中',
  running: '実行中',
  completed: '完了',
  failed: '失敗',
};

function extractSpreadsheetId(url: string): string | null {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

function buildRowUrl(spreadsheetUrl: string, rowNumber: number): string {
  const id = extractSpreadsheetId(spreadsheetUrl);
  if (!id) return spreadsheetUrl;
  return `https://docs.google.com/spreadsheets/d/${id}/edit#gid=0&range=A${rowNumber}`;
}

export default function ProjectDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newArticleId, setNewArticleId] = useState('');
  const [newKeywords, setNewKeywords] = useState('');
  const [newCategoryId, setNewCategoryId] = useState('');
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [executing, setExecuting] = useState<number | null>(null);
  const [logVisible, setLogVisible] = useState<Set<number>>(new Set());
  const [articleLogs, setArticleLogs] = useState<Record<number, { phase: string; log: string; status: string; logFile?: string } | null>>({});

  // Timer state
  const [showTimerPicker, setShowTimerPicker] = useState<number | null>(null);
  const [timerCountdowns, setTimerCountdowns] = useState<Record<number, string>>({});
  const [timerDate, setTimerDate] = useState('');
  const [timerHour, setTimerHour] = useState('');
  const [timerMinute, setTimerMinute] = useState('');

  // Bulk selection & bulk timer
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showBulkTimer, setShowBulkTimer] = useState(false);
  const [bulkTimerDate, setBulkTimerDate] = useState('');
  const [bulkTimerHour, setBulkTimerHour] = useState('');
  const [bulkTimerMinute, setBulkTimerMinute] = useState('');
  const [bulkTimerInterval, setBulkTimerInterval] = useState('0');

  // Sort & Filter
  const [sortKey, setSortKey] = useState<SortKey>('article_id');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterKeyword, setFilterKeyword] = useState<string>('');
  const [filterCategory, setFilterCategory] = useState<string>('');

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  const sortIndicator = (key: SortKey) => {
    if (sortKey !== key) return <span className="text-gray-300 ml-1">&#x21C5;</span>;
    return <span className="ml-1">{sortDir === 'asc' ? '\u25B2' : '\u25BC'}</span>;
  };

  const filteredAndSorted = useMemo(() => {
    let list = [...articles];

    // Filter
    if (filterStatus) {
      list = list.filter((a) => a.status === filterStatus);
    }
    if (filterKeyword) {
      const kw = filterKeyword.toLowerCase();
      list = list.filter((a) => a.keywords.toLowerCase().includes(kw) || a.article_id.toString().includes(kw));
    }
    if (filterCategory) {
      if (filterCategory === '__none__') {
        list = list.filter((a) => a.category_id === null);
      } else {
        list = list.filter((a) => a.category_id === parseInt(filterCategory));
      }
    }

    // Sort
    const statusOrder: Record<string, number> = { running: 0, pending: 1, failed: 2, completed: 3 };
    list.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'article_id':
          cmp = a.article_id - b.article_id;
          break;
        case 'keywords':
          cmp = a.keywords.localeCompare(b.keywords, 'ja');
          break;
        case 'status':
          cmp = (statusOrder[a.status] ?? 99) - (statusOrder[b.status] ?? 99);
          break;
        case 'category_id':
          cmp = (a.category_id ?? 9999) - (b.category_id ?? 9999);
          break;
        case 'created_at':
          cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return list;
  }, [articles, sortKey, sortDir, filterStatus, filterKeyword, filterCategory]);

  // CSV data
  const [sheetData, setSheetData] = useState<SheetData | null>(null);
  const [sheetLoading, setSheetLoading] = useState(false);
  const [sheetError, setSheetError] = useState('');
  const [syncing, setSyncing] = useState(false);

  const fetchData = useCallback(() => {
    Promise.all([
      fetch(`/api/projects/${id}`).then((r) => r.json()),
      fetch(`/api/projects/${id}/categories`).then((r) => r.json()),
    ]).then(([d, catData]) => {
      setProject(d.project);
      setArticles(d.articles || []);
      setCategories(catData.categories || []);
    }).finally(() => setLoading(false));
  }, [id]);

  const fetchCsv = useCallback(() => {
    setSheetLoading(true);
    setSheetError('');
    fetch(`/api/projects/${id}/spreadsheet`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) {
          setSheetError(d.error);
        } else {
          setSheetData(d);
        }
      })
      .catch((e) => setSheetError(e.message))
      .finally(() => setSheetLoading(false));
  }, [id]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Load local CSV data once
  useEffect(() => {
    if (project) {
      fetchCsv();
    }
  }, [project?.id, fetchCsv]);

  // Fetch logs for articles with log checkbox enabled
  useEffect(() => {
    if (logVisible.size === 0) return;
    const fetchLogs = () => {
      logVisible.forEach((articleRowId) => {
        fetch(`/api/articles/${articleRowId}`)
          .then((r) => r.json())
          .then((d) => {
            const latestJob = d.jobs?.[0];
            if (latestJob) {
              setArticleLogs((prev) => ({
                ...prev,
                [articleRowId]: { phase: latestJob.phase || '', log: latestJob.log || '', status: latestJob.status || '', logFile: latestJob.log_file || '' },
              }));
            } else {
              setArticleLogs((prev) => ({ ...prev, [articleRowId]: null }));
            }
          })
          .catch(() => {});
      });
    };
    fetchLogs();
    const interval = setInterval(fetchLogs, 3000);
    return () => clearInterval(interval);
  }, [logVisible]);

  // Timer countdown & auto-execute
  useEffect(() => {
    const scheduledArticles = articles.filter((a) => a.scheduled_at && a.status === 'pending');
    if (scheduledArticles.length === 0) {
      setTimerCountdowns({});
      return;
    }

    const tick = () => {
      const now = Date.now();
      const newCountdowns: Record<number, string> = {};
      scheduledArticles.forEach((a) => {
        if (!a.scheduled_at) return;
        const target = new Date(a.scheduled_at).getTime();
        const diff = target - now;
        if (diff <= 0) {
          // Time's up - execute
          executeArticle(a.id);
          // Clear schedule
          fetch(`/api/articles/${a.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ scheduled_at: null }),
          });
        } else {
          const h = Math.floor(diff / 3600000);
          const m = Math.floor((diff % 3600000) / 60000);
          const s = Math.floor((diff % 60000) / 1000);
          newCountdowns[a.id] = h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
        }
      });
      setTimerCountdowns(newCountdowns);
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [articles]);

  function openTimerPicker(articleRowId: number) {
    if (showTimerPicker === articleRowId) {
      setShowTimerPicker(null);
      return;
    }
    // デフォルト: 現在から1時間後
    const def = new Date(Date.now() + 3600000);
    setTimerDate(def.toISOString().slice(0, 10));
    setTimerHour(String(def.getHours()).padStart(2, '0'));
    setTimerMinute(String(def.getMinutes()).padStart(2, '0'));
    setShowTimerPicker(articleRowId);
  }

  async function confirmSchedule(articleRowId: number) {
    if (!timerDate || timerHour === '' || timerMinute === '') {
      alert('日付・時・分をすべて入力してください');
      return;
    }
    const scheduled = new Date(`${timerDate}T${timerHour.padStart(2, '0')}:${timerMinute.padStart(2, '0')}:00`);
    if (scheduled.getTime() <= Date.now()) {
      alert('未来の日時を指定してください');
      return;
    }
    await fetch(`/api/articles/${articleRowId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scheduled_at: scheduled.toISOString() }),
    });
    setShowTimerPicker(null);
    fetchData();
  }

  async function cancelSchedule(articleRowId: number) {
    await fetch(`/api/articles/${articleRowId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scheduled_at: null }),
    });
    fetchData();
  }

  // Bulk selection helpers
  const selectableArticles = useMemo(() =>
    filteredAndSorted.filter((a) => a.status !== 'running'),
    [filteredAndSorted]
  );

  function toggleSelect(articleId: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(articleId)) next.delete(articleId);
      else next.add(articleId);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === selectableArticles.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(selectableArticles.map((a) => a.id)));
    }
  }

  function openBulkTimer() {
    const def = new Date(Date.now() + 3600000);
    setBulkTimerDate(def.toISOString().slice(0, 10));
    setBulkTimerHour(String(def.getHours()).padStart(2, '0'));
    setBulkTimerMinute(String(def.getMinutes()).padStart(2, '0'));
    setBulkTimerInterval('0');
    setShowBulkTimer(true);
  }

  async function confirmBulkSchedule() {
    if (!bulkTimerDate || bulkTimerHour === '' || bulkTimerMinute === '') {
      alert('日付・時・分をすべて入力してください');
      return;
    }
    const baseTime = new Date(`${bulkTimerDate}T${bulkTimerHour.padStart(2, '0')}:${bulkTimerMinute.padStart(2, '0')}:00`);
    if (baseTime.getTime() <= Date.now()) {
      alert('未来の日時を指定してください');
      return;
    }
    const intervalMin = parseInt(bulkTimerInterval) || 0;
    // Sort selected articles by article_id for consistent ordering
    const targets = filteredAndSorted.filter((a) => selectedIds.has(a.id));
    const promises = targets.map((a, idx) => {
      const scheduled = new Date(baseTime.getTime() + idx * intervalMin * 60000);
      return fetch(`/api/articles/${a.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduled_at: scheduled.toISOString() }),
      });
    });
    await Promise.all(promises);
    setShowBulkTimer(false);
    setSelectedIds(new Set());
    fetchData();
  }

  async function cancelBulkSchedule() {
    const targets = filteredAndSorted.filter((a) => selectedIds.has(a.id) && a.scheduled_at);
    const promises = targets.map((a) =>
      fetch(`/api/articles/${a.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduled_at: null }),
      })
    );
    await Promise.all(promises);
    setSelectedIds(new Set());
    fetchData();
  }

  function toggleLog(articleRowId: number) {
    setLogVisible((prev) => {
      const next = new Set(prev);
      if (next.has(articleRowId)) {
        next.delete(articleRowId);
      } else {
        next.add(articleRowId);
      }
      return next;
    });
  }

  async function handleSyncCsv() {
    setSyncing(true);
    setSheetError('');
    try {
      const res = await fetch(`/api/projects/${id}/spreadsheet`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      // Reload CSV data
      fetchCsv();
    } catch (e: any) {
      setSheetError(e.message);
    } finally {
      setSyncing(false);
    }
  }

  function getSheetRowForArticle(articleId: number): { rowNumber: number; rowData: Record<string, string> } | null {
    if (!sheetData || sheetData.headers.length === 0) return null;
    const { headers, rows, idColumn } = sheetData;

    let colIndex = headers.indexOf(idColumn);
    if (colIndex === -1) {
      const letterIndex = idColumn.toUpperCase().charCodeAt(0) - 65;
      if (letterIndex >= 0 && letterIndex < 26) colIndex = letterIndex;
    }
    if (colIndex === -1) return null;

    for (let i = 0; i < rows.length; i++) {
      if (rows[i][colIndex]?.toString() === articleId.toString()) {
        const rowData: Record<string, string> = {};
        headers.forEach((h, idx) => { rowData[h] = rows[i][idx] || ''; });
        return { rowNumber: i + 2, rowData };
      }
    }
    return null;
  }

  function getDisplayColumns(): string[] {
    if (!sheetData) return [];
    if (sheetData.displayColumns.length > 0) return sheetData.displayColumns;
    return [];
  }

  async function addArticle(e: React.FormEvent) {
    e.preventDefault();

    if (bulkMode) {
      // Parse bulk text: each line is "id|keywords|category_id"
      const lines = bulkText.trim().split('\n').filter(line => line.trim());
      if (lines.length === 0) return;

      const articles = lines.map(line => {
        const parts = line.split('|').map(s => s.trim());
        return {
          article_id: parseInt(parts[0]),
          keywords: parts[1] || '',
          category_id: parts[2] ? parseInt(parts[2]) : null,
        };
      });

      const invalid = articles.filter(a => isNaN(a.article_id) || !a.keywords);
      if (invalid.length > 0) {
        alert('無効な行があります。形式: ID|キーワード|カテゴリID');
        return;
      }

      const res = await fetch('/api/articles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: parseInt(id as string),
          articles,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setShowAddForm(false);
        setBulkText('');
        fetchData();
        alert(`${data.count}件の記事を登録しました`);
      }
    } else {
      const res = await fetch('/api/articles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: parseInt(id as string),
          article_id: parseInt(newArticleId),
          keywords: newKeywords,
          category_id: newCategoryId ? parseInt(newCategoryId) : null,
        }),
      });
      if (res.ok) {
        setShowAddForm(false);
        setNewArticleId('');
        setNewKeywords('');
        setNewCategoryId('');
        fetchData();
      }
    }
  }

  async function executeArticle(articleRowId: number) {
    setExecuting(articleRowId);
    try {
      const withLog = logVisible.has(articleRowId);
      const res = await fetch('/api/articles/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ article_row_id: articleRowId, with_log: withLog }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || '実行に失敗しました');
      }
      fetchData();
    } finally {
      setExecuting(null);
    }
  }

  async function updateArticleCategory(articleRowId: number, categoryId: string) {
    await fetch(`/api/articles/${articleRowId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category_id: categoryId ? parseInt(categoryId) : null }),
    });
    fetchData();
  }

  const [stopping, setStopping] = useState<number | null>(null);

  async function stopArticle(articleRowId: number) {
    if (!confirm('実行中のプロセスを停止しますか？')) return;
    setStopping(articleRowId);
    try {
      const res = await fetch('/api/articles/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ article_row_id: articleRowId }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || '停止に失敗しました');
      }
      fetchData();
    } finally {
      setStopping(null);
    }
  }

  async function updateArticleStatus(articleRowId: number, status: string) {
    await fetch(`/api/articles/${articleRowId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    fetchData();
  }

  const [resetConfirmId, setResetConfirmId] = useState<number | null>(null);

  async function resetArticleStatus(articleRowId: number) {
    await fetch(`/api/articles/${articleRowId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reset_status: true }),
    });
    setResetConfirmId(null);
    fetchData();
  }

  async function deleteArticle(articleRowId: number) {
    if (!confirm('この記事を削除しますか？')) return;
    await fetch(`/api/articles/${articleRowId}`, { method: 'DELETE' });
    fetchData();
  }

  if (loading) {
    return <AuthLayout><p className="text-gray-500">読み込み中...</p></AuthLayout>;
  }

  if (!project) {
    return <AuthLayout><p className="text-red-500">プロジェクトが見つかりません</p></AuthLayout>;
  }

  const displayCols = getDisplayColumns();
  const hasCsv = sheetData?.csvExists && sheetData.headers.length > 0;

  return (
    <AuthLayout>
      <div className="max-w-full">
        <ProjectNav projectId={id as string} projectName={project.name} />
        <div className="flex justify-between items-start mb-6">
          <p className="text-sm text-gray-500">{project.description}</p>
          <div className="flex gap-2">
            {project.spreadsheet_url && (
              <>
                <button
                  onClick={handleSyncCsv}
                  disabled={syncing}
                  className="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700 text-sm disabled:opacity-50"
                >
                  {syncing ? '同期中...' : 'CSV同期'}
                </button>
                <a
                  href={project.spreadsheet_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-purple-50 text-purple-600 px-4 py-2 rounded hover:bg-purple-100 text-sm"
                >
                  スプレッドシート(外部)
                </a>
              </>
            )}
          </div>
        </div>

        {/* CSV status bar */}
        {project.spreadsheet_url && (
          <div className="mb-4 text-xs text-gray-500 flex items-center gap-3">
            {sheetLoading && <span>CSV読み込み中...</span>}
            {sheetError && <span className="text-red-500">CSV: {sheetError}</span>}
            {hasCsv && sheetData?.lastUpdated && (
              <span>CSV最終同期: {new Date(sheetData.lastUpdated).toLocaleString('ja-JP')} ({sheetData.rows.length}行)</span>
            )}
            {sheetData && !sheetData.csvExists && !sheetLoading && (
              <span className="text-yellow-600">CSVが未ダウンロードです。「CSV同期」ボタンまたは設定画面からダウンロードしてください。</span>
            )}
          </div>
        )}

        {/* Article list */}
        <div className="bg-white rounded-lg shadow">
          <div className="flex justify-between items-center p-4 border-b">
            <h3 className="font-semibold">記事一覧</h3>
            <button
              onClick={() => setShowAddForm(true)}
              className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm hover:bg-blue-700"
            >
              + 記事追加
            </button>
          </div>

          {/* Filter bar */}
          <div className="p-3 border-b bg-gray-50 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-gray-500">検索:</label>
              <input
                type="text"
                value={filterKeyword}
                onChange={(e) => setFilterKeyword(e.target.value)}
                placeholder="ID / キーワード"
                className="border rounded px-2 py-1 text-xs w-40"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-gray-500">ステータス:</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="border rounded px-2 py-1 text-xs"
              >
                <option value="">すべて</option>
                <option value="pending">待機中</option>
                <option value="running">実行中</option>
                <option value="completed">完了</option>
                <option value="failed">失敗</option>
              </select>
            </div>
            {categories.length > 0 && (
              <div className="flex items-center gap-1.5">
                <label className="text-xs text-gray-500">カテゴリ:</label>
                <select
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                  className="border rounded px-2 py-1 text-xs"
                >
                  <option value="">すべて</option>
                  <option value="__none__">未選択</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>
            )}
            {(filterStatus || filterKeyword || filterCategory) && (
              <button
                onClick={() => { setFilterStatus(''); setFilterKeyword(''); setFilterCategory(''); }}
                className="text-xs text-blue-600 hover:underline"
              >
                クリア
              </button>
            )}
            <span className="text-xs text-gray-400 ml-auto">
              {filteredAndSorted.length} / {articles.length} 件
            </span>
          </div>

          {/* Bulk action bar */}
          {selectedIds.size > 0 && (
            <div className="p-3 border-b bg-amber-50 flex flex-wrap items-center gap-3">
              <span className="text-xs font-medium text-amber-800">
                {selectedIds.size}件選択中
              </span>
              <button
                onClick={openBulkTimer}
                className="bg-amber-500 text-white px-3 py-1 rounded text-xs hover:bg-amber-600"
              >
                &#9202; 一括タイマー設定
              </button>
              {filteredAndSorted.some((a) => selectedIds.has(a.id) && a.scheduled_at) && (
                <button
                  onClick={cancelBulkSchedule}
                  className="bg-red-100 text-red-600 px-3 py-1 rounded text-xs hover:bg-red-200"
                >
                  一括タイマー取消
                </button>
              )}
              <button
                onClick={() => setSelectedIds(new Set())}
                className="text-xs text-gray-500 hover:text-gray-700"
              >
                選択解除
              </button>
            </div>
          )}

          {/* Bulk timer modal */}
          {showBulkTimer && (
            <div className="p-4 border-b bg-amber-50">
              <div className="max-w-md">
                <p className="text-sm font-semibold text-amber-800 mb-3">
                  &#9202; 一括タイマー設定（{selectedIds.size}件）
                </p>
                <div className="space-y-2">
                  <div>
                    <label className="block text-xs text-gray-600 mb-0.5">日付</label>
                    <input
                      type="date"
                      value={bulkTimerDate}
                      onChange={(e) => setBulkTimerDate(e.target.value)}
                      min={new Date().toISOString().slice(0, 10)}
                      className="border rounded px-2 py-1 text-sm w-full"
                    />
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="block text-xs text-gray-600 mb-0.5">時</label>
                      <select
                        value={bulkTimerHour}
                        onChange={(e) => setBulkTimerHour(e.target.value)}
                        className="border rounded px-2 py-1 text-sm w-full"
                      >
                        {Array.from({ length: 24 }, (_, i) => (
                          <option key={i} value={String(i).padStart(2, '0')}>
                            {String(i).padStart(2, '0')}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs text-gray-600 mb-0.5">分</label>
                      <select
                        value={bulkTimerMinute}
                        onChange={(e) => setBulkTimerMinute(e.target.value)}
                        className="border rounded px-2 py-1 text-sm w-full"
                      >
                        {Array.from({ length: 60 }, (_, i) => (
                          <option key={i} value={String(i).padStart(2, '0')}>
                            {String(i).padStart(2, '0')}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-0.5">記事間の間隔（分）</label>
                    <select
                      value={bulkTimerInterval}
                      onChange={(e) => setBulkTimerInterval(e.target.value)}
                      className="border rounded px-2 py-1 text-sm w-full"
                    >
                      <option value="0">同時（間隔なし）</option>
                      <option value="5">5分ずつ</option>
                      <option value="10">10分ずつ</option>
                      <option value="15">15分ずつ</option>
                      <option value="30">30分ずつ</option>
                      <option value="60">1時間ずつ</option>
                      <option value="120">2時間ずつ</option>
                      <option value="180">3時間ずつ</option>
                    </select>
                    {parseInt(bulkTimerInterval) > 0 && selectedIds.size > 1 && (
                      <p className="text-xs text-gray-500 mt-1">
                        1件目: {bulkTimerHour}:{bulkTimerMinute} 〜 最後({selectedIds.size}件目): {(() => {
                          const last = new Date(
                            new Date(`${bulkTimerDate}T${bulkTimerHour}:${bulkTimerMinute}:00`).getTime()
                            + (selectedIds.size - 1) * parseInt(bulkTimerInterval) * 60000
                          );
                          return `${String(last.getHours()).padStart(2, '0')}:${String(last.getMinutes()).padStart(2, '0')}`;
                        })()}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={confirmBulkSchedule}
                    className="bg-amber-500 text-white px-4 py-1.5 rounded text-sm hover:bg-amber-600"
                  >
                    設定
                  </button>
                  <button
                    onClick={() => setShowBulkTimer(false)}
                    className="bg-gray-100 text-gray-600 px-4 py-1.5 rounded text-sm hover:bg-gray-200"
                  >
                    キャンセル
                  </button>
                </div>
              </div>
            </div>
          )}

          {showAddForm && (
            <form onSubmit={addArticle} className="p-4 bg-blue-50 border-b">
              <div className="flex gap-2 mb-3">
                <button
                  type="button"
                  onClick={() => setBulkMode(false)}
                  className={`px-3 py-1 rounded text-sm ${!bulkMode ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`}
                >
                  単一追加
                </button>
                <button
                  type="button"
                  onClick={() => setBulkMode(true)}
                  className={`px-3 py-1 rounded text-sm ${bulkMode ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`}
                >
                  一括追加
                </button>
              </div>

              {bulkMode ? (
                <div>
                  <label className="block text-xs font-medium mb-1">
                    一括登録（1行ずつ: ID|キーワード|カテゴリID）
                  </label>
                  <textarea
                    value={bulkText}
                    onChange={(e) => setBulkText(e.target.value)}
                    placeholder={`230|賃貸 間取り 見方|1\n231|マンスリーマンション|2\n232|ホテルマン 向いている人|\n233|一人暮らし 費用|1`}
                    className="border rounded px-3 py-1.5 text-sm w-full font-mono"
                    rows={6}
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">カテゴリIDは省略可。{categories.length > 0 && `カテゴリ: ${categories.map(c => `${c.id}=${c.name}`).join(', ')}`}</p>
                </div>
              ) : (
                <div className="flex gap-3 items-end">
                  <div>
                    <label className="block text-xs font-medium mb-1">管理画面ID</label>
                    <input
                      type="number"
                      value={newArticleId}
                      onChange={(e) => setNewArticleId(e.target.value)}
                      className="border rounded px-3 py-1.5 text-sm w-24"
                      required
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs font-medium mb-1">キーワード（スペース区切り）</label>
                    <input
                      type="text"
                      value={newKeywords}
                      onChange={(e) => setNewKeywords(e.target.value)}
                      placeholder="賃貸 間取り 見方"
                      className="border rounded px-3 py-1.5 text-sm w-full"
                      required
                    />
                  </div>
                  {categories.length > 0 && (
                    <div>
                      <label className="block text-xs font-medium mb-1">カテゴリ</label>
                      <select
                        value={newCategoryId}
                        onChange={(e) => setNewCategoryId(e.target.value)}
                        className="border rounded px-3 py-1.5 text-sm"
                      >
                        <option value="">未選択</option>
                        {categories.map((cat) => (
                          <option key={cat.id} value={cat.id}>{cat.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-2 mt-3">
                <button type="submit" className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm hover:bg-blue-700">
                  {bulkMode ? '一括追加' : '追加'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowAddForm(false); setBulkMode(false); }}
                  className="text-gray-500 hover:text-gray-700 text-sm"
                >
                  キャンセル
                </button>
              </div>
            </form>
          )}

          {articles.length === 0 ? (
            <div className="p-8 text-center text-gray-500">記事がありません</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-sm text-gray-500 border-b">
                    <th className="p-3 w-8">
                      <input
                        type="checkbox"
                        checked={selectableArticles.length > 0 && selectedIds.size === selectableArticles.length}
                        onChange={toggleSelectAll}
                        className="w-4 h-4 rounded border-gray-300 text-amber-500 focus:ring-amber-400"
                      />
                    </th>
                    <th className="p-3 cursor-pointer select-none hover:text-gray-700" onClick={() => handleSort('article_id')}>
                      ID{sortIndicator('article_id')}
                    </th>
                    <th className="p-3 cursor-pointer select-none hover:text-gray-700" onClick={() => handleSort('keywords')}>
                      キーワード{sortIndicator('keywords')}
                    </th>
                    {categories.length > 0 && (
                      <th className="p-3 cursor-pointer select-none hover:text-gray-700" onClick={() => handleSort('category_id')}>
                        カテゴリ{sortIndicator('category_id')}
                      </th>
                    )}
                    <th className="p-3 cursor-pointer select-none hover:text-gray-700" onClick={() => handleSort('status')}>
                      ステータス{sortIndicator('status')}
                    </th>
                    <th className="p-3">記事Doc</th>
                    <th className="p-3">校閲Doc</th>
                    <th className="p-3">CMS</th>
                    {project.spreadsheet_url && hasCsv && <th className="p-3">スプシ</th>}
                    {hasCsv && displayCols.map((col) => (
                      <th key={col} className="p-3 text-xs whitespace-nowrap">{col}</th>
                    ))}
                    <th className="p-3 cursor-pointer select-none hover:text-gray-700" onClick={() => handleSort('created_at')}>
                      作成日時{sortIndicator('created_at')}
                    </th>
                    <th className="p-3">ログ</th>
                    <th className="p-3">アクション</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAndSorted.map((a) => {
                    const sheetRow = hasCsv ? getSheetRowForArticle(a.article_id) : null;
                    return (
                      <React.Fragment key={a.id}>
                      <tr className={`border-b hover:bg-gray-50 ${selectedIds.has(a.id) ? 'bg-amber-50/50' : ''}`}>
                        <td className="p-3">
                          {a.status !== 'running' ? (
                            <input
                              type="checkbox"
                              checked={selectedIds.has(a.id)}
                              onChange={() => toggleSelect(a.id)}
                              className="w-4 h-4 rounded border-gray-300 text-amber-500 focus:ring-amber-400"
                            />
                          ) : (
                            <span className="w-4 h-4 inline-block" />
                          )}
                        </td>
                        <td className="p-3 text-sm font-mono">{a.article_id}</td>
                        <td className="p-3 text-sm">{a.keywords}</td>
                        {categories.length > 0 && (
                          <td className="p-3 text-sm">
                            <select
                              value={a.category_id ?? ''}
                              onChange={(e) => updateArticleCategory(a.id, e.target.value)}
                              className="border rounded px-2 py-0.5 text-xs bg-white"
                            >
                              <option value="">未選択</option>
                              {categories.map((cat) => (
                                <option key={cat.id} value={cat.id}>{cat.name}</option>
                              ))}
                            </select>
                          </td>
                        )}
                        <td className="p-3">
                          <select
                            value={a.status}
                            onChange={(e) => updateArticleStatus(a.id, e.target.value)}
                            disabled={a.status === 'running'}
                            className={`text-xs px-2 py-1 rounded border-0 cursor-pointer ${statusBadge[a.status] || ''} ${a.status === 'running' ? 'opacity-70 cursor-not-allowed' : ''}`}
                          >
                            <option value="pending">待機中</option>
                            <option value="running">実行中</option>
                            <option value="completed">完了</option>
                            <option value="failed">失敗</option>
                          </select>
                        </td>
                        <td className="p-3 text-sm">
                          {a.article_doc_url ? (
                            <a href={a.article_doc_url} target="_blank" rel="noopener noreferrer"
                              className="inline-block bg-blue-50 text-blue-600 px-2 py-0.5 rounded text-xs hover:bg-blue-100">
                              記事
                            </a>
                          ) : <span className="text-gray-300">-</span>}
                        </td>
                        <td className="p-3 text-sm">
                          {a.factcheck_doc_url ? (
                            <a href={a.factcheck_doc_url} target="_blank" rel="noopener noreferrer"
                              className="inline-block bg-orange-50 text-orange-600 px-2 py-0.5 rounded text-xs hover:bg-orange-100">
                              校閲
                            </a>
                          ) : <span className="text-gray-300">-</span>}
                        </td>
                        <td className="p-3 text-sm">
                          {project.cms_base_url ? (
                            <a href={`${project.cms_base_url}/${a.article_id}`} target="_blank" rel="noopener noreferrer"
                              className="inline-block bg-green-50 text-green-600 px-2 py-0.5 rounded text-xs hover:bg-green-100">
                              CMS
                            </a>
                          ) : <span className="text-gray-300">-</span>}
                        </td>
                        {project.spreadsheet_url && hasCsv && (
                          <td className="p-3 text-sm">
                            {sheetRow ? (
                              <a href={buildRowUrl(project.spreadsheet_url, sheetRow.rowNumber)}
                                target="_blank" rel="noopener noreferrer"
                                className="inline-block bg-purple-50 text-purple-600 px-2 py-0.5 rounded text-xs hover:bg-purple-100">
                                行{sheetRow.rowNumber}
                              </a>
                            ) : <span className="text-gray-300">-</span>}
                          </td>
                        )}
                        {hasCsv && displayCols.map((col) => (
                          <td key={col} className="p-3 text-xs text-gray-600 whitespace-nowrap max-w-[200px] truncate">
                            {sheetRow?.rowData[col] || '-'}
                          </td>
                        ))}
                        <td className="p-3 text-sm text-gray-500 whitespace-nowrap">
                          {new Date(a.created_at).toLocaleString('ja-JP')}
                        </td>
                        <td className="p-3">
                          <label className="flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={logVisible.has(a.id)}
                              onChange={() => toggleLog(a.id)}
                              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-xs text-gray-500">表示</span>
                          </label>
                        </td>
                        <td className="p-3">
                          <div className="flex gap-2 items-center">
                            {a.status !== 'running' && a.status !== 'completed' && !a.scheduled_at && (
                              <>
                                <button
                                  onClick={() => executeArticle(a.id)}
                                  disabled={executing === a.id}
                                  className="bg-green-600 text-white px-3 py-1 rounded text-xs hover:bg-green-700 disabled:opacity-50"
                                >
                                  {executing === a.id ? '開始中...' : '実行'}
                                </button>
                                <div className="relative">
                                  <button
                                    onClick={() => openTimerPicker(a.id)}
                                    className="bg-amber-500 text-white px-2 py-1 rounded text-xs hover:bg-amber-600"
                                    title="タイマー設定"
                                  >
                                    &#9202;
                                  </button>
                                  {showTimerPicker === a.id && (
                                    <div className="absolute right-0 top-8 z-50 bg-white border rounded-lg shadow-lg p-3 w-64">
                                      <p className="text-xs font-semibold text-gray-700 mb-2">実行予定タイマー</p>
                                      <div className="space-y-2">
                                        <div>
                                          <label className="block text-xs text-gray-500 mb-0.5">日付</label>
                                          <input
                                            type="date"
                                            value={timerDate}
                                            onChange={(e) => setTimerDate(e.target.value)}
                                            min={new Date().toISOString().slice(0, 10)}
                                            className="border rounded px-2 py-1 text-xs w-full"
                                          />
                                        </div>
                                        <div className="flex gap-2">
                                          <div className="flex-1">
                                            <label className="block text-xs text-gray-500 mb-0.5">時</label>
                                            <select
                                              value={timerHour}
                                              onChange={(e) => setTimerHour(e.target.value)}
                                              className="border rounded px-2 py-1 text-xs w-full"
                                            >
                                              {Array.from({ length: 24 }, (_, i) => (
                                                <option key={i} value={String(i).padStart(2, '0')}>
                                                  {String(i).padStart(2, '0')}
                                                </option>
                                              ))}
                                            </select>
                                          </div>
                                          <div className="flex-1">
                                            <label className="block text-xs text-gray-500 mb-0.5">分</label>
                                            <select
                                              value={timerMinute}
                                              onChange={(e) => setTimerMinute(e.target.value)}
                                              className="border rounded px-2 py-1 text-xs w-full"
                                            >
                                              {Array.from({ length: 60 }, (_, i) => (
                                                <option key={i} value={String(i).padStart(2, '0')}>
                                                  {String(i).padStart(2, '0')}
                                                </option>
                                              ))}
                                            </select>
                                          </div>
                                        </div>
                                      </div>
                                      <div className="flex gap-2 mt-3">
                                        <button
                                          onClick={() => confirmSchedule(a.id)}
                                          className="bg-amber-500 text-white px-3 py-1 rounded text-xs hover:bg-amber-600 flex-1"
                                        >
                                          設定
                                        </button>
                                        <button
                                          onClick={() => setShowTimerPicker(null)}
                                          className="bg-gray-100 text-gray-600 px-3 py-1 rounded text-xs hover:bg-gray-200"
                                        >
                                          閉じる
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </>
                            )}
                            {a.scheduled_at && a.status === 'pending' && (
                              <div className="flex items-center gap-1.5">
                                <span className="bg-amber-100 text-amber-700 px-2 py-1 rounded text-xs font-mono font-medium animate-pulse">
                                  &#9202; {timerCountdowns[a.id] || '...'}
                                </span>
                                <button
                                  onClick={() => cancelSchedule(a.id)}
                                  className="text-red-400 hover:text-red-600 text-xs"
                                  title="タイマー取消"
                                >
                                  &#10005;
                                </button>
                              </div>
                            )}
                            {a.status === 'running' && (
                              <button
                                onClick={() => stopArticle(a.id)}
                                disabled={stopping === a.id}
                                className="bg-red-600 text-white px-3 py-1 rounded text-xs hover:bg-red-700 disabled:opacity-50"
                              >
                                {stopping === a.id ? '停止中...' : '停止'}
                              </button>
                            )}
                            {a.status !== 'pending' && a.status !== 'running' && (
                              <button
                                onClick={() => setResetConfirmId(a.id)}
                                className="bg-gray-100 text-gray-600 px-3 py-1 rounded text-xs hover:bg-gray-200"
                              >
                                リセット
                              </button>
                            )}
                            <Link
                              href={`/projects/${id}/articles/${a.id}`}
                              className="bg-gray-200 text-gray-700 px-3 py-1 rounded text-xs hover:bg-gray-300"
                            >
                              詳細
                            </Link>
                            {a.status !== 'running' && !a.scheduled_at && (
                              <button
                                onClick={() => deleteArticle(a.id)}
                                className="text-red-500 hover:text-red-700 text-xs px-2"
                              >
                                削除
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {logVisible.has(a.id) && (
                        <tr key={`log-${a.id}`} className="bg-gray-50">
                          <td colSpan={99} className="p-3">
                            {articleLogs[a.id] ? (
                              <div>
                                <div className="flex items-center gap-3 mb-2">
                                  <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                                    articleLogs[a.id]!.status === 'completed' ? 'bg-green-100 text-green-700' :
                                    articleLogs[a.id]!.status === 'running' ? 'bg-blue-100 text-blue-700' :
                                    articleLogs[a.id]!.status === 'failed' ? 'bg-red-100 text-red-700' :
                                    'bg-gray-100 text-gray-700'
                                  }`}>
                                    {articleLogs[a.id]!.status}
                                  </span>
                                  {articleLogs[a.id]!.phase && (
                                    <span className="text-xs text-blue-600 font-medium">
                                      {articleLogs[a.id]!.phase}
                                    </span>
                                  )}
                                  {articleLogs[a.id]!.logFile && (
                                    <span className="text-xs text-gray-400 font-mono">
                                      {articleLogs[a.id]!.logFile}
                                    </span>
                                  )}
                                </div>
                                <pre className="bg-gray-900 text-green-400 p-3 rounded text-xs overflow-x-auto max-h-64 overflow-y-auto whitespace-pre-wrap">
                                  {articleLogs[a.id]!.log || 'ログなし'}
                                </pre>
                              </div>
                            ) : (
                              <p className="text-xs text-gray-400">まだ実行されていません</p>
                            )}
                          </td>
                        </tr>
                      )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Reset confirm modal */}
      {resetConfirmId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-xl p-6 w-80">
            <p className="text-sm font-semibold text-gray-800 mb-2">ステータスをリセット</p>
            <p className="text-sm text-gray-600 mb-4">
              この記事のステータスを「待機中」に戻します。よろしいですか？
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setResetConfirmId(null)}
                className="bg-gray-100 text-gray-600 px-4 py-1.5 rounded text-sm hover:bg-gray-200"
              >
                キャンセル
              </button>
              <button
                onClick={() => resetArticleStatus(resetConfirmId)}
                className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm hover:bg-blue-700"
              >
                リセットする
              </button>
            </div>
          </div>
        </div>
      )}
    </AuthLayout>
  );
}
