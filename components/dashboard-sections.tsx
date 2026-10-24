'use client';

import { useMemo, type ReactNode } from 'react';
import { Activity, AlertCircle, CheckCircle2, Clock3, Gauge, Globe, Search, ShieldCheck, TerminalSquare, Zap } from 'lucide-react';
import type { ScanActivity, ScanResult } from '@/types';
import { isKnownHttpStatus } from '@/lib/availability';
import { isSameSite } from '@/lib/url-identity';
import { explainPageSpeedError, hasLighthouseData, uniqueActivities } from '@/lib/presentation';
import { GlassCard, KpiCard, ScoreRing, SectionHeader } from '@/components/dashboard-ui';

function issueCount(scan: ScanResult) {
  return scan.detailedIssues?.length ?? (scan.linkIssues.length + scan.seoPages.reduce((sum, page) => sum + page.issues.length, 0));
}

function sameSiteHistory(current: ScanResult, history: ScanResult[]) {
  const scans = history.filter((item) => isSameSite(item.siteUrl, current.siteUrl) && item.checkedAt <= current.checkedAt);
  const unique = new Map(scans.map((item) => [item.id, item]));
  unique.set(current.id, current);
  return Array.from(unique.values()).sort((a, b) => a.checkedAt.localeCompare(b.checkedAt)).slice(-8);
}

export function DashboardHero({
  siteUrl,
  onSiteUrlChange,
  busy,
  elapsedSeconds,
  current,
  onRunScan,
}: {
  siteUrl: string;
  onSiteUrlChange: (value: string) => void;
  busy: boolean;
  elapsedSeconds: number;
  current: ScanResult | null;
  onRunScan: () => void;
}) {
  const status = current?.uptime.status === null ? 'Inconclusive' : current?.overallStatus ?? 'Awaiting first scan';
  return (
    <GlassCard className="hero-command mb-5 overflow-hidden p-4 sm:p-6 lg:p-7">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-center">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50/90 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-indigo-700">
            <span className={`live-dot ${busy ? 'is-live' : ''}`} />
            {busy ? `Scan running · ${elapsedSeconds}s elapsed` : current ? 'Monitoring workspace' : 'Ready when you are'}
          </div>
          <h1 className="font-heading mt-3 text-3xl font-semibold tracking-[-0.06em] text-slate-900 sm:text-[38px]">Website command center</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500 sm:text-base">Run a read-only health and quality check. Your scan activity and findings update as the checks finish.</p>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <label className="relative min-w-0 flex-1">
              <Globe size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"/>
              <input aria-label="Website URL to scan" value={siteUrl} onChange={(event) => onSiteUrlChange(event.target.value)} disabled={busy} placeholder="https://example.com" type="url" inputMode="url" autoComplete="url" spellCheck={false} className="h-12 w-full rounded-2xl border border-slate-200/80 bg-white/85 pl-10 pr-3 text-sm text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] outline-none transition placeholder:text-slate-400 focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100"/>
            </label>
            <button type="button" onClick={onRunScan} disabled={busy || !siteUrl.trim()} className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 px-5 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(79,70,229,0.22)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_30px_rgba(79,70,229,0.28)] disabled:translate-y-0 disabled:cursor-wait disabled:opacity-60">{busy ? <Activity size={16} className="animate-spin"/> : <Zap size={16}/>} {busy ? 'Scanning…' : 'Run scan'}</button>
          </div>
          <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-500"><ShieldCheck size={13}/>Public HTTP/HTTPS sites only · private networks and off-site redirects are blocked.</p>
        </div>
        <div className={`health-orbit-panel ${current?.overallStatus === 'down' ? 'is-down' : current?.uptime.status === null && current ? 'is-unknown' : ''}`}>
          <span className={`health-orbit ${busy ? 'is-running' : ''}`}><span className="health-orbit-core">{busy ? <Activity size={22} className="animate-pulse"/> : current?.overallStatus === 'healthy' ? <CheckCircle2 size={23}/> : current?.overallStatus === 'down' ? <AlertCircle size={23}/> : <Activity size={22}/>}</span></span>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[.12em] text-slate-500">{current ? 'Latest observed status' : 'No scan data'}</p>
            <p className="mt-1 text-base font-semibold capitalize text-slate-900">{busy ? 'Scanning' : status}</p>
            <p className="mt-1 text-xs text-slate-500">{current ? `HTTP ${current.uptime.status ?? 'no response'}${current.uptime.responseMs == null ? '' : ` · ${current.uptime.responseMs} ms`}` : 'No measurements yet'}</p>
          </div>
        </div>
      </div>
    </GlassCard>
  );
}

export function OverviewKpiStrip({ current, history }: { current: ScanResult; history: ScanResult[] }) {
  const scans = useMemo(() => sameSiteHistory(current, history), [current, history]);
  const responseTrend = scans.flatMap((scan) => isKnownHttpStatus(scan.uptime.status) && scan.uptime.responseMs != null ? [scan.uptime.responseMs] : []);
  const pageTrend = scans.map((scan) => scan.pagesChecked);
  const findingTrend = scans.map(issueCount);
  const performanceTrend = scans.flatMap((scan) => scan.speed.performance == null ? [] : [scan.speed.performance]);
  const highCount = (current.detailedIssues ?? []).filter((issue) => issue.severity === 'critical' || issue.severity === 'high').length;
  return (
    <div className="mb-5 grid animate-fade-up gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
      <KpiCard label="Website health" value={current.uptime.status === null ? 'Inconclusive' : `${current.overallStatus[0].toUpperCase()}${current.overallStatus.slice(1)}`} detail={`HTTP ${current.uptime.status ?? 'no response'}`} icon={<Globe size={16}/>} color={current.uptime.status === null ? '#64748b' : current.overallStatus === 'healthy' ? '#059669' : current.overallStatus === 'down' ? '#dc2626' : '#d97706'}/>
      <KpiCard label="Response time" value={current.uptime.responseMs ?? '—'} suffix={current.uptime.responseMs == null ? '' : ' ms'} detail="Latest observed homepage response" icon={<Zap size={16}/>} color="#0891b2" trend={responseTrend}/>
      <KpiCard label="Pages inspected" value={current.pagesChecked} detail={`${current.linksChecked} URLs checked in this crawl`} icon={<Search size={16}/>} color="#2563eb" trend={pageTrend}/>
      <KpiCard label="Total findings" value={issueCount(current)} detail={`${current.seoPages.length} pages in the saved audit`} icon={<AlertCircle size={16}/>} color="#d97706" trend={findingTrend}/>
      <KpiCard label="Mobile performance" value={current.speed.performance ?? '—'} suffix={current.speed.performance == null ? '' : '/100'} detail={current.speed.error ? 'Current audit unavailable' : 'Current PageSpeed score'} icon={<Gauge size={16}/>} color="#4f46e5" trend={performanceTrend}/>
      <KpiCard label="High priority" value={highCount} detail="Critical and high severity findings" icon={<ShieldCheck size={16}/>} color="#dc2626"/>
    </div>
  );
}

export function LighthouseScoreRings({ current, history, onRetryScan }: { current: ScanResult; history: ScanResult[]; onRetryScan: () => void }) {
  const historicalScan = [...history]
    .filter((item) => isSameSite(item.siteUrl, current.siteUrl) && item.checkedAt <= current.checkedAt && hasLighthouseData(item.speed))
    .sort((a, b) => b.checkedAt.localeCompare(a.checkedAt))[0];
  const scores: Array<{ label: string; value: number | null; color: string; icon: ReactNode }> = [
    { label: 'Performance', value: current.speed.performance, color: '#4f46e5', icon: <Gauge size={14}/> },
    { label: 'Accessibility', value: current.speed.accessibility, color: '#0891b2', icon: <ShieldCheck size={14}/> },
    { label: 'Best practices', value: current.speed.bestPractices, color: '#7c3aed', icon: <CheckCircle2 size={14}/> },
    { label: 'SEO', value: current.speed.seo, color: '#059669', icon: <Search size={14}/> },
  ];
  return (
    <GlassCard className="mb-5 p-4 sm:p-5">
      <SectionHeader title="Lighthouse quality scores" description="Scores from this scan only. Older successful results are labeled separately." icon={<Gauge size={18}/>}/>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{scores.map((score) => <ScoreRing key={score.label} label={score.label} score={score.value} color={score.color} icon={score.icon}/>)}</div>
      {current.speed.error && <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50/90 p-3 text-xs leading-5 text-amber-900"><div className="min-w-0 flex-1"><strong>Current audit unavailable.</strong> {explainPageSpeedError(current.speed.error)}{historicalScan && historicalScan.id !== current.id && <><span className="mt-1 block">Last successful audit: {new Date(historicalScan.checkedAt).toLocaleString()} (historical, not this scan).</span><span className="mt-2 grid grid-cols-2 gap-2 text-slate-700 sm:grid-cols-4">{[{ label: 'Performance', value: historicalScan.speed.performance }, { label: 'Accessibility', value: historicalScan.speed.accessibility }, { label: 'Best practices', value: historicalScan.speed.bestPractices }, { label: 'SEO', value: historicalScan.speed.seo }].map((item) => <span key={item.label} className="rounded-md bg-white/75 px-2 py-1"><b>{item.label}:</b> {item.value == null ? 'Unavailable' : `${item.value}/100`}</span>)}</span></>}</div><button type="button" onClick={onRetryScan} className="shrink-0 rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-100">Retry scan</button></div>}
    </GlassCard>
  );
}

function activityClass(level: ScanActivity['level']) {
  switch (level) {
    case 'success': return 'bg-emerald-500';
    case 'warning': return 'bg-amber-500';
    case 'error': return 'bg-red-500';
    default: return 'bg-cyan-600';
  }
}

export function LiveActivityPanel({ busy, elapsedSeconds, activities }: { busy: boolean; elapsedSeconds: number; activities: ScanActivity[] }) {
  const entries = uniqueActivities(activities);
  return (
    <details id="live-activity" open={busy} className="mb-6 scroll-mt-36 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <summary className="flex cursor-pointer list-none flex-col gap-2 border-b border-slate-100 px-5 py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-600 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-3"><div className="rounded-lg bg-brand-50 p-2 text-brand-700"><TerminalSquare size={19}/></div><div><h2 className="font-heading text-base font-semibold text-slate-900">Live scan activity</h2><p className="text-xs text-slate-500">Real timestamped steps from the scan.</p></div></div><div className="flex items-center gap-2 text-xs text-slate-500">{busy && <><span className="live-dot is-live"/>Running · {elapsedSeconds}s elapsed</>}{!busy && <span>{entries.length} logged steps · expand to view</span>}</div></summary>
      {busy && <div className="h-1.5 bg-slate-100"><div className="h-full animate-pulse bg-gradient-to-r from-brand-600 via-cyan-500 to-violet-500" style={{ width: `${Math.min(94, 10 + elapsedSeconds * 1.4)}%` }}/></div>}
      <div className="max-h-[330px] overflow-auto bg-slate-950 p-4 font-mono sm:p-5">
        {entries.length ? <div className="space-y-3">{entries.map((entry, index) => <div key={`${entry.timestamp}-${entry.step}-${index}`} className="flex gap-3"><div className="flex flex-col items-center"><span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${activityClass(entry.level)}`}/>{index < entries.length - 1 && <span className="mt-1 w-px flex-1 bg-slate-700"/>}</div><div className="min-w-0 flex-1 pb-1"><div className="flex flex-wrap items-center gap-x-2 gap-y-1"><time className="text-[11px] text-slate-400">{new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time><span className="text-xs font-semibold text-slate-200">{entry.step}</span>{entry.durationMs !== undefined && <span className="text-[11px] text-slate-400">{entry.durationMs} ms</span>}</div><p className="mt-1 break-words font-sans text-sm leading-5 text-slate-300">{entry.message}</p></div></div>)}</div> : <div className="py-6 text-center"><Activity className="mx-auto text-slate-500" size={24}/><p className="mt-2 text-sm font-medium text-slate-200">No scan activity yet</p><p className="mt-1 font-sans text-xs text-slate-400">Start a scan to see each real check appear here.</p></div>}
        {busy && <div className="ml-5 mt-2 flex items-center gap-2 font-sans text-xs text-slate-400"><Clock3 size={13}/>Waiting for the next scan event…</div>}
      </div>
    </details>
  );
}
