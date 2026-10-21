'use client';

import { useMemo, useState } from 'react';
import { Activity, BarChart3, CircleAlert, Clock3, Gauge } from 'lucide-react';
import type { IssueCategory, IssueDetail, ScanResult } from '@/types';
import { explainPageSpeedError, hasLighthouseData } from '@/lib/presentation';
import { isSameSite } from '@/lib/url-identity';

type Props = { current: ScanResult; history: ScanResult[] };
type ScoreKey = 'performance' | 'accessibility' | 'bestPractices' | 'seo';
type ScoreSeries = { key: ScoreKey; label: string; color: string };

const SCORE_SERIES: ScoreSeries[] = [
  { key: 'performance', label: 'Performance', color: '#2563eb' },
  { key: 'accessibility', label: 'Accessibility', color: '#16a34a' },
  { key: 'bestPractices', label: 'Best practices', color: '#9333ea' },
  { key: 'seo', label: 'SEO', color: '#ea580c' },
];

function sameWebsite(first: string, second: string) {
  return (
    isSameSite(first, second)
  );
}

function getFindings(scan: ScanResult): IssueDetail[] {
  return Array.isArray(scan.detailedIssues) ? scan.detailedIssues : [];
}

function MetricLine({
  title,
  unit,
  values,
  lowerIsBetter = true,
  digits = 1,
  unavailableNote,
}: {
  title: string;
  unit: string;
  values: Array<{ label: string; value: number | null }>;
  lowerIsBetter?: boolean;
  digits?: number;
  unavailableNote?: string;
}) {
  const validValues = values.filter((item) => item.value !== null && Number.isFinite(item.value));
  const first = validValues[0]?.value;
  const last = validValues[validValues.length - 1]?.value;
  const latestScanValue = values[values.length - 1]?.value ?? null;
  const latestScanUnavailable = values.length > 0 && latestScanValue === null;
  const changed = first !== undefined && first !== null && last !== undefined && last !== null && first !== last;
  const improved = changed && (lowerIsBetter ? (last as number) < (first as number) : (last as number) > (first as number));
  const width = 320;
  const height = 104;
  const padding = { top: 12, right: 12, bottom: 24, left: 12 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const numbers = validValues.map((entry) => entry.value as number);
  const minValue = numbers.length ? Math.min(...numbers) : 0;
  const maxValue = numbers.length ? Math.max(...numbers) : 1;
  const spread = maxValue - minValue || Math.max(Math.abs(maxValue) * 0.15, 0.01);
  const points = values.map((entry, index) => entry.value == null ? null : ({
    ...entry,
    x: values.length === 1 ? width / 2 : padding.left + (index / (values.length - 1)) * plotWidth,
    y: padding.top + (1 - ((entry.value - minValue) / spread)) * plotHeight,
  })).filter((point): point is { label: string; value: number; x: number; y: number } => point !== null);
  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');

  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-slate-800">{title}</p>
          <p className="mt-1 text-xs text-slate-500">{unit} · lower is usually better{!lowerIsBetter ? ' (higher is better)' : ''}</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold text-slate-900">{latestScanUnavailable ? 'Unavailable' : last == null ? 'Unavailable' : `${last.toFixed(digits)}${unit === 'score' ? '' : ` ${unit}`}`}</p>
          {latestScanUnavailable && last != null && <p className="max-w-40 text-xs text-slate-500">Last successful: {last.toFixed(digits)}{unit === 'score' ? '' : ` ${unit}`} ({validValues[validValues.length - 1]?.label})</p>}
          {!latestScanUnavailable && changed && <p className={`text-xs font-semibold ${improved ? 'text-emerald-700' : 'text-amber-700'}`}>{improved ? 'Improved' : 'Needs review'} from {first?.toFixed(digits)}{unit === 'score' ? '' : ` ${unit}`}</p>}
        </div>
      </div>
      {validValues.length > 0 ? (
        <svg className="mt-3 h-auto w-full" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title} trend chart`}>
          {[0, 0.5, 1].map((fraction) => {
            const y = padding.top + fraction * plotHeight;
            return <line key={fraction} x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="#e2e8f0" strokeDasharray="3 4" />;
          })}
          {points.length > 1 && <path d={path} fill="none" stroke="#2563eb" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />}
          {points.map((point, index) => <g key={`${point.label}-${index}`}><circle cx={point.x} cy={point.y} r="4.5" fill="#2563eb" stroke="white" strokeWidth="2"><title>{`${point.label}: ${(point.value as number).toFixed(digits)} ${unit}`}</title></circle>{(index === 0 || index === points.length - 1 || points.length <= 4) && <text x={point.x} y={height - 7} fill="#64748b" fontSize="9" textAnchor="middle">{point.label}</text>}</g>)}
        </svg>
      ) : <p className="mt-4 rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-900">{unavailableNote || 'No successful metric values are saved yet.'}</p>}
      {values.length < 2 && <p className="mt-2 text-xs text-slate-400">Run another scan of this website to build a trend.</p>}
    </div>
  );
}

function HorizontalBars({ items, emptyMessage }: { items: Array<{ label: string; value: number; color: string }>; emptyMessage: string }) {
  const maxValue = Math.max(1, ...items.map((item) => item.value));
  if (!items.length || items.every((item) => item.value === 0)) return <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">{emptyMessage}</p>;
  return <div className="space-y-3">{items.map((item) => (
    <div key={item.label}>
      <div className="mb-1.5 flex items-center justify-between gap-3 text-xs"><span className="font-medium text-slate-700">{item.label}</span><span className="tabular-nums text-slate-500">{item.value}</span></div>
      <div className="h-2.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full transition-all" style={{ width: `${(item.value / maxValue) * 100}%`, backgroundColor: item.color }} /></div>
    </div>
  ))}</div>;
}

export function AnalyticsDashboard({ current, history }: Props) {
  const [range, setRange] = useState<'7d' | '30d' | '90d' | 'all'>('30d');
  const findings = useMemo(() => getFindings(current), [current]);
  const siteHistory = useMemo(() => {
    // Show chronological history for this hostname only; never mix different websites.
    const savedForSite = history.filter((scan) => sameWebsite(scan.siteUrl, current.siteUrl) && scan.checkedAt <= current.checkedAt);
    const combined = new Map<string, ScanResult>();
    savedForSite.forEach((scan) => combined.set(scan.id, scan));
    combined.set(current.id, current);
    const sorted = Array.from(combined.values()).sort((a, b) => a.checkedAt.localeCompare(b.checkedAt));
    if (range !== 'all') {
      const days = Number.parseInt(range, 10);
      const cutoff = new Date(current.checkedAt).getTime() - days * 24 * 60 * 60 * 1000;
      const selected = sorted.filter((scan) => new Date(scan.checkedAt).getTime() >= cutoff);
      return selected.length ? selected.slice(-50) : [current];
    }
    return sorted.slice(-50);
  }, [current, history, range]);

  const scoreHistory = siteHistory.map((scan, index) => ({
    scan,
    label: siteHistory.length === 1 ? 'Current' : `${index + 1} · ${new Date(scan.checkedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}`,
  }));
  const hasCurrentLighthouseData = hasLighthouseData(current.speed);
  const lastSuccessfulAudit = [...siteHistory].reverse().find((scan) => hasLighthouseData(scan.speed));
  const anySuccessfulLighthouseData = siteHistory.some((scan) => hasLighthouseData(scan.speed));
  const pageSpeedNote = current.speed?.error ? explainPageSpeedError(current.speed.error) : 'PageSpeed Insights has not returned usable score data for this scan.';

  const categoryItems = [
    { key: 'availability', label: 'Availability', color: '#dc2626' },
    { key: 'links', label: 'Links', color: '#ea580c' },
    { key: 'seo', label: 'SEO', color: '#7c3aed' },
    { key: 'performance', label: 'Performance', color: '#2563eb' },
    { key: 'accessibility', label: 'Accessibility', color: '#059669' },
    { key: 'best-practices', label: 'Best practices', color: '#0891b2' },
  ];
  const countsByCategory = categoryItems.map((category) => ({
    label: category.label,
    color: category.color,
    value: findings.filter((issue) => issue.category === category.key).length,
  }));
  const severityItems = [
    { label: 'Critical', color: '#991b1b', value: findings.filter((issue) => issue.severity === 'critical').length },
    { label: 'High', color: '#dc2626', value: findings.filter((issue) => issue.severity === 'high').length },
    { label: 'Medium', color: '#d97706', value: findings.filter((issue) => issue.severity === 'medium').length },
    { label: 'Low', color: '#059669', value: findings.filter((issue) => issue.severity === 'low').length },
  ];

  const scoreCards = [
    { label: 'Performance', value: current.speed?.performance, color: '#2563eb' },
    { label: 'Accessibility', value: current.speed?.accessibility, color: '#16a34a' },
    { label: 'Best practices', value: current.speed?.bestPractices, color: '#9333ea' },
    { label: 'SEO', value: current.speed?.seo, color: '#ea580c' },
  ];
  const hasPrevious = siteHistory.length > 1;
  const lcpValues = scoreHistory.map(({ scan, label }) => ({ label, value: scan.speed?.lcpMs == null ? null : scan.speed.lcpMs / 1000 }));
  const clsValues = scoreHistory.map(({ scan, label }) => ({ label, value: scan.speed?.cls ?? null }));
  const tbtValues = scoreHistory.map(({ scan, label }) => ({ label, value: scan.speed?.tbtMs ?? null }));

  return (
    <section className="mb-6 space-y-4" aria-labelledby="analytics-title">
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
        <div>
          <div className="flex items-center gap-2"><BarChart3 size={20} className="text-brand-700" /><h2 id="analytics-title" className="text-xl font-bold">Analytics & trends</h2></div>
          <p className="mt-1 text-sm text-slate-500">Current scan numbers and charts together. Trends only include saved scans for this website.</p>
        </div>
        <div className="flex flex-wrap items-center gap-1 rounded-xl bg-slate-100 p-1" aria-label="Trend date range">{([{ value: '7d', label: '7 days' }, { value: '30d', label: '30 days' }, { value: '90d', label: '90 days' }, { value: 'all', label: 'All' }] as const).map((item) => <button key={item.value} onClick={() => setRange(item.value)} className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${range === item.value ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>{item.label}</button>)}<span className="ml-1 px-2 text-xs text-slate-500">{siteHistory.length} scans</span></div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2"><Gauge size={18} className="text-blue-700" /><h3 className="font-bold">Current score snapshot</h3></div>
          <p className="mt-1 text-xs text-slate-500">Exact Lighthouse scores with visual bars (out of 100).</p>
          <div className="mt-5 space-y-4">{scoreCards.map((score) => (
            <div key={score.label}>
              <div className="mb-1.5 flex items-center justify-between gap-3 text-sm"><span className="font-medium text-slate-700">{score.label}</span><strong className="tabular-nums text-slate-900">{score.value == null ? 'Unavailable' : `${score.value}/100`}</strong></div>
              <div className="h-3 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full" style={{ width: `${score.value ?? 0}%`, backgroundColor: score.color }} /></div>
            </div>
          ))}</div>
          {!hasCurrentLighthouseData && <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950"><strong>Current audit unavailable.</strong><p className="mt-1">{pageSpeedNote}</p></div>}
          {!hasCurrentLighthouseData && lastSuccessfulAudit && lastSuccessfulAudit.id !== current.id && <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-blue-950"><strong>Last successful audit (historical, not this scan):</strong> {new Date(lastSuccessfulAudit.checkedAt).toLocaleString()}<div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">{[{label:'Performance',value:lastSuccessfulAudit.speed.performance},{label:'Accessibility',value:lastSuccessfulAudit.speed.accessibility},{label:'Best practices',value:lastSuccessfulAudit.speed.bestPractices},{label:'SEO',value:lastSuccessfulAudit.speed.seo}].map((metric) => <div key={metric.label} className="rounded-md bg-white/80 p-2"><span className="block text-slate-600">{metric.label}</span><strong>{metric.value == null ? 'Unavailable' : `${metric.value}/100`}</strong></div>)}</div></div>}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2"><BarChart3 size={18} className="text-blue-700" /><h3 className="font-bold">Findings by category</h3></div>
          <p className="mt-1 text-xs text-slate-500">Counts are from the current scan’s detailed findings.</p>
          <div className="mt-5"><HorizontalBars items={countsByCategory} emptyMessage="No categorized findings are available for this scan." /></div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2"><Activity size={18} className="text-blue-700" /><h3 className="font-bold">Lighthouse score history</h3></div>
          <p className="mt-1 text-xs text-slate-500">Performance, accessibility, best practices and SEO across scans of this hostname.</p>
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2">{SCORE_SERIES.map((series) => <span key={series.key} className="inline-flex items-center gap-1.5 text-xs text-slate-600"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: series.color }} />{series.label}</span>)}</div>
          <div className="mt-3 overflow-x-auto">
            {!anySuccessfulLighthouseData ? <div className="flex min-h-40 flex-col justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600"><strong className="text-slate-800">No Lighthouse score data to plot yet.</strong><p className="mt-1 text-xs leading-5">{pageSpeedNote}</p></div> : <svg viewBox="0 0 680 250" className="h-auto min-w-[500px] w-full" role="img" aria-label="Line chart of Lighthouse scores over time">
              {[0, 25, 50, 75, 100].map((tick) => { const y = 20 + (100 - tick) * 1.8; return <g key={tick}><line x1="45" y1={y} x2="660" y2={y} stroke="#e2e8f0" strokeDasharray="3 4"/><text x="35" y={y + 4} textAnchor="end" fontSize="10" fill="#64748b">{tick}</text></g>; })}
              {SCORE_SERIES.map((series) => {
                const points = scoreHistory.map(({ scan }, index) => {
                  const value = scan.speed?.[series.key] ?? null;
                  const x = scoreHistory.length === 1 ? 352 : 48 + (index / (scoreHistory.length - 1)) * 608;
                  return value == null ? null : { x, y: 20 + (100 - value) * 1.8, value, scan };
                }).filter((point): point is { x: number; y: number; value: number; scan: ScanResult } => point !== null);
                const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
                return <g key={series.key}>{points.length > 1 && <path d={path} fill="none" stroke={series.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>}{points.map((point, index) => <circle key={`${point.scan.id}-${series.key}-${index}`} cx={point.x} cy={point.y} r="4" fill={series.color} stroke="white" strokeWidth="1.5"><title>{`${series.label}: ${point.value}/100 · ${new Date(point.scan.checkedAt).toLocaleString()}`}</title></circle>)}</g>;
              })}
              {scoreHistory.map(({ scan, label }, index) => { const x = scoreHistory.length === 1 ? 352 : 48 + (index / (scoreHistory.length - 1)) * 608; return <text key={scan.id} x={x} y="232" textAnchor="middle" fontSize="9" fill="#64748b">{label}</text>; })}
            </svg>}
          </div>
          {!hasPrevious && anySuccessfulLighthouseData && <p className="mt-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">This is the first saved scan for this website. Run more scans to see a trend line.</p>}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2"><CircleAlert size={18} className="text-amber-700" /><h3 className="font-bold">Severity breakdown</h3></div>
          <p className="mt-1 text-xs text-slate-500">Prioritize critical and high severity findings first.</p>
          <div className="mt-5"><HorizontalBars items={severityItems} emptyMessage="No findings to break down by severity." /></div>
          <div className="mt-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">{findings.length} total finding(s) across {new Set(findings.map((item) => item.url || current.siteUrl)).size} affected URL(s).</div>
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <MetricLine title="Largest Contentful Paint (LCP)" unit="s" values={lcpValues} digits={2} unavailableNote={pageSpeedNote} />
        <MetricLine title="Cumulative Layout Shift (CLS)" unit="score" values={clsValues} digits={3} unavailableNote={pageSpeedNote} />
        <MetricLine title="Total Blocking Time (TBT · Lighthouse diagnostic)" unit="ms" values={tbtValues} digits={0} unavailableNote={pageSpeedNote} />
      </div>
      <div className="flex items-start gap-2 rounded-xl border border-blue-100 bg-blue-50/70 p-3 text-xs leading-5 text-blue-900"><Clock3 size={15} className="mt-0.5 shrink-0" /> Lighthouse lab scores can vary from run to run. Review trends across multiple scans and make sure the crawl settings are comparable before drawing conclusions.</div>
    </section>
  );
}
