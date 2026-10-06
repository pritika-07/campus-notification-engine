import React, { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { format } from 'date-fns';
import api from '../lib/api';

export interface Subscriber {
  id: string;
  subscriberId: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  channels?: {
    email?: boolean;
    sms?: boolean;
    push?: boolean;
    in_app?: boolean;
  };
  deleted_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

type FormValues = {
  subscriberId: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  channels: {
    email: boolean;
    sms: boolean;
    push: boolean;
    in_app: boolean;
  };
};

const emptyForm: FormValues = {
  subscriberId: '',
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  channels: { email: true, sms: false, push: false, in_app: true },
};

const SubscribersPage: React.FC = () => {
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Subscriber | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<{ data?: Subscriber[] } | Subscriber[]>('/v2/subscribers');
      const list: Subscriber[] = Array.isArray(data) ? data : (data?.data ?? []);
      setSubscribers(list);
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to load subscribers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return subscribers;
    return subscribers.filter((s) => {
      return (
        s.subscriberId.toLowerCase().includes(q) ||
        (s.firstName ?? '').toLowerCase().includes(q) ||
        (s.lastName ?? '').toLowerCase().includes(q) ||
        (s.email ?? '').toLowerCase().includes(q) ||
        (s.phone ?? '').toLowerCase().includes(q)
      );
    });
  }, [subscribers, search]);

  const openCreate = () => {
    setEditing(null);
    setServerError(null);
    setModalOpen(true);
  };

  const openEdit = (s: Subscriber) => {
    setEditing(s);
    setServerError(null);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
  };

  const softDelete = async (s: Subscriber) => {
    if (!confirm(`Soft-delete subscriber "${s.subscriberId}"?`)) return;
    try {
      await api.delete(`/v2/subscribers/${s.id}`);
      void load();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to delete subscriber');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Subscribers</h1>
          <p className="text-sm text-slate-500 mt-1">Manage recipients and their channel preferences.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search subscribers…"
              className="input min-w-[260px] pl-9"
            />
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔎</span>
          </div>
          <button type="button" className="btn-primary" onClick={openCreate}>+ Add subscriber</button>
        </div>
      </div>

      {error && <div className="text-sm text-rose-600 bg-rose-50 rounded-lg px-3 py-2 border border-rose-100">{error}</div>}

      <div className="card !p-0 overflow-hidden">
        <div className="overflow-auto max-h-[calc(100vh-260px)]">
          <table className="table-root">
            <thead>
              <tr>
                <th>Subscriber ID</th>
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Channels</th>
                <th>Created</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-slate-500">Loading subscribers…</td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-slate-500">
                    {search ? 'No subscribers match your search.' : 'No subscribers yet. Add your first one.'}
                  </td>
                </tr>
              ) : (
                  filtered.map((s) => (
                    <tr key={s.id} className={s.deleted_at ? 'opacity-60' : ''}>
                      <td className="font-mono text-xs text-slate-700">{s.subscriberId}</td>
                      <td>{s.firstName || s.lastName ? `${s.firstName ?? ''} ${s.lastName ?? ''}`.trim() : <span className="text-slate-400">—</span>}</td>
                      <td>{s.email || <span className="text-slate-400">—</span>}</td>
                      <td>{s.phone || <span className="text-slate-400">—</span>}</td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                          {(['email','sms','push','in_app'] as const).map((ch) => (
                            <span key={ch} className={s.channels?.[ch] ? 'chip-info' : 'chip bg-slate-100 text-slate-500 ring-1 ring-inset ring-slate-300/50'}>
                              {ch}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="text-xs text-slate-500">{s.created_at ? format(new Date(s.created_at), 'MMM d, yyyy') : '—'}</td>
                      <td className="text-right whitespace-nowrap">
                        <div className="inline-flex gap-2 justify-end">
                          <button type="button" className="btn-secondary !px-3 !py-1.5 text-xs" onClick={() => openEdit(s)}>Edit</button>
                          <button type="button" className="btn-danger !px-3 !py-1.5 text-xs" onClick={() => softDelete(s)}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen && (
        <SubscriberForm
          initial={editing}
          serverError={serverError}
          setServerError={setServerError}
          onClose={closeModal}
          onSaved={() => {
            closeModal();
            void load();
          }}
        />
      )}
    </div>
  );
};

const SubscriberForm: React.FC<{
  initial: Subscriber | null;
  serverError: string | null;
  setServerError: (v: string | null) => void;
  onClose: () => void;
  onSaved: () => void;
}> = ({ initial, serverError, setServerError, onClose, onSaved }) => {
  const isEdit = Boolean(initial);
  const defaults: FormValues = initial
    ? {
        subscriberId: initial.subscriberId,
        firstName: initial.firstName,
        lastName: initial.lastName,
        email: initial.email,
        phone: initial.phone,
        channels: {
          email: initial.channels?.email ?? true,
          sms: initial.channels?.sms ?? false,
          push: initial.channels?.push ?? false,
          in_app: initial.channels?.['in_app'] ?? true,
        },
      }
    : emptyForm;

  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<FormValues>({ defaultValues: defaults });

  const watchChannels = watch('channels');

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    try {
      const payload = {
        subscriberId: values.subscriberId,
        firstName: values.firstName,
        lastName: values.lastName,
        email: values.email,
        phone: values.phone,
        channels: values.channels,
      };
      if (isEdit && initial) {
        await api.patch(`/v2/subscribers/${initial.id}`, payload);
      } else {
        await api.post('/v2/subscribers', payload);
      }
      onSaved();
    } catch (err: any) {
      setServerError(err?.response?.data?.message || err?.message || 'Failed to save subscriber');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <div className="relative w-full max-w-xl rounded-2xl shadow-2xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">{isEdit ? 'Edit subscriber' : 'Add subscriber'}</h2>
            <p className="text-sm text-slate-500 mt-0.5">Set contact details and channel preferences.</p>
          </div>
          <button type="button" className="btn-ghost" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
          {serverError && <div className="text-sm text-rose-600 bg-rose-50 rounded-lg px-3 py-2 border border-rose-100">{serverError}</div>}
          <div>
            <label className="label" htmlFor="subscriberId">Subscriber ID</label>
            <input id="subscriberId" className="input font-mono text-xs" placeholder="student-1234" {...register('subscriberId', { required: 'Subscriber ID is required' })} />
            {errors.subscriberId && <p className="mt-1 text-xs text-rose-600">{errors.subscriberId.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="firstName">First name</label>
              <input id="firstName" className="input" {...register('firstName')} />
            </div>
            <div>
              <label className="label" htmlFor="lastName">Last name</label>
              <input id="lastName" className="input" {...register('lastName')} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="email">Email</label>
              <input id="email" type="email" className="input" {...register('email')} />
            </div>
            <div>
              <label className="label" htmlFor="phone">Phone</label>
              <input id="phone" className="input" {...register('phone')} />
            </div>
          </div>
          <div>
            <div className="label mb-2">Channel preferences</div>
            <div className="grid grid-cols-2 gap-2">
              {(['email','sms','push','in_app'] as const).map((ch) => {
                const checked = watchChannels?.[ch];
                return (
                  <label key={ch} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 hover:bg-slate-50">
                    <span className="text-sm text-slate-700 capitalize">{ch === 'in_app' ? 'In-app' : ch}</span>
                    <input type="checkbox" className="sr-only peer" {...register(`channels.${ch}` as const)} />
                    <div
                      className="relative w-9 h-5 rounded-full transition-colors"
                      style={{ backgroundColor: checked ? '#4f46e5' : '#cbd5e1' }}
                    >
                      <div
                        className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                        style={{ transform: checked ? 'translateX(18px)' : 'translateX(2px)' }}
                      />
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" disabled={isSubmitting} className="btn-primary">{isSubmitting ? 'Saving…' : 'Save subscriber'}</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SubscribersPage;
