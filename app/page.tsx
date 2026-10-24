'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, AlertCircle, AlertTriangle, ArrowUpRight, CheckCircle2, Clock3, Database, Gauge, Globe, Link2, RefreshCw, Search, Sparkles, TerminalSquare, ChevronDown, Mail } from 'lucide-react';
import type { ScanActivity, ScanResult } from '@/types';
import { ReportTools, ScanComparison } from '@/components/report-tools';
import { IssueExplorer } from '@/components/issue-explorer';
import { AnalyticsDashboard } from '@/components/analytics-dashboard';
import { explainPageSpeedError, uniqueActivities } from '@/lib/presentation';
import { AuthControls } from '@/components/auth-controls';
import { SeverityBadge } from '@/components/dashboard-ui';
import { DashboardHero, LighthouseScoreRings, LiveActivityPanel, OverviewKpiStrip } from '@/components/dashboard-sections';
import { MonitoredWebsites } from '@/components/monitored-websites';
import { isSameSite } from '@/lib/url-identity';
import { EmailNotificationHistory } from '@/components/email-notification-history';
import { MegaMenu } from '@/components/mega-menu';
import { ScrollProgress } from '@/components/scroll-progress';

type StreamEvent =
  | { type: 'activity'; activity: ScanActivity }
  | { type: 'complete'; result: ScanResult; storage: { saved: boolean; reason?: string } }
  | { type: 'error'; error: string; activity?: ScanActivity };

function statusClass(status: ScanResult['overallStatus']) { return status === 'healthy' ? 'bg-emerald-50 text-emerald-700' : status === 'down' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-800'; }
function timeLabel(value: string) { return new Date(value).toLocaleString(); }

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

  return (
    <main className="min-h-screen bg-canvas pb-12">
      <ScrollProgress />
      <MegaMenu
        activeSection={activeSection}
        siteUrl={siteUrlInput || 'No website selected'}
        lastScanLabel={current ? `Last scan ${timeLabel(current.checkedAt)}` : 'No scans yet'}
        issueCount={current ? (current.detailedIssues ?? []).length : 0}
        busy={busy}
        onRunScan={runScan}
        onSendTestEmail={sendTestEmail}
        onNavChange={setActiveSection}
        currentStatus={current?.overallStatus ?? 'idle'}
      />
      <div className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      {testEmailMsg && (
        <div className={`mb-5 rounded-xl border p-4 text-xs font-medium flex items-center justify-between ${testEmailMsg.startsWith('✅') ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'}`}>
          <span>{testEmailMsg}</span>
          <button onClick={() => setTestEmailMsg('')} className="ml-4 underline hover:no-underline">Dismiss</button>
        </div>
      )}
      <div id="websites" className="mt-6 scroll-mt-36">
        <MonitoredWebsites onSelectSite={(url) => setSiteUrlInput(url)} selectedUrl={siteUrlInput} />
      </div>
      <div id="overview" className="mt-8 mb-6 scroll-mt-36 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div className="min-w-0"><p className="text-xs font-semibold tracking-wide text-brand-700">MONITORING WORKSPACE</p><h1 className="mt-2 text-[26px] font-semibold tracking-tight text-slate-900 sm:text-3xl">Website overview</h1><p className="mt-1.5 max-w-2xl truncate text-sm text-slate-500">{siteUrlInput || 'Select a monitored website or enter a URL to get started.'}</p></div>
        <div className="flex flex-wrap items-center gap-2">
          {current && <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold capitalize ${statusClass(current.overallStatus)}`}><span className={`h-1.5 w-1.5 rounded-full ${current.overallStatus === 'healthy' ? 'bg-emerald-500' : current.overallStatus === 'down' ? 'bg-red-500' : 'bg-amber-500'}`}/>{current.uptime.status === null ? 'Inconclusive' : current.overallStatus}</span>}
          <span className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600"><Clock3 size={14}/>{current ? timeLabel(current.checkedAt) : 'No scans yet'}</span>
        </div>
      </div>
      {error && <div className="mb-5 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><AlertTriangle size={18} className="mt-0.5 shrink-0"/><div><strong>Scan failed</strong><p className="mt-1">{error}</p><p className="mt-1 text-red-700">Check your environment variables and server logs.</p></div></div>}

      <DashboardHero siteUrl={siteUrlInput} onSiteUrlChange={setSiteUrlInput} busy={busy} elapsedSeconds={elapsedSeconds} current={current} onRunScan={runScan}/>

      <details id="scan-configuration" className="mb-5 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-600 sm:px-5">
          <span className="flex min-w-0 items-center gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700"><Search size={17}/></span><span><span className="block text-sm font-semibold text-slate-900">Scan configuration</span><span className="mt-0.5 block text-xs text-slate-500">Website URL, crawl depth, sitemap, and email alerts</span></span></span><ChevronDown size={17} className="shrink-0 text-slate-400 transition-transform"/>
        </summary>
        <div className="border-t border-slate-100 p-4 sm:p-5">
        <div className="mb-4"><h2 className="font-semibold text-slate-900">Configure the next scan</h2><p className="mt-1 text-xs text-slate-500">Higher crawl limits may take longer and send more requests to your website.</p></div>
        <div className="grid gap-4 sm:max-w-xs">
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
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="max-w-3xl text-xs leading-5 text-slate-500">Security: private/local IPs, localhost and non-standard ports are blocked. Only same-site links and redirects are crawled.</p><p className="text-xs text-slate-500">Each website has its own scan history and comparison.</p></div>
        {current?.crawlConfig && <p className="mt-3 text-xs text-slate-500">Last scan settings: limit {current.crawlConfig.limit} URLs · Sitemap {current.crawlConfig.sitemapEnabled ? `enabled (${current.crawlConfig.sitemapUrlsDiscovered} URL(s) discovered)` : 'disabled'}.</p>}
        </div>
      </details>

      {!current && !busy && <div className="mb-6 rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-700"><Globe size={26}/></div><h2 className="mt-4 text-xl font-semibold">Ready for your first scan</h2><p className="mx-auto mt-2 max-w-lg text-sm text-slate-500">Enter any public website URL above, choose a crawl limit, then click Scan this website. Results are read-only and will not change the website.</p><button onClick={runScan} className="mt-5 rounded-xl bg-brand-700 px-5 py-3 text-sm font-semibold text-white hover:bg-brand-800">Start first scan</button></div>}

      {current && <>
        <OverviewKpiStrip current={current} history={history}/>
                <div id="reports" className="mb-6 scroll-mt-36"><ReportTools current={current} previous={previousScan} history={history}/></div>
        <LighthouseScoreRings current={current} history={history} onRetryScan={runScan}/>
        <AnalyticsDashboard current={current} history={history}/>
        <section id="priority-issues" className="mb-6 scroll-mt-36 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="priority-issues-title">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-brand-700">First look</p><h2 id="priority-issues-title" className="mt-1 text-lg font-bold text-slate-900">Priority issues</h2><p className="mt-1 text-sm text-slate-500">Highest-severity findings from this scan, ordered for triage.</p></div><a href="#issue-management" className="text-sm font-semibold text-brand-700 hover:underline">Open full issue management</a></div>
          {priorityIssues.length ? <div className="grid min-w-0 gap-3 lg:grid-cols-2">{priorityIssues.map((issue) => { const affectedPages = new Set((current.detailedIssues ?? []).filter((other) => other.category === issue.category && other.title === issue.title && other.url).map((other) => other.url)).size; return <article key={issue.id} className="min-w-0 rounded-xl border border-slate-200 p-4"><div className="flex flex-wrap items-center gap-2"><SeverityBadge severity={issue.severity}/><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">{issue.category}</span><span className="ml-auto text-xs text-slate-500">{affectedPages ? `${affectedPages} affected page(s)` : 'Site-wide'}</span></div><h3 className="mt-3 break-words font-semibold text-slate-900">{issue.title}</h3><p className="mt-1 break-words line-clamp-2 text-sm text-slate-600">{issue.what}</p><p className="mt-3 break-words text-xs leading-5 text-slate-600"><b>Next action:</b> {issue.recommendation}</p></article>; })}</div> : <p className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">No findings are currently recorded for this scan.</p>}
        </section>
        <div className="mb-6"><ScanComparison current={current} previous={previousScan}/></div>
        <div className="mb-6"><section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-2"><div className="rounded-lg bg-brand-50 p-2 text-brand-700"><Sparkles size={19}/></div><div><h2 className="font-bold">AI analysis</h2><p className="text-xs text-slate-500">Summary and suggested next steps</p></div></div><p className="mt-4 text-sm leading-6 text-slate-700">{current.aiSummary}</p><div className="mt-4 space-y-3">{current.recommendations.map((item, i) => <div key={i} className="flex gap-3 rounded-xl bg-slate-50 p-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-xs font-bold text-brand-700 shadow-sm">{i+1}</span><p className="text-sm leading-5 text-slate-700">{item}</p></div>)}</div></section></div>
        <div className="mb-6"><section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-2"><div className="rounded-lg bg-amber-50 p-2 text-amber-700"><Link2 size={19}/></div><div><h2 className="font-bold">Broken links / request errors</h2><p className="text-xs text-slate-500">Internal URLs that returned an error</p></div></div>{current.linkIssues.length === 0 ? <div className="mt-5 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">No broken internal links detected in this crawl.</div> : <div className="mt-4 max-h-96 space-y-2 overflow-auto">{current.linkIssues.map((issue, i) => <div key={`${issue.url}-${i}`} className="rounded-xl border border-slate-100 p-3"><div className="flex items-start justify-between gap-3"><p className="break-all text-sm font-medium text-slate-800">{issue.url}</p><span className="shrink-0 rounded-md bg-red-50 px-2 py-1 text-xs font-bold text-red-700">{issue.status ?? 'ERR'}</span></div><p className="mt-1 text-xs leading-5 text-slate-500">{issue.message}</p><p className="mt-2 text-xs text-slate-700">Recommended: verify the target URL and update the source page link or restore the target page.</p></div>)}</div>}</section></div>
        <section id="issue-management" className="mb-6 scroll-mt-36 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-2"><div className="rounded-lg bg-red-50 p-2 text-red-700"><AlertCircle size={19}/></div><div><h2 className="font-bold">Issues explained in detail</h2><p className="text-xs text-slate-500">Each finding includes what was detected, why it matters, severity, affected URL and a recommended fix.</p></div></div>
          <IssueExplorer issues={current.detailedIssues ?? []} siteUrl={current.siteUrl}/>
        </section>
        <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2"><div className="rounded-lg bg-blue-50 p-2 text-blue-700"><ArrowUpRight size={19}/></div><div><h2 className="font-bold">Redirect-aware crawl</h2><p className="text-xs text-slate-500">Same-site 301, 302, 303, 307 and 308 redirects are followed up to eight hops. Redirects to unrelated hosts are not followed.</p></div><span className="ml-auto rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold">{current.redirects?.length ?? 0} hops</span></div>
          {(current.redirects?.length ?? 0) > 0 ? <div className="mt-4 space-y-2">{current.redirects!.map((redirect, index) => <div key={`${redirect.from}-${redirect.to}-${index}`} className="rounded-xl border border-slate-100 p-3"><div className="flex flex-wrap items-center gap-2"><span className="rounded-md bg-blue-50 px-2 py-1 text-xs font-bold text-blue-700">HTTP {redirect.status}</span><p className="break-all text-sm font-medium text-slate-700">{redirect.from}</p></div><p className="mt-2 break-all text-xs text-slate-500">Final/next URL: <a href={redirect.to} target="_blank" rel="noreferrer" className="text-brand-700 hover:underline">{redirect.to}</a></p></div>)}</div> : <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">No followed same-site redirect hops were recorded in this scan. Redirect chains are included here when encountered.</div>}
        </section>
        <LiveActivityPanel busy={busy} elapsedSeconds={elapsedSeconds} activities={visibleActivities}/>
        <div className="mb-6 space-y-5"><section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-heading text-base font-semibold">Web Vitals & Lighthouse diagnostics</h2><p className="mt-1 text-xs text-slate-500">LCP and CLS are Core Web Vitals; TBT is a Lighthouse diagnostic. Historical successful values are shown separately in Analytics & trends.</p>{current.speed?.error && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-900">{explainPageSpeedError(current.speed.error)}</p>}<div className="mt-4 grid grid-cols-3 gap-3">{[{label:'LCP',value:current.speed.lcpMs===null?'Unavailable':`${(current.speed.lcpMs/1000).toFixed(1)}s`},{label:'CLS',value:current.speed.cls===null?'Unavailable':current.speed.cls.toFixed(3)},{label:'TBT (Lighthouse diagnostic)',value:current.speed.tbtMs===null?'Unavailable':`${Math.round(current.speed.tbtMs)}ms`}].map(x=><div key={x.label} className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">{x.label}</p><p className="mt-2 text-xl font-bold">{x.value}</p></div>)}</div>{(current.speed.findings?.length ?? 0) > 0 && <details className="mt-4"><summary className="cursor-pointer text-sm font-semibold text-brand-700">Show Lighthouse audit details ({current.speed.findings.length})</summary><div className="mt-3 space-y-2">{current.speed.findings.map(audit=><div key={audit.id} className="rounded-lg bg-slate-50 p-3"><div className="flex justify-between gap-3"><p className="text-sm font-semibold">{audit.title}</p><span className="shrink-0 text-xs text-slate-500">{Math.round((audit.score ?? 0)*100)}/100</span></div>{audit.displayValue && <p className="mt-1 text-xs text-slate-500">Measured: {audit.displayValue}</p>}<p className="mt-1 text-xs leading-5 text-slate-600">{audit.description}</p></div>)}</div></details>}</section>
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-bold">Monitoring & database notes</h2>{current.warnings.length ? <ul className="mt-3 space-y-2">{current.warnings.map((w,i)=><li key={i} className="flex gap-2 text-sm text-amber-800"><AlertTriangle size={16} className="mt-0.5 shrink-0"/>{w}</li>)}</ul> : <p className="mt-3 flex gap-2 text-sm text-emerald-700"><CheckCircle2 size={17}/>No scan warnings.</p>}
            <div className="mt-4 rounded-xl border border-slate-200 p-3"><div className="flex items-center gap-2"><Database size={16} className={historyConfigured ? 'text-emerald-600' : 'text-amber-600'}/><p className="text-sm font-semibold">Supabase scan history</p><span className={`ml-auto rounded-full px-2 py-1 text-[10px] font-bold ${historyConfigured ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>{historyConfigured ? 'READY' : 'SETUP NEEDED'}</span></div><p className="mt-2 text-xs leading-5 text-slate-600">{storageNote || historyNote || 'History setup has not been checked yet.'}</p>{!historyConfigured && <p className="mt-2 text-xs leading-5 text-slate-500">One-time setup: download <a href="/supabase-schema.sql" download className="font-semibold text-brand-700 underline">supabase-schema.sql</a>, paste it into Supabase → SQL Editor, click Run, then retry the scan.</p>}</div>
          </section></div>
        <section id="page-audits" className="mb-6 scroll-mt-36 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="mb-4 flex items-center justify-between"><div><h2 className="font-bold">SEO page review</h2><p className="mt-1 text-xs text-slate-500">Page metadata, headings, canonical URLs and individual images. Expand a page for its saved comparison and page-scoped findings.</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold">{current.seoPages.length} pages</span></div><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead><tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500"><th className="pb-3 pr-4 font-semibold">Page</th><th className="pb-3 pr-4 font-semibold">Title</th><th className="pb-3 pr-4 font-semibold">Description</th><th className="pb-3 pr-4 font-semibold">H1</th><th className="pb-3 font-semibold">Findings</th></tr></thead><tbody>{current.seoPages.map((page, i) => { const priorPage = previousScan?.seoPages?.find((entry) => entry.url === page.url); const pageIssues = (current.detailedIssues ?? []).filter((issue) => issue.url === page.url); const pageRedirects = (current.redirects ?? []).filter((redirect) => redirect.from === page.url || redirect.to === page.url); return <tr key={page.url} className={i%2 ? 'bg-slate-50/70' : ''}><td className="max-w-64 break-all py-3 pr-4 text-slate-700"><a className="inline-flex items-center gap-1 hover:text-brand-700" href={page.url} target="_blank" rel="noreferrer">{new URL(page.url).pathname || '/'}<ArrowUpRight size={13}/></a><details className="mt-2 max-w-xs"><summary className="flex cursor-pointer items-center gap-1 text-xs text-brand-700">Page audit details <ChevronDown size={12}/></summary><div className="mt-2 space-y-2 break-words rounded-lg bg-slate-50 p-3 text-xs"><p><b>HTTP status:</b> {page.status} · <b>Inspected URL/final URL:</b> {page.url}</p><p><b>Title:</b> {page.title || 'Missing'}</p><p><b>Description:</b> {page.description || 'Missing'}</p><p><b>H1 headings:</b> {page.h1Texts?.join(' | ') || (page.h1Count ? `${page.h1Count} H1 heading(s), text unavailable in old scan` : 'Missing')}</p><p><b>Canonical:</b> {page.canonical || 'Missing'}</p>{page.missingAltImages?.length ? <div><b>Images with missing alt ({page.imagesMissingAlt}):</b><ul className="mt-1 list-disc space-y-1 pl-4">{page.missingAltImages.map((src, j) => <li key={`${src}-${j}`} className="break-all"><a href={src.startsWith('http') ? src : undefined} target="_blank" rel="noreferrer" className="text-brand-700 hover:underline">{src}</a></li>)}</ul></div> : null}{pageIssues.length > 0 && <div><b>Issues, severity and recommendations:</b><ul className="mt-1 list-disc space-y-1 pl-4">{pageIssues.map((issue) => <li key={issue.id}>{issue.severity.toUpperCase()} · {issue.title}: {issue.recommendation}</li>)}</ul></div>}{pageRedirects.length > 0 && <div><b>Related redirect chain:</b><ul className="mt-1 list-disc pl-4">{pageRedirects.map((redirect) => <li key={`${redirect.from}-${redirect.to}`}>HTTP {redirect.status}: {redirect.from} → {redirect.to}</li>)}</ul></div>}{priorPage ? <div className="border-t border-slate-200 pt-2"><b>Previous saved scan:</b> {new Date(previousScan!.checkedAt).toLocaleString()} · HTTP {priorPage.status}<p className="mt-1">SEO findings: {priorPage.issues.join(' · ') || 'None'}</p><p>Current: {page.issues.join(' · ') || 'None'}</p></div> : <p className="border-t border-slate-200 pt-2 text-slate-500">No previous scan data for this exact URL.</p>}<p className="border-t border-slate-200 pt-2 text-slate-500">Lighthouse metrics are site-level for the scan target and are not assigned to every crawled page.</p></div></details></td><td className="py-3 pr-4">{page.title ? <span title={page.title}>{page.titleLength} chars</span> : <span className="text-red-600">Missing</span>}</td><td className="py-3 pr-4">{page.description ? `${page.description.length} chars` : <span className="text-red-600">Missing</span>}</td><td className="py-3 pr-4">{page.h1Count}</td><td className="py-3">{page.issues.length ? <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">{page.issues.length} issue(s)</span> : <span className="text-emerald-700">Looks good</span>}{page.issues.length > 0 && <p className="mt-1 max-w-72 text-xs text-slate-500">{page.issues.join(' · ')}</p>}</td></tr>; })}</tbody></table></div></section>
      </>}

      <section id="scan-history" className="mt-8 scroll-mt-36 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="mb-4 flex items-center justify-between"><div><h2 className="font-bold">Recent scan history</h2><p className="mt-1 text-xs text-slate-500">Click a saved run to open its report and timestamped activity.</p></div><span className="text-xs text-slate-500">Last {history.length} scans</span></div>{history.length ? <div className="max-h-[28rem] space-y-2 overflow-y-auto pr-1">{history.map(item=><button key={item.id} onClick={()=>{setScan(item);setSiteUrlInput(item.siteUrl);setStorageNote('Viewing a saved scan from Supabase.')}} className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-100 p-3 text-left hover:bg-slate-50"><div><p className="text-sm font-semibold">{timeLabel(item.checkedAt)}</p><p className="mt-1 max-w-2xl truncate text-xs text-slate-500">{item.siteUrl}</p><p className="mt-1 text-xs text-slate-500">{item.pagesChecked} pages · {item.detailedIssues?.length ?? item.linkIssues.length} findings</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-bold capitalize ${statusClass(item.overallStatus)}`}>{item.overallStatus}</span></button>)}</div> : <div className="rounded-xl bg-slate-50 p-4"><p className="text-sm text-slate-700">No saved scans yet.</p><p className="mt-1 text-xs leading-5 text-slate-500">{historyNote || 'To keep history between sessions, connect Supabase and create the website_scans table.'}</p></div>}</section>
      {current && <div className="mt-6"><EmailNotificationHistory siteUrl={current.siteUrl} refreshKey={`${current.id}-${emailHistoryRefresh}`}/></div>}
      <footer className="mt-8 text-center text-xs text-slate-400">Website Monitor AI · Monitoring is read-only and does not change your website.</footer>
    </div>
  </main>
  );
}
