import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';
import api from '../lib/api';
import clsx from 'clsx';
import WorkflowEditorPage from './WorkflowEditorPage';

export interface WorkflowStep {
  id?: string;
  type: 'in_app' | 'email';
  subject?: string;
  body?: string;
}

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  status: 'active' | 'draft' | 'inactive';
  active: boolean;
  steps_count?: number;
  steps?: WorkflowStep[];
  created_at?: string;
  updated_at?: string;
}

const WorkflowsPage: React.FC = () => {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingWorkflow, setEditingWorkflow] = useState<Workflow | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<{ data?: Workflow[] } | Workflow[]>('/v2/workflows');
      const list: Workflow[] = Array.isArray(data) ? data : (data?.data ?? []);
      setWorkflows(list);
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to load workflows');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const toggleActive = async (wf: Workflow) => {
    try {
      const nextActive = !wf.active;
      await api.patch(`/v2/workflows/${wf.id}`, { active: nextActive });
      setWorkflows((prev) => prev.map((w) => (w.id === wf.id ? { ...w, active: nextActive, status: nextActive ? 'active' : 'inactive' } : w)));
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to update workflow');
    }
  };

  const remove = async (wf: Workflow) => {
    if (!confirm(`Delete workflow "${wf.name}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/v2/workflows/${wf.id}`);
      setWorkflows((prev) => prev.filter((w) => w.id !== wf.id));
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to delete workflow');
    }
  };

  const openCreate = () => {
    setEditingWorkflow(null);
    setEditorOpen(true);
  };

  const openEdit = (wf: Workflow) => {
    setEditingWorkflow(wf);
    setEditorOpen(true);
  };

  const closeEditor = () => {
    setEditorOpen(false);
    setEditingWorkflow(null);
    void load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Workflows</h1>
          <p className="text-sm text-slate-500 mt-1">Create and manage notification workflows.</p>
        </div>
        <button type="button" className="btn-primary" onClick={openCreate}>
          + Create workflow
        </button>
      </div>

      {error && <div className="text-sm text-rose-600 bg-rose-50 rounded-lg px-3 py-2 border border-rose-100">{error}</div>}

      <div className="card !p-0 overflow-hidden">
        <div className="overflow-auto max-h-[calc(100vh-220px)]">
          <table className="table-root">
            <thead>
              <tr>
              <th>Name</th>
              <th>Status</th>
              <th>Active</th>
              <th>Steps</th>
              <th>Created</th>
              <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-slate-500">
                    Loading workflows…
                  </td>
                </tr>
              ) : workflows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-slate-500">
                    No workflows yet. Create your first one.
                  </td>
                </tr>
              ) : (
                  workflows.map((wf) => (
                    <tr key={wf.id}>
                      <td>
                      <div className="font-medium text-slate-900">{wf.name}</div>
                      {wf.description && <div className="text-xs text-slate-500 mt-0.5">{wf.description}</div>}
                    </td>
                    <td>
                      <span className={clsx(
                        'chip',
                        wf.status === 'active' ? 'chip-success' : wf.status === 'draft' ? 'chip-pending' : 'chip-info',
                      )}>
                        {wf.status}
                      </span>
                    </td>
                    <td>
                      <label className="inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          className="sr-only peer"
                          checked={wf.active}
                          onChange={() => toggleActive(wf)}
                        />
                        <div className={clsx(
                          'relative w-10 h-6 rounded-full transition-colors',
                          wf.active ? 'bg-indigo-600' : 'bg-slate-300',
                        )}>
                          <div className={clsx(
                            'absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform',
                            wf.active ? 'translate-x-4' : 'translate-x-0.5',
                          )} />
                        </div>
                      </label>
                    </td>
                    <td className="text-slate-700">{wf.steps_count ?? wf.steps?.length ?? 0}</td>
                    <td className="text-slate-500 text-xs">
                      {wf.created_at ? format(new Date(wf.created_at), 'MMM d, yyyy HH:mm') : '—'}
                    </td>
                    <td className="text-right whitespace-nowrap">
                      <div className="inline-flex gap-2 justify-end">
                        <button type="button" className="btn-secondary !px-3 !py-1.5 text-xs" onClick={() => openEdit(wf)}>Edit</button>
                        <button type="button" className="btn-danger !px-3 !py-1.5 text-xs" onClick={() => remove(wf)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editorOpen && (
        <WorkflowEditorPage
          initial={editingWorkflow}
          onClose={closeEditor}
        />
      )}
    </div>
  );
};

export default WorkflowsPage;
