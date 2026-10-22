'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, AlertCircle, AlertTriangle, ArrowUpRight, CheckCircle2, Clock3, Database, Gauge, Globe, Link2, RefreshCw, Search, ShieldCheck, Sparkles, Zap, TerminalSquare, ChevronDown, Mail } from 'lucide-react';
import type { ScanActivity, ScanResult } from '@/types';
import { ReportTools, ScanComparison } from '@/components/report-tools';
import { IssueExplorer } from '@/components/issue-explorer';
import { AnalyticsDashboard } from '@/components/analytics-dashboard';
import { explainPageSpeedError, uniqueActivities } from '@/lib/presentation';
import { AuthControls } from '@/components/auth-controls';
import { MonitoredWebsites } from '@/components/monitored-websites';
import { isSameSite } from '@/lib/url-identity';
import { EmailNotificationHistory } from '@/components/email-notification-history';

type StreamEvent =
  | { type: 'activity'; activity: ScanActivity }
  | { type: 'complete'; result: ScanResult; storage: { saved: boolean; reason?: string } }
  | { type: 'error'; error: string; activity?: ScanActivity };

function scoreLabel(score: number | null | undefined) { return score == null ? 'Unavailable' : `${score}`; }
function statusClass(status: ScanResult['overallStatus']) { return status === 'healthy' ? 'bg-emerald-50 text-emerald-700' : status === 'down' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-800'; }
function timeLabel(value: string) { return new Date(value).toLocaleString(); }
function clockLabel(value: string) { return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
function ScoreCard({ label, score, icon: Icon }: { label: string; score: number | null; icon: typeof Gauge }) {
  const color = score === null ? 'text-slate-500' : score >= 90 ? 'text-emerald-600' : score >= 50 ? 'text-amber-600' : 'text-red-600';
  return <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between text-sm text-slate-500"><span>{label}</span><Icon size={18}/></div><div className={`${score === null ? 'mt-3 text-xl' : 'mt-3 text-3xl'} font-bold ${color}`}>{scoreLabel(score)}{score !== null && <span className="ml-1 text-sm font-medium text-slate-400">/100</span>}</div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${score === null ? 'bg-slate-200' : score >= 90 ? 'bg-emerald-500' : score >= 50 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${score ?? 0}%` }}/></div></div>;
}
function activityClass(level: ScanActivity['level']) {
  switch (level) {
    case 'success': return 'bg-emerald-500';
    case 'warning': return 'bg-amber-500';
    case 'error': return 'bg-red-500';
    default: return 'bg-blue-500';
  }
}

const dashboardNavigation = [
  { id: 'overview', label: 'Overview', icon: Activity },
  { id: 'analytics', label: 'Analytics', icon: Gauge },
  { id: 'issue-management', label: 'Issues', icon: AlertCircle },
  { id: 'page-audits', label: 'Pages & SEO', icon: Search },
  { id: 'live-activity', label: 'Scan Activity', icon: TerminalSquare },
  { id: 'websites', label: 'Websites', icon: Globe },
  { id: 'reports', label: 'History & Reports', icon: Database },
  { id: 'scan-history', label: 'Scan History', icon: Clock3 },
] as const;

const setupNavigationIds = new Set(['overview', 'live-activity', 'websites', 'scan-history']);
export default function Home() {
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [history, setHistory] = useState<ScanResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [storageNote, setStorageNote] = useState('');
  const [historyNote, setHistoryNote] = useState('');
  const [historyConfigured, setHistoryConfigured] = useState(false);
  const [activities, setActivities] = useState<ScanActivity[]>([]);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [siteUrlInput, setSiteUrlInput] = useState('');
  const [crawlLimit, setCrawlLimit] = useState('30');
  const [includeSitemap, setIncludeSitemap] = useState(false);
  const [sendEmailAlert, setSendEmailAlert] = useState(true);
  const [testEmailSending, setTestEmailSending] = useState(false);
  const [testEmailMsg, setTestEmailMsg] = useState('');
  const [emailHistoryRefresh, setEmailHistoryRefresh] = useState(0);
  const [activeSection, setActiveSection] = useState('overview');

  useEffect(() => {
    try {
      const stored = localStorage.getItem('wm_send_email_alert');
      if (stored !== null) setSendEmailAlert(stored === 'true');
    } catch { /* storage fallback */ }
  }, []);

  const handleToggleEmailAlert = (enabled: boolean) => {
    setSendEmailAlert(enabled);
    try {
      localStorage.setItem('wm_send_email_alert', String(enabled));
    } catch { /* storage fallback */ }
  };

  const sendTestEmail = async () => {
    setTestEmailSending(true);
    setTestEmailMsg('');
    try {
      const response = await fetch('/api/test-email', { method: 'POST' });
      const data = await response.json();
      if (response.ok && data.ok) {
        setTestEmailMsg(`✅ ${data.message}`);
      } else {
        setTestEmailMsg(`❌ ${data.error || 'Failed to send test email.'}`);
      }
    } catch (err) {
      setTestEmailMsg(`❌ ${err instanceof Error ? err.message : 'Network error'}`);
    } finally {
      setTestEmailSending(false);
      setEmailHistoryRefresh((value) => value + 1);
    }
  };
  const loadHistory = useCallback(async () => {
    try {
      const response = await fetch('/api/history', { cache: 'no-store' });
      const data = await response.json();
      if (Array.isArray(data.scans)) setHistory(data.scans);
      const suggestedUrl = (Array.isArray(data.scans) && data.scans[0]?.siteUrl) || data.defaultSiteUrl || '';
      if (suggestedUrl) setSiteUrlInput((value) => value || suggestedUrl);
      setHistoryConfigured(Boolean(data.tableReady));
      setHistoryNote(data.reason || (data.tableReady ? 'Supabase is connected and the history table is ready.' : ''));
    } catch {
      setHistoryNote('Could not contact the history endpoint. Check the development server logs.');
    }
  }, []);
  useEffect(() => { void loadHistory(); }, [loadHistory]);
  useEffect(() => {
    const syncActiveSection = () => setActiveSection(window.location.hash.slice(1) || 'overview');
    window.addEventListener('hashchange', syncActiveSection);
    syncActiveSection();
    return () => window.removeEventListener('hashchange', syncActiveSection);
  }, []);
  useEffect(() => {
    if (!busy || !startedAt) return;
    const timer = window.setInterval(() => setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [busy, startedAt]);

  const runScan = async () => {
    if (busy) return;
    if (!siteUrlInput.trim()) { setError('Enter a public website URL, for example https://example.com.'); return; }
    setBusy(true); setError(''); setStorageNote('');
    const start = Date.now();
    setStartedAt(start); setElapsedSeconds(0);
    setActivities([{ timestamp: new Date(start).toISOString(), step: 'Browser', message: 'Scan request started; connecting to the monitoring API.', level: 'info' }]);
    let completed = false;
    let streamError = '';
    const handleLine = (line: string) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      const event = JSON.parse(trimmed) as StreamEvent;
      if (event.type === 'activity') setActivities(previous => [...previous, event.activity].slice(-150));
      if (event.type === 'error') {
        streamError = event.error;
        if (event.activity) setActivities(previous => [...previous, event.activity!].slice(-150));
      }
      if (event.type === 'complete') {
        completed = true;
        setScan(event.result);
        setSiteUrlInput(event.result.siteUrl);
        setActivities(uniqueActivities(event.result.activities));
        setStorageNote(event.storage?.saved ? 'Saved to Supabase scan history.' : event.storage?.reason || 'Scan completed, but history was not saved.');
      }
    };
    try {
      const response = await fetch('/api/scan/stream', { method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ siteUrl: siteUrlInput.trim(), crawlLimit: Number(crawlLimit), includeSitemap, sendEmailAlert }) });
      if (!response.ok) throw new Error(`Scan API failed with HTTP ${response.status}.`);
      if (!response.body) throw new Error('This browser did not provide a streaming response. Refresh the page and try again.');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) handleLine(line);
      }
      buffer += decoder.decode();
      if (buffer.trim()) handleLine(buffer);
      if (streamError) throw new Error(streamError);
      if (!completed) throw new Error('The scan stream ended before a final result arrived. Check terminal/server logs and retry.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
      setActivities(previous => [...previous, { timestamp: new Date().toISOString(), step: 'Scan failed', message: e instanceof Error ? e.message : 'Something went wrong', level: 'error' as const }].slice(-150));
    } finally {
      setBusy(false); setStartedAt(null);
      void loadHistory();
    }
  };

  const current = scan ?? history[0] ?? null;
  const issueCount = useMemo(() => current ? (current.detailedIssues?.length ?? (current.linkIssues.length + current.seoPages.reduce((sum, p) => sum + p.issues.length, 0))) : 0, [current]);
  const priorityIssues = useMemo(() => {
    const severityRank: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    return [...(current?.detailedIssues ?? [])]
      .sort((a, b) => severityRank[a.severity] - severityRank[b.severity])
      .slice(0, 4);
  }, [current]);
  const savedActivities = uniqueActivities(current?.activities);
  const visibleActivities = busy ? uniqueActivities(activities) : (savedActivities.length ? savedActivities : uniqueActivities(activities));
 
  
const previousScan = useMemo(() => {
  if (!current) return null;

  return (
    history
      .filter(
        (item) =>
          item.id !== current.id &&
          item.checkedAt < current.checkedAt &&
          isSameSite(item.siteUrl, current.siteUrl)
      )
      .sort(
        (a, b) =>
          b.checkedAt.localeCompare(a.checkedAt)
      )[0] ?? null
  );
}, [current, history]);
  const visibleNavigation = current
    ? dashboardNavigation
    : dashboardNavigation.filter((item) => setupNavigationIds.has(item.id));

  return <main className="min-h-screen bg-canvas pb-12">
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex min-h-[68px] max-w-[1440px] items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <a href="#overview" className="flex min-w-0 items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-200"><Activity size={20}/></span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold tracking-tight text-slate-900 sm:text-base">Website Monitor <span className="text-brand-700">AI</span></span>
            <span className="hidden text-[11px] text-slate-500 sm:block">Website Intelligence &amp; Monitoring</span>
          </span>
        </a>
        <div className="hidden min-w-0 flex-1 items-center justify-center gap-3 lg:flex">
          <span className="max-w-[260px] truncate rounded-lg bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 ring-1 ring-inset ring-slate-200">{siteUrlInput || 'No website selected'}</span>
          <span className="whitespace-nowrap text-xs text-slate-500">{current ? `Last scan ${timeLabel(current.checkedAt)}` : 'No scans yet'}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <button type="button" onClick={sendTestEmail} disabled={testEmailSending} title="Send a verification email using Resend" aria-label="Send test email using Resend" className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white p-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60 sm:px-3 sm:py-2">{testEmailSending ? <RefreshCw className="animate-spin" size={14}/> : <Mail size={14}/>}<span className="hidden sm:inline">{testEmailSending ? 'Sending…' : 'Test Email'}</span></button>
          <AuthControls/>
          <button aria-label={busy ? 'Scan in progress' : 'Run scan'} onClick={runScan} disabled={busy} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-brand-700 px-2.5 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 sm:gap-2 sm:px-4 sm:text-sm">{busy ? <RefreshCw className="animate-spin" size={15}/> : <RefreshCw size={15}/>}<span className="hidden sm:inline">{busy ? 'Scanning…' : 'Run scan'}</span></button>
        </div>
      </div>
    </header>
    <div className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <nav aria-label="Dashboard sections" className="sticky top-[68px] z-20 -mx-4 mb-6 overflow-x-auto border-y border-slate-200 bg-canvas px-4 py-2 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="flex min-w-max gap-1">
          {visibleNavigation.map(({ id, label, icon: Icon }) => <a key={id} href={`#${id}`} aria-current={activeSection === id ? 'location' : undefined} className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 ${activeSection === id ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-white hover:text-brand-700'}`}><Icon size={14}/>{label}</a>)}
        </div>
      </nav>
      {testEmailMsg && (
        <div className={`mb-5 rounded-xl border p-4 text-xs font-medium flex items-center justify-between ${testEmailMsg.startsWith('✅') ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'}`}>
          <span>{testEmailMsg}</span>
          <button onClick={() => setTestEmailMsg('')} className="ml-4 underline hover:no-underline">Dismiss</button>
        </div>
      )}
      <div id="overview" className="mb-6 scroll-mt-36 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div className="min-w-0"><p className="text-xs font-semibold tracking-wide text-brand-700">MONITORING WORKSPACE</p><h1 className="mt-2 text-[26px] font-semibold tracking-tight text-slate-900 sm:text-3xl">Website overview</h1><p className="mt-1.5 max-w-2xl truncate text-sm text-slate-500">{siteUrlInput || 'Select a monitored website or enter a URL to get started.'}</p></div>
        <div className="flex flex-wrap items-center gap-2">
          {current && <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold capitalize ${statusClass(current.overallStatus)}`}><span className={`h-1.5 w-1.5 rounded-full ${current.overallStatus === 'healthy' ? 'bg-emerald-500' : current.overallStatus === 'down' ? 'bg-red-500' : 'bg-amber-500'}`}/>{current.uptime.status === null ? 'Inconclusive' : current.overallStatus}</span>}
          <span className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600"><Clock3 size={14}/>{current ? timeLabel(current.checkedAt) : 'No scans yet'}</span>
        </div>
      </div>
      {error && <div className="mb-5 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><AlertTriangle size={18} className="mt-0.5 shrink-0"/><div><strong>Scan failed</strong><p className="mt-1">{error}</p><p className="mt-1 text-red-700">Check your environment variables and server logs.</p></div></div>}

      <details id="scan-configuration" className="mb-5 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-600 sm:px-5">
          <span className="flex min-w-0 items-center gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700"><Search size={17}/></span><span><span className="block text-sm font-semibold text-slate-900">Scan configuration</span><span className="mt-0.5 block text-xs text-slate-500">Website URL, crawl depth, sitemap, and email alerts</span></span></span><ChevronDown size={17} className="shrink-0 text-slate-400 transition-transform"/>
        </summary>
        <div className="border-t border-slate-100 p-4 sm:p-5">
        <div className="mb-4"><h2 className="font-semibold text-slate-900">Configure the next scan</h2><p className="mt-1 text-xs text-slate-500">Higher crawl limits may take longer and send more requests to your website.</p></div>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_220px] lg:items-end">
          <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-600">Website URL to scan</span><input value={siteUrlInput} onChange={(event) => setSiteUrlInput(event.target.value)} disabled={busy} placeholder="https://example.com" type="url" inputMode="url" autoComplete="url" spellCheck={false} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100"/><span className="mt-1.5 block text-xs text-slate-500">Enter a public HTTP/HTTPS website. Each URL has its own scan history.</span></label>
          <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-600">Maximum URLs to check</span><select value={crawlLimit} onChange={(event) => setCrawlLimit(event.target.value)} disabled={busy} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"><option value="30">30 URLs · Quick scan</option><option value="50">50 URLs</option><option value="100">100 URLs</option><option value="250">250 URLs · Deep scan</option><option value="500">500 URLs · Maximum</option></select></label>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${includeSitemap ? 'border-brand-200 bg-brand-50/50' : 'border-slate-200 bg-slate-50'}`}><input type="checkbox" checked={includeSitemap} onChange={(event) => setIncludeSitemap(event.target.checked)} disabled={busy} className="mt-1 h-4 w-4 rounded border-slate-300 text-brand-700 focus:ring-brand-600"/><span><span className="block text-sm font-semibold text-slate-800">Include sitemap scan</span><span className="mt-1 block text-xs leading-5 text-slate-500">Checks robots.txt and common WordPress / SEO sitemap URLs for crawl seeds.</span></span></label>
          <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${sendEmailAlert ? 'border-brand-200 bg-brand-50/50' : 'border-slate-200 bg-slate-50'}`}>
            <input type="checkbox" checked={sendEmailAlert} onChange={(event) => handleToggleEmailAlert(event.target.checked)} disabled={busy} className="mt-1 h-4 w-4 rounded border-slate-300 text-brand-700 focus:ring-brand-600"/>
            <span>
              <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
                <Mail size={15} className={sendEmailAlert ? 'text-brand-600' : 'text-slate-400'} />
                Send email alert on changes
                <span className={`ml-1 rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wider ${sendEmailAlert ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}>
                  {sendEmailAlert ? 'ON' : 'OFF'}
                </span>
              </span>
              <span className="mt-1 block text-xs leading-5 text-slate-500">
                {sendEmailAlert
                  ? 'Sends an email only if this scan detects new issues or changes.'
                  : 'Emails disabled for manual scans (quiet mode; saves quota).'}
              </span>
            </span>
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="max-w-3xl text-xs leading-5 text-slate-500">Security: private/local IPs, localhost and non-standard ports are blocked. Only same-site links and redirects are crawled.</p><button type="button" onClick={runScan} disabled={busy || !siteUrlInput.trim()} className="inline-flex items-center gap-2 rounded-xl bg-brand-700 px-5 py-3 text-sm font-semibold text-white hover:bg-brand-800 disabled:cursor-wait disabled:opacity-60">{busy ? <RefreshCw size={16} className="animate-spin"/> : <Globe size={16}/>} {busy ? 'Scanning…' : 'Scan this website'}</button></div>
        {current?.crawlConfig && <p className="mt-3 text-xs text-slate-500">Last scan settings: limit {current.crawlConfig.limit} URLs · Sitemap {current.crawlConfig.sitemapEnabled ? `enabled (${current.crawlConfig.sitemapUrlsDiscovered} URL(s) discovered)` : 'disabled'}.</p>}
        </div>
      </details>

      <details id="live-activity" open={busy} className="mb-6 scroll-mt-36 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <summary className="flex cursor-pointer list-none flex-col gap-2 border-b border-slate-100 px-5 py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-600 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-3"><div className="rounded-lg bg-brand-50 p-2 text-brand-700"><TerminalSquare size={20}/></div><div><h2 className="font-bold">Live scan activity</h2><p className="text-xs text-slate-500">Timestamped steps from the server as each check runs.</p></div></div><div className="flex items-center gap-2 text-xs text-slate-500">{busy && <><span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500"/>Running · {elapsedSeconds}s elapsed</>}{!busy && current && <span>{visibleActivities.length} logged steps · expand to view</span>}</div></summary>
        {busy && <div className="h-1.5 bg-slate-100"><div className="h-full animate-pulse bg-brand-600" style={{ width: `${Math.min(94, 10 + elapsedSeconds * 1.4)}%` }}/></div>}
        <div className="max-h-[330px] overflow-auto p-4 sm:p-5">
          {visibleActivities.length ? <div className="space-y-3">{visibleActivities.map((entry, index) => <div key={`${entry.timestamp}-${entry.step}-${index}`} className="flex gap-3"><div className="flex flex-col items-center"><span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${activityClass(entry.level)}`}/>{index < visibleActivities.length - 1 && <span className="mt-1 w-px flex-1 bg-slate-200"/>}</div><div className="min-w-0 flex-1 pb-1"><div className="flex flex-wrap items-center gap-x-2 gap-y-1"><time className="font-mono text-[11px] text-slate-400">{clockLabel(entry.timestamp)}</time><span className="text-xs font-bold text-slate-700">{entry.step}</span>{entry.durationMs !== undefined && <span className="text-[11px] text-slate-400">{entry.durationMs} ms</span>}</div><p className="mt-1 break-words text-sm leading-5 text-slate-600">{entry.message}</p></div></div>)}</div> : <div className="py-6 text-center"><Activity className="mx-auto text-slate-300" size={25}/><p className="mt-2 text-sm font-medium text-slate-600">No scan activity yet</p><p className="mt-1 text-xs text-slate-400">Click “Run scan” to see every check appear here with its timestamp.</p></div>}
          {busy && <div className="ml-5 mt-2 flex items-center gap-2 text-xs text-slate-500"><RefreshCw size={13} className="animate-spin"/>Waiting for the next scan event…</div>}
        </div>
      </details>

      {!current && !busy && <div className="mb-6 rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-700"><Globe size={26}/></div><h2 className="mt-4 text-xl font-semibold">Ready for your first scan</h2><p className="mx-auto mt-2 max-w-lg text-sm text-slate-500">Enter any public website URL above, choose a crawl limit, then click Scan this website. Results are read-only and will not change the website.</p><button onClick={runScan} className="mt-5 rounded-xl bg-brand-700 px-5 py-3 text-sm font-semibold text-white hover:bg-brand-800">Start first scan</button></div>}

      {current && <>
        <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          <article className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2 text-xs font-medium text-slate-500"><span>Website health</span><Globe size={16} className="text-brand-600"/></div>
            <p className="mt-3 text-2xl font-semibold capitalize tracking-tight text-slate-900">{current.uptime.status === null ? 'Inconclusive' : current.overallStatus}</p>
            <p className="mt-1 truncate text-xs text-slate-500">HTTP {current.uptime.status ?? 'no response'} · {current.siteUrl}</p>
          </article>
          <article className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2 text-xs font-medium text-slate-500"><span>Response time</span><Zap size={16} className="text-cyan-600"/></div>
            <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">{current.uptime.responseMs == null ? '—' : <>{current.uptime.responseMs}<span className="ml-1 text-sm font-medium text-slate-500">ms</span></>}</p>
            <p className="mt-1 text-xs text-slate-500">{previousScan?.uptime.responseMs != null && current.uptime.responseMs != null ? `Previous ${previousScan.uptime.responseMs} ms` : 'Latest observed homepage response'}</p>
          </article>
          <article className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2 text-xs font-medium text-slate-500"><span>Pages inspected</span><Search size={16} className="text-blue-600"/></div>
            <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">{current.pagesChecked}</p>
            <p className="mt-1 text-xs text-slate-500">{current.linksChecked} URLs checked in this crawl</p>
          </article>
          <article className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2 text-xs font-medium text-slate-500"><span>Total findings</span><AlertTriangle size={16} className="text-amber-600"/></div>
            <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">{issueCount}</p>
            <p className="mt-1 text-xs text-slate-500">{current.seoPages.length} pages in the saved audit</p>
          </article>
          <article className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2 text-xs font-medium text-slate-500"><span>Mobile performance</span><Gauge size={16} className="text-brand-600"/></div>
            <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">{scoreLabel(current.speed.performance)}{current.speed.performance !== null && <span className="ml-1 text-sm font-medium text-slate-500">/100</span>}</p>
            <p className="mt-1 text-xs text-slate-500">{current.speed.error ? 'Current Lighthouse audit unavailable' : 'Current PageSpeed score'}</p>
          </article>
          <article className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2 text-xs font-medium text-slate-500"><span>High priority</span><AlertCircle size={16} className="text-red-600"/></div>
            <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">{(current.detailedIssues ?? []).filter((issue) => issue.severity === 'critical' || issue.severity === 'high').length}</p>
            <a href="#priority-issues" className="mt-1 inline-flex text-xs font-medium text-brand-700 hover:underline">Review priority findings</a>
          </article>
        </div>
        {current.speed?.error && <div className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><AlertTriangle size={19} className="mt-0.5 shrink-0 text-amber-700"/><div className="min-w-0 flex-1"><strong>PageSpeed audit unavailable for this scan</strong><p className="mt-1 leading-6">{explainPageSpeedError(current.speed.error)}</p><p className="mt-2 text-xs text-amber-800">No scores are estimated or substituted from an older scan.</p></div><button type="button" onClick={runScan} disabled={busy} className="shrink-0 rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50">Retry full scan</button></div>}
        <AnalyticsDashboard current={current} history={history}/>
        <section id="priority-issues" className="mb-6 scroll-mt-36 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="priority-issues-title">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-brand-700">First look</p><h2 id="priority-issues-title" className="mt-1 text-lg font-bold text-slate-900">Priority issues</h2><p className="mt-1 text-sm text-slate-500">Highest-severity findings from this scan, ordered for triage.</p></div><a href="#issue-management" className="text-sm font-semibold text-brand-700 hover:underline">Open full issue management</a></div>
          {priorityIssues.length ? <div className="grid gap-3 lg:grid-cols-2">{priorityIssues.map((issue) => { const affectedPages = new Set((current.detailedIssues ?? []).filter((other) => other.category === issue.category && other.title === issue.title && other.url).map((other) => other.url)).size; return <article key={issue.id} className="rounded-xl border border-slate-200 p-4"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase ${issue.severity === 'critical' ? 'bg-red-100 text-red-900' : issue.severity === 'high' ? 'bg-red-50 text-red-700' : issue.severity === 'medium' ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-slate-700'}`}>{issue.severity}</span><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">{issue.category}</span><span className="ml-auto text-xs text-slate-500">{affectedPages ? `${affectedPages} affected page(s)` : 'Site-wide'}</span></div><h3 className="mt-3 font-semibold text-slate-900">{issue.title}</h3><p className="mt-1 line-clamp-2 text-sm text-slate-600">{issue.what}</p><p className="mt-3 text-xs leading-5 text-slate-600"><b>Next action:</b> {issue.recommendation}</p></article>; })}</div> : <p className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">No findings are currently recorded for this scan.</p>}
        </section>
        <div id="reports" className="scroll-mt-36"><ReportTools current={current} previous={previousScan} history={history}/><ScanComparison current={current} previous={previousScan}/></div>
        <section className="mb-6"><div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-bold">PageSpeed scores</h2><span className="text-xs text-slate-500">Mobile Lighthouse audit</span></div><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><ScoreCard label="Performance" score={current.speed.performance} icon={Gauge}/><ScoreCard label="Accessibility" score={current.speed.accessibility} icon={ShieldCheck}/><ScoreCard label="Best practices" score={current.speed.bestPractices} icon={CheckCircle2}/><ScoreCard label="SEO" score={current.speed.seo} icon={Search}/></div></section>

        <section id="issue-management" className="mb-6 scroll-mt-36 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-2"><div className="rounded-lg bg-red-50 p-2 text-red-700"><AlertCircle size={19}/></div><div><h2 className="font-bold">Issues explained in detail</h2><p className="text-xs text-slate-500">Each finding includes what was detected, why it matters, severity, affected URL and a recommended fix.</p></div></div>
          <IssueExplorer issues={current.detailedIssues ?? []} siteUrl={current.siteUrl}/>
        </section>

        <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2"><div className="rounded-lg bg-blue-50 p-2 text-blue-700"><ArrowUpRight size={19}/></div><div><h2 className="font-bold">Redirect-aware crawl</h2><p className="text-xs text-slate-500">Same-site 301, 302, 303, 307 and 308 redirects are followed up to eight hops. Redirects to unrelated hosts are not followed.</p></div><span className="ml-auto rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold">{current.redirects?.length ?? 0} hops</span></div>
          {(current.redirects?.length ?? 0) > 0 ? <div className="mt-4 space-y-2">{current.redirects!.map((redirect, index) => <div key={`${redirect.from}-${redirect.to}-${index}`} className="rounded-xl border border-slate-100 p-3"><div className="flex flex-wrap items-center gap-2"><span className="rounded-md bg-blue-50 px-2 py-1 text-xs font-bold text-blue-700">HTTP {redirect.status}</span><p className="break-all text-sm font-medium text-slate-700">{redirect.from}</p></div><p className="mt-2 break-all text-xs text-slate-500">Final/next URL: <a href={redirect.to} target="_blank" rel="noreferrer" className="text-brand-700 hover:underline">{redirect.to}</a></p></div>)}</div> : <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">No followed same-site redirect hops were recorded in this scan. Redirect chains are included here when encountered.</div>}
        </section>

        <div className="mb-6 grid gap-5 xl:grid-cols-[1.1fr_.9fr]"><section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-2"><div className="rounded-lg bg-brand-50 p-2 text-brand-700"><Sparkles size={19}/></div><div><h2 className="font-bold">AI analysis</h2><p className="text-xs text-slate-500">Summary and suggested next steps</p></div></div><p className="mt-4 text-sm leading-6 text-slate-700">{current.aiSummary}</p><div className="mt-4 space-y-3">{current.recommendations.map((item, i) => <div key={i} className="flex gap-3 rounded-xl bg-slate-50 p-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-xs font-bold text-brand-700 shadow-sm">{i+1}</span><p className="text-sm leading-5 text-slate-700">{item}</p></div>)}</div></section>
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-2"><div className="rounded-lg bg-amber-50 p-2 text-amber-700"><Link2 size={19}/></div><div><h2 className="font-bold">Broken links / request errors</h2><p className="text-xs text-slate-500">Internal URLs that returned an error</p></div></div>{current.linkIssues.length === 0 ? <div className="mt-5 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">No broken internal links detected in this crawl.</div> : <div className="mt-4 max-h-96 space-y-2 overflow-auto">{current.linkIssues.map((issue, i) => <div key={`${issue.url}-${i}`} className="rounded-xl border border-slate-100 p-3"><div className="flex items-start justify-between gap-3"><p className="break-all text-sm font-medium text-slate-800">{issue.url}</p><span className="shrink-0 rounded-md bg-red-50 px-2 py-1 text-xs font-bold text-red-700">{issue.status ?? 'ERR'}</span></div><p className="mt-1 text-xs leading-5 text-slate-500">{issue.message}</p><p className="mt-2 text-xs text-slate-700">Recommended: verify the target URL and update the source page link or restore the target page.</p></div>)}</div>}</section></div>

        <section id="page-audits" className="mb-6 scroll-mt-36 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="mb-4 flex items-center justify-between"><div><h2 className="font-bold">SEO page review</h2><p className="mt-1 text-xs text-slate-500">Page metadata, headings, canonical URLs and individual images. Expand a page for its saved comparison and page-scoped findings.</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold">{current.seoPages.length} pages</span></div><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead><tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500"><th className="pb-3 pr-4 font-semibold">Page</th><th className="pb-3 pr-4 font-semibold">Title</th><th className="pb-3 pr-4 font-semibold">Description</th><th className="pb-3 pr-4 font-semibold">H1</th><th className="pb-3 font-semibold">Findings</th></tr></thead><tbody>{current.seoPages.map((page, i) => { const priorPage = previousScan?.seoPages?.find((entry) => entry.url === page.url); const pageIssues = (current.detailedIssues ?? []).filter((issue) => issue.url === page.url); const pageRedirects = (current.redirects ?? []).filter((redirect) => redirect.from === page.url || redirect.to === page.url); return <tr key={page.url} className={i%2 ? 'bg-slate-50/70' : ''}><td className="max-w-64 break-all py-3 pr-4 text-slate-700"><a className="inline-flex items-center gap-1 hover:text-brand-700" href={page.url} target="_blank" rel="noreferrer">{new URL(page.url).pathname || '/'}<ArrowUpRight size={13}/></a><details className="mt-2 max-w-xs"><summary className="flex cursor-pointer items-center gap-1 text-xs text-brand-700">Page audit details <ChevronDown size={12}/></summary><div className="mt-2 space-y-2 break-words rounded-lg bg-slate-50 p-3 text-xs"><p><b>HTTP status:</b> {page.status} · <b>Inspected URL/final URL:</b> {page.url}</p><p><b>Title:</b> {page.title || 'Missing'}</p><p><b>Description:</b> {page.description || 'Missing'}</p><p><b>H1 headings:</b> {page.h1Texts?.join(' | ') || (page.h1Count ? `${page.h1Count} H1 heading(s), text unavailable in old scan` : 'Missing')}</p><p><b>Canonical:</b> {page.canonical || 'Missing'}</p>{page.missingAltImages?.length ? <div><b>Images with missing alt ({page.imagesMissingAlt}):</b><ul className="mt-1 list-disc space-y-1 pl-4">{page.missingAltImages.map((src, j) => <li key={`${src}-${j}`} className="break-all"><a href={src.startsWith('http') ? src : undefined} target="_blank" rel="noreferrer" className="text-brand-700 hover:underline">{src}</a></li>)}</ul></div> : null}{pageIssues.length > 0 && <div><b>Issues, severity and recommendations:</b><ul className="mt-1 list-disc space-y-1 pl-4">{pageIssues.map((issue) => <li key={issue.id}>{issue.severity.toUpperCase()} · {issue.title}: {issue.recommendation}</li>)}</ul></div>}{pageRedirects.length > 0 && <div><b>Related redirect chain:</b><ul className="mt-1 list-disc pl-4">{pageRedirects.map((redirect) => <li key={`${redirect.from}-${redirect.to}`}>HTTP {redirect.status}: {redirect.from} → {redirect.to}</li>)}</ul></div>}{priorPage ? <div className="border-t border-slate-200 pt-2"><b>Previous saved scan:</b> {new Date(previousScan!.checkedAt).toLocaleString()} · HTTP {priorPage.status}<p className="mt-1">SEO findings: {priorPage.issues.join(' · ') || 'None'}</p><p>Current: {page.issues.join(' · ') || 'None'}</p></div> : <p className="border-t border-slate-200 pt-2 text-slate-500">No previous scan data for this exact URL.</p>}<p className="border-t border-slate-200 pt-2 text-slate-500">Lighthouse metrics are site-level for the scan target and are not assigned to every crawled page.</p></div></details></td><td className="py-3 pr-4">{page.title ? <span title={page.title}>{page.titleLength} chars</span> : <span className="text-red-600">Missing</span>}</td><td className="py-3 pr-4">{page.description ? `${page.description.length} chars` : <span className="text-red-600">Missing</span>}</td><td className="py-3 pr-4">{page.h1Count}</td><td className="py-3">{page.issues.length ? <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">{page.issues.length} issue(s)</span> : <span className="text-emerald-700">Looks good</span>}{page.issues.length > 0 && <p className="mt-1 max-w-72 text-xs text-slate-500">{page.issues.join(' · ')}</p>}</td></tr>; })}</tbody></table></div></section>

        <div className="grid gap-5 lg:grid-cols-2"><section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-bold">Web Vitals & Lighthouse diagnostics</h2><p className="mt-1 text-xs text-slate-500">LCP and CLS are Core Web Vitals; TBT is a Lighthouse diagnostic. Historical successful values are shown separately in Analytics & trends.</p>{current.speed?.error && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-900">{explainPageSpeedError(current.speed.error)}</p>}<div className="mt-4 grid grid-cols-3 gap-3">{[{label:'LCP',value:current.speed.lcpMs===null?'Unavailable':`${(current.speed.lcpMs/1000).toFixed(1)}s`},{label:'CLS',value:current.speed.cls===null?'Unavailable':current.speed.cls.toFixed(3)},{label:'TBT (Lighthouse diagnostic)',value:current.speed.tbtMs===null?'Unavailable':`${Math.round(current.speed.tbtMs)}ms`}].map(x=><div key={x.label} className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">{x.label}</p><p className="mt-2 text-xl font-bold">{x.value}</p></div>)}</div>{(current.speed.findings?.length ?? 0) > 0 && <details className="mt-4"><summary className="cursor-pointer text-sm font-semibold text-brand-700">Show Lighthouse audit details ({current.speed.findings.length})</summary><div className="mt-3 space-y-2">{current.speed.findings.map(audit=><div key={audit.id} className="rounded-lg bg-slate-50 p-3"><div className="flex justify-between gap-3"><p className="text-sm font-semibold">{audit.title}</p><span className="shrink-0 text-xs text-slate-500">{Math.round((audit.score ?? 0)*100)}/100</span></div>{audit.displayValue && <p className="mt-1 text-xs text-slate-500">Measured: {audit.displayValue}</p>}<p className="mt-1 text-xs leading-5 text-slate-600">{audit.description}</p></div>)}</div></details>}</section>
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-bold">Monitoring & database notes</h2>{current.warnings.length ? <ul className="mt-3 space-y-2">{current.warnings.map((w,i)=><li key={i} className="flex gap-2 text-sm text-amber-800"><AlertTriangle size={16} className="mt-0.5 shrink-0"/>{w}</li>)}</ul> : <p className="mt-3 flex gap-2 text-sm text-emerald-700"><CheckCircle2 size={17}/>No scan warnings.</p>}
            <div className="mt-4 rounded-xl border border-slate-200 p-3"><div className="flex items-center gap-2"><Database size={16} className={historyConfigured ? 'text-emerald-600' : 'text-amber-600'}/><p className="text-sm font-semibold">Supabase scan history</p><span className={`ml-auto rounded-full px-2 py-1 text-[10px] font-bold ${historyConfigured ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>{historyConfigured ? 'READY' : 'SETUP NEEDED'}</span></div><p className="mt-2 text-xs leading-5 text-slate-600">{storageNote || historyNote || 'History setup has not been checked yet.'}</p>{!historyConfigured && <p className="mt-2 text-xs leading-5 text-slate-500">One-time setup: download <a href="/supabase-schema.sql" download className="font-semibold text-brand-700 underline">supabase-schema.sql</a>, paste it into Supabase → SQL Editor, click Run, then retry the scan.</p>}</div>
          </section></div>
      </>}

      {current && <div className="mb-6"><EmailNotificationHistory siteUrl={current.siteUrl} refreshKey={`${current.id}-${emailHistoryRefresh}`}/></div>}
      <section id="scan-history" className="mt-8 scroll-mt-36 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="mb-4 flex items-center justify-between"><div><h2 className="font-bold">Recent scan history</h2><p className="mt-1 text-xs text-slate-500">Click a saved run to open its report and timestamped activity.</p></div><span className="text-xs text-slate-500">Last {history.length} scans</span></div>{history.length ? <div className="space-y-2">{history.map(item=><button key={item.id} onClick={()=>{setScan(item);setSiteUrlInput(item.siteUrl);setStorageNote('Viewing a saved scan from Supabase.')}} className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-100 p-3 text-left hover:bg-slate-50"><div><p className="text-sm font-semibold">{timeLabel(item.checkedAt)}</p><p className="mt-1 max-w-2xl truncate text-xs text-slate-500">{item.siteUrl}</p><p className="mt-1 text-xs text-slate-500">{item.pagesChecked} pages · {item.detailedIssues?.length ?? item.linkIssues.length} findings</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-bold capitalize ${statusClass(item.overallStatus)}`}>{item.overallStatus}</span></button>)}</div> : <div className="rounded-xl bg-slate-50 p-4"><p className="text-sm text-slate-700">No saved scans yet.</p><p className="mt-1 text-xs leading-5 text-slate-500">{historyNote || 'To keep history between sessions, connect Supabase and create the website_scans table.'}</p></div>}</section>
      <div id="websites" className="mt-6 scroll-mt-36">
        <MonitoredWebsites onSelectSite={(url) => setSiteUrlInput(url)} selectedUrl={siteUrlInput} />
      </div>
      <footer className="mt-8 text-center text-xs text-slate-400">Website Monitor AI · Monitoring is read-only and does not change your website.</footer>
    </div>
  </main>;
}
