import React, { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import clsx from 'clsx';
import api from '../lib/api';

type Status = 'success' | 'error' | 'pending' | 'sending' | 'failed' | string;
type Channel = 'email' | 'sms' | 'push' | 'in_app' | string;

interface ActivityEntry {
  id: string;
  transactionId?: string;
  channel?: Channel;
  subscriber?: { id?: string; email?: string; subscriberId?: string; firstName?: string; lastName?: string };
  status?: Status;
  createdAt?: string;
  created_at?: string;
  metadata?: Record<string, unknown>;
}

const CHANNELS: Channel[] = ['email', 'sms', 'push', 'in_app'];
const STATUSES: Status[] = ['success', 'pending', 'error'];

const statusChip = (status: Status) => {
  const s = String(status).toLowerCase();
  if (s.includes('success') || s === 'sent') return 'chip-success';
  if (s.includes('error') || s.includes('fail')) return 'chip-error';
  if (s.includes('pending') || s.includes('send')) return 'chip-pending';
  return 'chip-info';
};

const ActivityPage: React.FC = () => {
  const [items, setItems] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [from, setFrom] = useState<string>('');
  const [to, setTo] = useState<string>('');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (channels.length) params.set('channels', channels.join(','));
      if (statuses.length) params.set('statuses', statuses.join(','));
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const qs = params.toString();
      const { data } = await api.get<{ data?: ActivityEntry[] } | ActivityEntry[]>(
        qs ? `/v1/activity?${qs}` : '/v1/activity',
      );
      const list: ActivityEntry[] = Array.isArray(data) ? data : (data?.data ?? []);
      setItems(list);
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to load activity');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [channels, statuses, from, to]);

  const toggle = <T,>(list: T[], setList: (next: T[]) => void, value: T) => {
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  };

  const sorted = useMemo(
    () => [...items].sort((a, b) => new Date(b.createdAt || b.created_at || 0).getTime() - new Date(a.createdAt || a.created_at || 0).getTime()),
    [items],
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Activity</h1>
        <p className="text-sm text-slate-500 mt-1">Monitor delivery activity across channels.</p>
      </div>

      <div className="card space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="label mb-2">Channels</div>
            <div className="flex flex-wrap gap-2">
              {CHANNELS.map((ch) => (
                <button
                  key={ch}
                  type="button"
                  onClick={() => toggle(channels, setChannels, ch)}
                  className={clsx(
                    'px-3 py-1.5 rounded-lg text-sm border transition-colors',
                    channels.includes(ch)
                      ? 'bg-indigo-50 border-indigo-200 text-indigo-700 font-medium'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50',
                  )}
                >
                  {ch === 'in_app' ? 'In-app' : ch}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="label mb-2">Status</div>
            <div className="flex flex-wrap gap-2">
              {STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggle(statuses, setStatuses, s)}
                  className={clsx(
                    'px-3 py-1.5 rounded-lg text-sm border transition-colors capitalize',
                    statuses.includes(s)
                      ? 'bg-indigo-50 border-indigo-200 text-indigo-700 font-medium'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50',
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="label" htmlFor="from">From date</label>
            <input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="to">To date</label>
            <input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input" />
          </div>
        </div>
      </div>

      {error && <div className="text-sm text-rose-600 bg-rose-50 rounded-lg px-3 py-2 border border-rose-100">{error}</div>}

      <div className="card !p-0 overflow-hidden">
        <div className="overflow-auto max-h-[calc(100vh-360px)]">
          <table className="table-root">
            <thead>
              <tr>
                <th>Transaction ID</th>
                <th>Channel</th>
                <th>Subscriber</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-slate-500">Loading activity…</td>
                </tr>
              ) : sorted.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-slate-500">No activity yet.</td>
                </tr>
              ) : (
                sorted.map((entry) => (
                  <tr key={entry.id}>
                    <td className="font-mono text-xs">{entry.transactionId || entry.id}</td>
                    <td className="capitalize">{entry.channel === 'in_app' ? 'In-app' : entry.channel || '—'}</td>
                    <td>
                      <div className="text-sm text-slate-700">
                        {entry.subscriber?.email ||
                          (entry.subscriber?.firstName || entry.subscriber?.lastName
                            ? `${entry.subscriber.firstName ?? ''} ${entry.subscriber.lastName ?? ''}`.trim()
                            : entry.subscriber?.subscriberId || '—')}
                      </div>
                      {entry.subscriber?.subscriberId && entry.subscriber.email && (
                        <div className="text-xs text-slate-500 font-mono">{entry.subscriber.subscriberId}</div>
                      )}
                    </td>
                    <td>
                      <span className={statusChip(entry.status || 'pending')}>{entry.status || 'pending'}</span>
                    </td>
                    <td className="text-xs text-slate-500">
                      {(entry.createdAt || entry.created_at)
                        ? format(new Date(entry.createdAt || entry.created_at!), 'MMM d, yyyy HH:mm')
                        : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ActivityPage;
