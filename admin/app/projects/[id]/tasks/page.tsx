'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import AuthLayout from '@/components/AuthLayout';
import ProjectNav from '@/components/ProjectNav';

interface Task {
  id: number;
  project_id: number;
  article_id: number;
  article_ids: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  suggested_content: string;
  created_at: string;
  updated_at: string;
}

interface Project {
  id: number;
  name: string;
}

const statusOptions = [
  { value: 'open', label: '未対応', color: 'bg-yellow-100 text-yellow-700' },
  { value: 'in_progress', label: '対応中', color: 'bg-blue-100 text-blue-700' },
  { value: 'done', label: '完了', color: 'bg-green-100 text-green-700' },
  { value: 'cancelled', label: 'キャンセル', color: 'bg-gray-100 text-gray-700' },
];

const priorityOptions = [
  { value: 'high', label: '高', color: 'text-red-600' },
  { value: 'medium', label: '中', color: 'text-yellow-600' },
  { value: 'low', label: '低', color: 'text-gray-500' },
];

function getArticleIds(task: Task): string[] {
  if (task.article_ids) {
    return task.article_ids.split(',').map((s) => s.trim()).filter(Boolean);
  }
  if (task.article_id) {
    return [String(task.article_id)];
  }
  return [];
}

export default function TasksPage() {
  const { id } = useParams();
  const searchParams = useSearchParams();
  const presetArticleId = searchParams.get('article_id') || '';

  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterArticleId, setFilterArticleId] = useState(presetArticleId);

  // New task form
  const [showForm, setShowForm] = useState(false);
  const [formArticleIds, setFormArticleIds] = useState(presetArticleId);
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formPriority, setFormPriority] = useState('medium');
  const [saving, setSaving] = useState(false);

  // Edit
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editArticleIds, setEditArticleIds] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editStatus, setEditStatus] = useState('');
  const [editPriority, setEditPriority] = useState('');

  // AI suggestion
  const [suggestingId, setSuggestingId] = useState<number | null>(null);
  const [viewSuggestion, setViewSuggestion] = useState<Task | null>(null);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterStatus) params.set('status', filterStatus);
      if (filterArticleId) params.set('article_id', filterArticleId);
      const res = await fetch(`/api/projects/${id}/tasks?${params}`);
      const data = await res.json();
      setTasks(data.tasks || []);
    } catch {
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, [id, filterStatus, filterArticleId]);

  useEffect(() => {
    fetch(`/api/projects/${id}`).then((r) => r.json()).then((d) => setProject(d.project));
  }, [id]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!formTitle) return;
    setSaving(true);
    try {
      await fetch(`/api/projects/${id}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          article_ids: formArticleIds,
          title: formTitle,
          description: formDescription,
          priority: formPriority,
        }),
      });
      setFormTitle('');
      setFormDescription('');
      setFormArticleIds('');
      setFormPriority('medium');
      setShowForm(false);
      fetchTasks();
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate() {
    if (!editingTask) return;
    setSaving(true);
    try {
      await fetch(`/api/projects/${id}/tasks/${editingTask.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          article_ids: editArticleIds,
          title: editTitle,
          description: editDescription,
          status: editStatus,
          priority: editPriority,
        }),
      });
      setEditingTask(null);
      fetchTasks();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(taskId: number) {
    if (!confirm('このタスクを削除しますか？')) return;
    await fetch(`/api/projects/${id}/tasks/${taskId}`, { method: 'DELETE' });
    fetchTasks();
  }

  async function handleSuggest(task: Task) {
    setSuggestingId(task.id);
    try {
      const res = await fetch(`/api/projects/${id}/tasks/${task.id}/suggest`, { method: 'POST' });
      const data = await res.json();
      if (data.suggestion) {
        fetchTasks();
        setViewSuggestion({ ...task, suggested_content: data.suggestion });
      } else {
        alert('提案の生成に失敗しました');
      }
    } catch {
      alert('提案の生成に失敗しました');
    } finally {
      setSuggestingId(null);
    }
  }

  function openEdit(task: Task) {
    setEditingTask(task);
    setEditArticleIds(task.article_ids || String(task.article_id || ''));
    setEditTitle(task.title);
    setEditDescription(task.description);
    setEditStatus(task.status);
    setEditPriority(task.priority);
  }

  function getStatusBadge(status: string) {
    const opt = statusOptions.find((s) => s.value === status);
    return opt ? (
      <span className={`px-2 py-0.5 rounded text-xs ${opt.color}`}>{opt.label}</span>
    ) : (
      <span className="px-2 py-0.5 rounded text-xs bg-gray-100">{status}</span>
    );
  }

  function getPriorityLabel(priority: string) {
    const opt = priorityOptions.find((p) => p.value === priority);
    return opt ? (
      <span className={`text-xs font-medium ${opt.color}`}>{opt.label}</span>
    ) : (
      <span className="text-xs">{priority}</span>
    );
  }

  return (
    <AuthLayout>
      <div className="space-y-6">
        <ProjectNav projectId={id as string} projectName={project?.name || '...'} />
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">修正タスク管理</h1>
            {filterArticleId && (
              <p className="text-sm text-gray-500 mt-1">
                記事ID: {filterArticleId} を含むタスク
              </p>
            )}
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
          >
            {showForm ? 'キャンセル' : '新規タスク'}
          </button>
        </div>

        {/* Filters */}
        <div className="flex gap-4 items-center">
          <div className="flex gap-2 items-center">
            <label className="text-sm text-gray-600">ステータス:</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="border rounded px-2 py-1 text-sm"
            >
              <option value="">すべて</option>
              {statusOptions.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2 items-center">
            <label className="text-sm text-gray-600">記事ID:</label>
            <input
              type="text"
              value={filterArticleId}
              onChange={(e) => setFilterArticleId(e.target.value)}
              placeholder="すべて"
              className="border rounded px-2 py-1 text-sm w-24"
            />
          </div>
        </div>

        {/* New Task Form */}
        {showForm && (
          <form onSubmit={handleCreate} className="bg-white rounded-lg shadow p-4 space-y-3">
            <h3 className="font-medium text-gray-800">新規修正タスク</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-600 mb-1">対象記事ID（カンマ区切りで複数可）</label>
                <input
                  type="text"
                  value={formArticleIds}
                  onChange={(e) => setFormArticleIds(e.target.value)}
                  className="w-full border rounded px-2 py-1 text-sm"
                  placeholder="例: 101, 205, 310"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">優先度</label>
                <select
                  value={formPriority}
                  onChange={(e) => setFormPriority(e.target.value)}
                  className="w-full border rounded px-2 py-1 text-sm"
                >
                  {priorityOptions.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">タイトル *</label>
              <input
                type="text"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                className="w-full border rounded px-2 py-1 text-sm"
                placeholder="例: SEOキーワードの追加、情報の更新"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">説明</label>
              <textarea
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                className="w-full border rounded px-2 py-1 text-sm"
                rows={3}
                placeholder="修正の詳細、修正意図、対象箇所などを記載"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-3 py-1 border rounded text-sm"
              >
                キャンセル
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? '保存中...' : '作成'}
              </button>
            </div>
          </form>
        )}

        {/* Task List */}
        {loading ? (
          <div className="text-center py-8 text-gray-500">読み込み中...</div>
        ) : tasks.length === 0 ? (
          <div className="text-center py-8 text-gray-500">タスクがありません</div>
        ) : (
          <div className="space-y-3">
            {tasks.map((task) => {
              const ids = getArticleIds(task);
              return (
                <div key={task.id} className="bg-white rounded-lg shadow p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        {getStatusBadge(task.status)}
                        {getPriorityLabel(task.priority)}
                        {ids.length > 0 && (
                          <span className="text-xs text-gray-400">
                            対象記事:
                            {ids.map((aid, i) => (
                              <Link
                                key={i}
                                href={`/projects/${id}/all?search=${aid}`}
                                className="ml-1 px-1.5 py-0.5 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                              >
                                {aid}
                              </Link>
                            ))}
                          </span>
                        )}
                      </div>
                      <h3 className="font-medium text-gray-900">{task.title}</h3>
                      {task.description && (
                        <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">{task.description}</p>
                      )}
                      <div className="text-xs text-gray-400 mt-2">
                        作成: {new Date(task.created_at).toLocaleString('ja-JP')}
                        {task.suggested_content && ' | AI提案あり'}
                      </div>
                    </div>
                    <div className="flex gap-1 ml-4">
                      <button
                        onClick={() => handleSuggest(task)}
                        disabled={suggestingId === task.id}
                        className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs hover:bg-purple-200 disabled:opacity-50"
                      >
                        {suggestingId === task.id ? 'AI分析中...' : 'AI提案'}
                      </button>
                      {task.suggested_content && (
                        <button
                          onClick={() => setViewSuggestion(task)}
                          className="px-2 py-1 bg-indigo-100 text-indigo-700 rounded text-xs hover:bg-indigo-200"
                        >
                          提案表示
                        </button>
                      )}
                      <button
                        onClick={() => openEdit(task)}
                        className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs hover:bg-gray-200"
                      >
                        編集
                      </button>
                      <button
                        onClick={() => handleDelete(task.id)}
                        className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs hover:bg-red-200"
                      >
                        削除
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Edit Modal */}
        {editingTask && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6 space-y-4">
              <h3 className="font-bold text-lg">タスク編集</h3>
              <div>
                <label className="block text-xs text-gray-600 mb-1">対象記事ID（カンマ区切りで複数可）</label>
                <input
                  type="text"
                  value={editArticleIds}
                  onChange={(e) => setEditArticleIds(e.target.value)}
                  className="w-full border rounded px-2 py-1 text-sm"
                  placeholder="例: 101, 205, 310"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">タイトル</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full border rounded px-2 py-1 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">説明</label>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="w-full border rounded px-2 py-1 text-sm"
                  rows={4}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">ステータス</label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value)}
                    className="w-full border rounded px-2 py-1 text-sm"
                  >
                    {statusOptions.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">優先度</label>
                  <select
                    value={editPriority}
                    onChange={(e) => setEditPriority(e.target.value)}
                    className="w-full border rounded px-2 py-1 text-sm"
                  >
                    {priorityOptions.map((p) => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setEditingTask(null)}
                  className="px-3 py-2 border rounded text-sm"
                >
                  キャンセル
                </button>
                <button
                  onClick={handleUpdate}
                  disabled={saving}
                  className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? '保存中...' : '保存'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Suggestion Modal */}
        {viewSuggestion && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[80vh] flex flex-col">
              <div className="flex items-center justify-between px-4 py-3 border-b">
                <h3 className="font-bold">AI修正提案 - {viewSuggestion.title}</h3>
                <button
                  onClick={() => setViewSuggestion(null)}
                  className="text-gray-400 hover:text-gray-600 text-xl"
                >
                  &times;
                </button>
              </div>
              <div className="flex-1 overflow-auto p-4">
                <div className="prose max-w-none text-sm whitespace-pre-wrap">
                  {viewSuggestion.suggested_content}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AuthLayout>
  );
}
