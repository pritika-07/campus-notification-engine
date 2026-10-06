import React, { useCallback, useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import clsx from 'clsx';
import api from '../lib/api';

type InboxStatus = 'unseen' | 'seen' | 'read' | 'archived' | string;

interface InboxMessage {
  id: string;
  subject?: string;
  body?: string;
  status?: InboxStatus;
  seen?: boolean;
  read?: boolean;
  archived?: boolean;
  createdAt?: string;
  created_at?: string;
  workflowId?: string;
  subscriberId?: string;
  transactionId?: string;
  metadata?: Record<string, unknown>;
}

const JWT_KEY = 'campus_jwt';

const readableStatus = (m: InboxMessage) => {
  if (m.archived || m.status === 'archived') return 'archived';
  if (m.read || m.status === 'read') return 'read';
  if (m.seen || m.status === 'seen') return 'seen';
  return 'unseen';
};

const InboxPage: React.FC = () => {
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const evSourceRef = useRef<{ close: () => void } | null>(null);
  const [connected, setConnected] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<{ data?: InboxMessage[] } | InboxMessage[]>('/v1/inbox');
      const list: InboxMessage[] = Array.isArray(data) ? data : (data?.data ?? []);
      setMessages(list);
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to load inbox');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const token = localStorage.getItem(JWT_KEY);
    if (!token) return;

    let closed = false;
    let abortController: AbortController | null = null;

    const setupNative = () => {
      const url = `/v1/sse`;
      const withAuth = new URL(url, window.location.origin);
      withAuth.searchParams.set('access_token', token);
      try {
        const NativeEventSource = window.EventSource;
        if (!NativeEventSource) return false;
        const es = new NativeEventSource(withAuth.toString(), { withCredentials: false });
        const onMessage = (event: MessageEvent) => {
          try {
            const parsed = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
            if (!parsed) return;
            handleEvent(parsed);
          } catch {
            // ignore parse errors
          }
        };
        const onNotification = (event: MessageEvent) => {
          try {
            const parsed = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
            if (!parsed) return;
            handleEvent(parsed);
          } catch {
            // ignore
          }
        };
        const onOpen = () => setConnected(true);
        const onError = () => {
          setConnected(false);
          es.close();
          fallbackFetch();
        };
        es.addEventListener('message', onMessage as EventListener);
        es.addEventListener('notification_received', onNotification as EventListener);
        es.addEventListener('open', onOpen as EventListener);
        es.addEventListener('error', onError as EventListener);
        evSourceRef.current = {
          close: () => {
            es.removeEventListener('message', onMessage as EventListener);
            es.removeEventListener('notification_received', onNotification as EventListener);
            es.removeEventListener('open', onOpen as EventListener);
            es.removeEventListener('error', onError as EventListener);
            es.close();
          },
        };
        return true;
      } catch {
        return false;
      }
    };

    const handleEvent = (payload: any) => {
      if (!payload) return;
      const eventName: string | undefined = payload.event || payload.type;
      const data = payload.message || payload.data || payload;
      if (eventName === 'notification_received' || payload.subject || payload.body) {
        const candidate: InboxMessage | undefined = Array.isArray(data) ? data[0] : data;
        if (candidate && (candidate.id || candidate.transactionId)) {
          setMessages((prev) => {
            const id: string = candidate.id || candidate.transactionId!;
            if (prev.some((m) => m.id === id)) return prev;
            const enriched: InboxMessage = {
              ...candidate,
              id,
              createdAt: candidate.createdAt || candidate.created_at || new Date().toISOString(),
            };
            return [enriched, ...prev];
          });
        }
      }
    };

    const fallbackFetch = async () => {
      try {
        abortController = new AbortController();
        const res = await fetch('/v1/sse', {
          headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
          signal: abortController.signal,
        });
        if (!res.ok || !res.body) {
          setConnected(false);
          return;
        }
        setConnected(true);
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (!closed) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const chunks = buffer.split(/\r?\n\r?\n/);
          buffer = chunks.pop() ?? '';
          for (const raw of chunks) {
            if (closed) break;
            const lines = raw.split(/\r?\n/);
            let eventName = 'message';
            let dataStr = '';
            for (const line of lines) {
              if (!line) continue;
              if (line.startsWith('event:')) eventName = line.slice(6).trim();
              else if (line.startsWith('data:')) dataStr += line.slice(5).trim();
            }
            if (!dataStr) continue;
            try {
              const parsed = JSON.parse(dataStr);
              handleEvent({ event: eventName, data: parsed });
            } catch {
              // ignore
            }
          }
        }
      } catch {
        setConnected(false);
      }
    };

    const ok = setupNative();
    if (!ok) void fallbackFetch();

    return () => {
      closed = true;
      if (evSourceRef.current) evSourceRef.current.close();
      if (abortController) abortController.abort();
    };
  }, []);

  const updateMessage = (id: string, patch: Partial<InboxMessage>) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  };

  const mark = async (m: InboxMessage, action: 'seen' | 'read' | 'archive') => {
    try {
      await api.post(`/v1/messages/${m.id}/${action}`);
      if (action === 'seen') updateMessage(m.id, { seen: true, status: 'seen' });
      if (action === 'read') updateMessage(m.id, { read: true, seen: true, status: 'read' });
      if (action === 'archive') updateMessage(m.id, { archived: true, status: 'archived' });
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || `Failed to mark ${action}`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Inbox</h1>
          <p className="text-sm text-slate-500 mt-1">In-app messages delivered to you.</p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className={clsx('w-2 h-2 rounded-full', connected ? 'bg-emerald-500' : 'bg-slate-400')} />
          <span className="text-slate-600">{connected ? 'Live updates' : 'Disconnected'}</span>
        </div>
      </div>

      {error && <div className="text-sm text-rose-600 bg-rose-50 rounded-lg px-3 py-2 border border-rose-100">{error}</div>}

      <div className="space-y-4">
        {loading ? (
          <div className="card text-center text-slate-500">Loading inbox…</div>
        ) : messages.length === 0 ? (
          <div className="card text-center">
            <div className="text-slate-500">No messages in your inbox.</div>
            <div className="text-xs text-slate-400 mt-1">New in-app notifications will appear here.</div>
          </div>
        ) : (
          messages.map((m) => {
            const status = readableStatus(m);
            const isArchived = status === 'archived';
            return (
              <article key={m.id} className={clsx('card', status === 'unseen' && 'ring-1 ring-indigo-200')}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className={clsx('text-base font-semibold text-slate-900 truncate', status === 'unseen' && 'text-slate-900')}>
                        {m.subject || '(no subject)'}
                      </h3>
                      <span
                        className={clsx(
                          'chip',
                          status === 'archived' ? 'bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-300/60'
                            : status === 'read' ? 'chip-info'
                            : status === 'seen' ? 'bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-300/60'
                            : 'chip-pending',
                        )}
                      >
                        {status}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      {(m.createdAt || m.created_at) ? format(new Date(m.createdAt || m.created_at!), 'MMM d, yyyy HH:mm') : ''}
                      {m.subscriberId && <span className="ml-2 font-mono text-slate-400">· {m.subscriberId}</span>}
                    </p>
                    <p className={clsx('mt-3 text-sm whitespace-pre-wrap break-words', status === 'unseen' ? 'text-slate-800' : 'text-slate-600')}>
                      {m.body || 'No content.'}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    {status === 'unseen' && (
                      <button type="button" className="btn-secondary !px-3 !py-1.5 text-xs" onClick={() => mark(m, 'seen')}>Mark seen</button>
                    )}
                    {status !== 'read' && status !== 'archived' && (
                      <button type="button" className="btn-secondary !px-3 !py-1.5 text-xs" onClick={() => mark(m, 'read')}>Mark read</button>
                    )}
                    {!isArchived && (
                      <button type="button" className="btn-ghost !px-3 !py-1.5 text-xs text-slate-600" onClick={() => mark(m, 'archive')}>Archive</button>
                    )}
                  </div>
                </div>
              </article>
            );
          })
        )}
      </div>
    </div>
  );
};

export default InboxPage;
