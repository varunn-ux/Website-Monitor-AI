'use client';

import { useEffect, useMemo, useState } from 'react';
import { Search, Filter, ArrowDownAZ, Layers3, ExternalLink, Save, UserRound, ClipboardList } from 'lucide-react';
import type { IssueDetail, IssueSeverity, IssueTrackingRecord, IssueWorkflowStatus } from '@/types';
import { getCmsGuidance } from '@/lib/cms-guidance';
import { getIssueTrackingKey } from '@/lib/issue-tracking';

type Props = { issues: IssueDetail[]; siteUrl: string };
type Group = { key: string; items: IssueDetail[]; highestSeverity: IssueSeverity };
const severityRank: Record<IssueSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
const categoryLabels: Record<string, string> = { availability: 'Availability', links: 'Links', seo: 'SEO', performance: 'Performance', accessibility: 'Accessibility', 'best-practices': 'Best practices' };
const statusLabels: Record<IssueWorkflowStatus, string> = { open: 'Open', in_progress: 'In progress', fixed: 'Fixed', ignored: 'Ignored' };

function normalizedTitle(issue: IssueDetail) {
  return issue.title.toLowerCase().replace(/mobile performance score is \d+\/100/g, 'mobile performance score').replace(/\b\d+\/100\b/g, 'score').replace(/\b\d+(?:\.\d+)?\s*(?:ms|s|kb|kib|mb)\b/g, 'measurement').replace(/\s+/g, ' ').trim();
}
function issueKey(issue: IssueDetail) { return `${issue.category}|${normalizedTitle(issue)}`; }
function highestSeverity(items: IssueDetail[]): IssueSeverity { return items.reduce((best, issue) => severityRank[issue.severity] < severityRank[best] ? issue.severity : best, 'low' as IssueSeverity); }
function severityClass(severity: IssueSeverity) {
  if (severity === 'critical') return 'bg-red-100 text-red-900';
  if (severity === 'high') return 'bg-red-50 text-red-700';
  if (severity === 'medium') return 'bg-amber-50 text-amber-800';
  return 'bg-slate-100 text-slate-700';
}

function IssueWorkflowControls({ issue, siteUrl, record, onSaved }: { issue: IssueDetail; siteUrl: string; record?: IssueTrackingRecord; onSaved: (record: IssueTrackingRecord) => void }) {
  const trackingKey = getIssueTrackingKey(issue);
  const [status, setStatus] = useState<IssueWorkflowStatus>(record?.status ?? 'open');
  const [owner, setOwner] = useState(record?.owner ?? '');
  const [notes, setNotes] = useState(record?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    setStatus(record?.status ?? 'open'); setOwner(record?.owner ?? ''); setNotes(record?.notes ?? '');
  }, [trackingKey, record?.updatedAt]);

  async function saveWorkflow() {
    setSaving(true); setMessage('');
    try {
      const response = await fetch('/api/issues', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ siteUrl, issueKey: trackingKey, issueTitle: issue.title, category: issue.category, severity: issue.severity, url: issue.url ?? siteUrl, status, owner, notes }) });
      const data = await response.json() as { saved?: boolean; record?: IssueTrackingRecord; reason?: string; error?: string };
      if (!response.ok || !data.saved || !data.record) throw new Error(data.reason || data.error || 'Could not save the issue workflow.');
      onSaved(data.record); setMessage('Saved');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save. Check Supabase setup.');
    } finally { setSaving(false); }
  }

  return <details className="mt-4 rounded-lg border border-violet-100 bg-violet-50/50 p-3">
    <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-violet-900"><ClipboardList size={15}/>Issue status & ownership{record && <span className="ml-auto rounded-full bg-white px-2 py-0.5 text-[11px]">{statusLabels[record.status]}</span>}</summary>
    <div className="mt-3 grid gap-3 md:grid-cols-2">
      <label className="block"><span className="mb-1 block text-xs font-semibold text-slate-600">Status</span><select value={status} onChange={(event) => setStatus(event.target.value as IssueWorkflowStatus)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="block"><span className="mb-1 flex items-center gap-1 text-xs font-semibold text-slate-600"><UserRound size={13}/>Owner / assignee</span><input value={owner} onChange={(event) => setOwner(event.target.value)} maxLength={160} placeholder="e.g. Web team / Ravi" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"/></label>
      <label className="block md:col-span-2"><span className="mb-1 block text-xs font-semibold text-slate-600">Team notes</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={4000} rows={2} placeholder="Add a note, planned fix, ticket ID, or verification details…" className="w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"/></label>
    </div>
    <div className="mt-3 flex flex-wrap items-center gap-3"><button onClick={saveWorkflow} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-violet-700 px-3 py-2 text-xs font-bold text-white hover:bg-violet-800 disabled:opacity-60"><Save size={14}/>{saving ? 'Saving…' : 'Save issue workflow'}</button>{record?.updatedAt && <span className="text-[11px] text-slate-500">Last updated {new Date(record.updatedAt).toLocaleString()}</span>}{message && <span role="status" className={`text-xs ${message === 'Saved' ? 'text-emerald-700' : 'text-amber-800'}`}>{message}</span>}</div>
  </details>;
}

function FindingCard({ issue, siteUrl, record, onSaved }: { issue: IssueDetail; siteUrl: string; record?: IssueTrackingRecord; onSaved: (record: IssueTrackingRecord) => void }) {
  const cms = getCmsGuidance(issue);
  return <article className="rounded-xl border border-slate-200 bg-white p-4">
    <div className="flex flex-wrap items-center gap-2">
      <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${severityClass(issue.severity)}`}>{issue.severity}</span>
      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">{categoryLabels[issue.category] ?? issue.category}</span>
      {record && <span className="rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-800">{statusLabels[record.status]}{record.owner ? ` · ${record.owner}` : ''}</span>}
      {issue.source && <span className="text-xs text-slate-400">{issue.source}</span>}
    </div>
    <h3 className="mt-3 font-semibold text-slate-900">{issue.title}</h3>
    {issue.url && <a href={issue.url} target="_blank" rel="noreferrer" className="mt-1 inline-flex max-w-full items-start gap-1 break-all text-xs text-brand-700 hover:underline">{issue.url}<ExternalLink size={12} className="mt-0.5 shrink-0"/></a>}
    <div className="mt-3 grid gap-3 md:grid-cols-3">
      <div><p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">What we found</p><p className="mt-1 text-sm leading-5 text-slate-700">{issue.what}</p></div>
      <div><p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Why it matters</p><p className="mt-1 text-sm leading-5 text-slate-700">{issue.impact}</p></div>
      <div><p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Recommended fix</p><p className="mt-1 text-sm leading-5 text-slate-700">{issue.recommendation}</p></div>
    </div>
    <details className="mt-4 rounded-lg border border-blue-100 bg-blue-50/60 p-3">
      <summary className="cursor-pointer text-sm font-semibold text-blue-900">WordPress / Elementor fix guidance</summary>
      <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-5 text-slate-700">{cms.map((line, index) => <li key={index}>{line}</li>)}</ol>
    </details>
    <IssueWorkflowControls issue={issue} siteUrl={siteUrl} record={record} onSaved={onSaved}/>
  </article>;
}

export function IssueExplorer({ issues, siteUrl }: Props) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [severity, setSeverity] = useState('all');
  const [sortBy, setSortBy] = useState('severity');
  const [groupDuplicates, setGroupDuplicates] = useState(true);
  const [trackingRecords, setTrackingRecords] = useState<Record<string, IssueTrackingRecord>>({});
  const [trackingMessage, setTrackingMessage] = useState('Loading issue workflow…');
  const [trackingReady, setTrackingReady] = useState(false);

  useEffect(() => {
    let active = true;
    setTrackingMessage('Loading issue workflow…'); setTrackingReady(false); setTrackingRecords({});
    fetch(`/api/issues?siteUrl=${encodeURIComponent(siteUrl)}`, { cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json() as { ready?: boolean; records?: IssueTrackingRecord[]; reason?: string; error?: string };
        if (!response.ok || !data.ready) throw new Error(data.reason || data.error || 'Issue tracking is unavailable.');
        if (!active) return;
        const records: Record<string, IssueTrackingRecord> = {};
        for (const record of data.records ?? []) records[record.issueKey] = record;
        setTrackingRecords(records); setTrackingReady(true); setTrackingMessage('Status, owner and notes save to the database for this website.');
      })
      .catch((error) => { if (active) { setTrackingReady(false); setTrackingMessage(error instanceof Error ? error.message : 'Issue tracking is not configured.'); } });
    return () => { active = false; };
  }, [siteUrl]);

  const saveRecord = (record: IssueTrackingRecord) => setTrackingRecords((previous) => ({ ...previous, [record.issueKey]: record }));
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const list = issues.filter((issue) => {
      if (category !== 'all' && issue.category !== category) return false;
      if (severity !== 'all' && issue.severity !== severity) return false;
      if (!query) return true;
      return [issue.title, issue.category, issue.severity, issue.url, issue.what, issue.impact, issue.recommendation, issue.source].some((value) => String(value ?? '').toLowerCase().includes(query));
    });
    return list.sort((a, b) => {
      if (sortBy === 'severity') return severityRank[a.severity] - severityRank[b.severity] || a.title.localeCompare(b.title);
      if (sortBy === 'category') return (categoryLabels[a.category] ?? a.category).localeCompare(categoryLabels[b.category] ?? b.category) || a.title.localeCompare(b.title);
      if (sortBy === 'url') return (a.url ?? '').localeCompare(b.url ?? '');
      return a.title.localeCompare(b.title);
    });
  }, [issues, search, category, severity, sortBy]);

  const groups = useMemo<Group[]>(() => {
    const map = new Map<string, IssueDetail[]>();
    for (const issue of filtered) {
      const key = issueKey(issue);
      map.set(key, [...(map.get(key) ?? []), issue]);
    }
    return Array.from(map, ([key, items]) => ({ key, items, highestSeverity: highestSeverity(items) }))
      .sort((a, b) => {
        if (sortBy === 'severity') return severityRank[a.highestSeverity] - severityRank[b.highestSeverity] || a.items[0].title.localeCompare(b.items[0].title);
        if (sortBy === 'category') return (categoryLabels[a.items[0].category] ?? a.items[0].category).localeCompare(categoryLabels[b.items[0].category] ?? b.items[0].category) || a.items[0].title.localeCompare(b.items[0].title);
        if (sortBy === 'url') return (a.items[0].url ?? '').localeCompare(b.items[0].url ?? '');
        return a.items[0].title.localeCompare(b.items[0].title);
      });
  }, [filtered, sortBy]);
  const duplicateCount = groups.reduce((sum, group) => sum + Math.max(0, group.items.length - 1), 0);
  const renderFinding = (issue: IssueDetail) => <FindingCard key={issue.id} issue={issue} siteUrl={siteUrl} record={trackingRecords[getIssueTrackingKey(issue)]} onSaved={saveRecord}/>;

  return <section>
    <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:p-4">
      <div className="grid gap-3 md:grid-cols-[minmax(220px,1fr)_160px_150px_170px]">
        <label className="block"><span className="mb-1.5 flex items-center gap-2 text-xs font-semibold text-slate-600"><Search size={14}/>Search findings</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Issue, URL, impact, recommendation…" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100"/></label>
        <label className="block"><span className="mb-1.5 flex items-center gap-2 text-xs font-semibold text-slate-600"><Filter size={14}/>Category</span><select value={category} onChange={(event) => setCategory(event.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"><option value="all">All categories</option>{Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-600">Severity</span><select value={severity} onChange={(event) => setSeverity(event.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"><option value="all">All severities</option>{(['critical', 'high', 'medium', 'low'] as IssueSeverity[]).map((value) => <option key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</option>)}</select></label>
        <label className="block"><span className="mb-1.5 flex items-center gap-2 text-xs font-semibold text-slate-600"><ArrowDownAZ size={14}/>Sort by</span><select value={sortBy} onChange={(event) => setSortBy(event.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"><option value="severity">Severity (highest first)</option><option value="category">Category (A–Z)</option><option value="title">Issue title (A–Z)</option><option value="url">Affected URL (A–Z)</option></select></label>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3"><label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={groupDuplicates} onChange={(event) => setGroupDuplicates(event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-brand-700 focus:ring-brand-600"/><Layers3 size={15}/>Group similar findings{groupDuplicates && duplicateCount > 0 ? ` (${duplicateCount} repeated)` : ''}</label><p className="text-xs text-slate-500">Showing {filtered.length} of {issues.length} findings{groupDuplicates ? ` · ${groups.length} groups` : ''}</p></div>
      <div className={`mt-3 rounded-lg p-3 text-xs leading-5 ${trackingReady ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900'}`}><b>Issue workflow:</b> {trackingMessage}</div>
    </div>
    <div className="mt-4 space-y-3">
      {filtered.length === 0 ? <div className="rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-500">No findings match these filters. Try clearing the search or choosing another category/severity.</div> : groupDuplicates ? groups.map((group) => <div key={group.key} className="rounded-2xl border border-slate-200 p-3 sm:p-4">
        {group.items.length > 1 && <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><span className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-800"><Layers3 size={13}/>Repeated on {new Set(group.items.map(item => item.url).filter(Boolean)).size || group.items.length} affected URL(s)</span><span className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase ${severityClass(group.highestSeverity)}`}>Highest severity: {group.highestSeverity}</span></div>}
        {renderFinding(group.items[0])}
        {group.items.length > 1 && <details className="mt-3"><summary className="cursor-pointer text-sm font-semibold text-brand-700">View all {group.items.length} occurrences</summary><div className="mt-3 space-y-2">{group.items.slice(1).map((issue) => renderFinding(issue))}</div></details>}
      </div>) : filtered.map((issue) => renderFinding(issue))}
    </div>
  </section>;
}
