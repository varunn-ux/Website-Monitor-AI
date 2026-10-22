'use client';

import { useEffect, useState } from 'react';
import { BellRing, CheckCircle2, Clock3, Mail, XCircle } from 'lucide-react';
import type { EmailNotificationEvent, EmailNotificationStatus } from '@/types';

type Props = { siteUrl: string; refreshKey: string };

const statusStyles: Record<EmailNotificationStatus, string> = {
  pending: 'bg-blue-50 text-blue-800',
  accepted: 'bg-emerald-50 text-emerald-800',
  failed: 'bg-red-50 text-red-800',
  skipped: 'bg-slate-100 text-slate-700',
};

function statusLabel(status: EmailNotificationStatus) {
  if (status === 'accepted') return 'Accepted by Resend';
  if (status === 'pending') return 'Pending';
  if (status === 'failed') return 'Failed';
  return 'Skipped';
}

function StatusIcon({ status }: { status: EmailNotificationStatus }) {
  if (status === 'accepted') return <CheckCircle2 size={14}/>;
  if (status === 'failed') return <XCircle size={14}/>;
  if (status === 'pending') return <Clock3 size={14}/>;
  return <Mail size={14}/>;
}

export function EmailNotificationHistory({ siteUrl, refreshKey }: Props) {
  const [events, setEvents] = useState<EmailNotificationEvent[]>([]);
  const [message, setMessage] = useState('Loading notification history…');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    setReady(false);
    setMessage('Loading notification history…');
    fetch(`/api/email-history?siteUrl=${encodeURIComponent(siteUrl)}`, { cache: 'no-store' })
      .then(async (response) => {
        const result = await response.json() as { ready?: boolean; events?: EmailNotificationEvent[]; reason?: string };
        if (!response.ok || !result.ready) throw new Error(result.reason || 'Notification history is unavailable.');
        if (!active) return;
        setEvents(result.events ?? []);
        setReady(true);
        setMessage(result.events?.length ? '' : 'No notification events have been recorded for this website.');
      })
      .catch((error) => {
        if (!active) return;
        setMessage(error instanceof Error ? error.message : 'Notification history is unavailable.');
      });
    return () => { active = false; };
  }, [siteUrl, refreshKey]);

  return (
    <section id="email-history" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="email-history-title">
      <div className="flex items-center gap-3">
        <span className="rounded-xl bg-brand-50 p-2 text-brand-700"><BellRing size={18}/></span>
        <div>
          <h2 id="email-history-title" className="font-bold text-slate-900">Email notification history</h2>
          <p className="mt-1 text-xs text-slate-500">Notification attempts for {siteUrl}.</p>
        </div>
      </div>
      {message && <p role="status" className={`mt-4 rounded-xl p-3 text-sm ${ready ? 'bg-slate-50 text-slate-600' : 'bg-amber-50 text-amber-900'}`}>{message}</p>}
      {events.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead><tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500"><th className="pb-3 pr-4 font-semibold">When</th><th className="pb-3 pr-4 font-semibold">Type</th><th className="pb-3 pr-4 font-semibold">Reason</th><th className="pb-3 pr-4 font-semibold">Status</th><th className="pb-3 font-semibold">Details</th></tr></thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id} className="border-b border-slate-100 last:border-0">
                  <td className="py-3 pr-4 text-xs text-slate-600">{new Date(event.createdAt).toLocaleString()}</td>
                  <td className="py-3 pr-4 text-slate-700">{event.notificationType.replace(/-/g, ' ')}</td>
                  <td className="max-w-xs py-3 pr-4 text-xs text-slate-600">{event.triggerReason}</td>
                  <td className="py-3 pr-4"><span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyles[event.status]}`}><StatusIcon status={event.status}/>{statusLabel(event.status)}</span></td>
                  <td className="max-w-xs py-3 text-xs text-slate-500">{event.errorReason || (event.status === 'accepted' ? 'Resend accepted the request; final delivery is not confirmed.' : event.providerMessageId ? `Provider reference: ${event.providerMessageId}` : '—')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
