'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Moon, Sun } from 'lucide-react';
import type { IssueSeverity } from '@/types';

export function GlassCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`glass-card ${className}`}>{children}</div>;
}

export function AnimatedNumber({ value, suffix = '' }: { value: number; suffix?: string }) {
  const [displayValue, setDisplayValue] = useState(value);

  useEffect(() => {
    const duration = 650;
    const startValue = displayValue;
    const startedAt = performance.now();
    let frame = 0;
    const update = (now: number) => {
      const progress = Math.min((now - startedAt) / duration, 1);
      const eased = 1 - (1 - progress) ** 3;
      setDisplayValue(Math.round(startValue + (value - startValue) * eased));
      if (progress < 1) frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return <>{displayValue.toLocaleString()}{suffix}</>;
}

export function Sparkline({ values, color = '#4f46e5', label }: { values: number[]; color?: string; label: string }) {
  const valid = values.filter((value) => Number.isFinite(value));
  if (valid.length < 2) return <span className="sparkline-empty" aria-hidden="true"/>;
  const min = Math.min(...valid);
  const spread = Math.max(Math.max(...valid) - min, Math.abs(min) * 0.08, 1);
  const points = valid.map((value, index) => ({
    x: (index / (valid.length - 1)) * 100,
    y: 25 - ((value - min) / spread) * 20,
  }));
  const path = points.map((point, index) => `${index ? 'L' : 'M'}${point.x},${point.y}`).join(' ');
  return (
    <svg viewBox="0 0 100 30" className="h-9 w-24 overflow-visible" role="img" aria-label={`${label} trend over recent saved scans`}>
      <path d={path} fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      {points.length > 0 && <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r="2.8" fill={color} />}
    </svg>
  );
}

export function KpiCard({
  label,
  value,
  detail,
  icon,
  trend,
  color = '#4f46e5',
  suffix = '',
}: {
  label: string;
  value: number | string;
  detail: string;
  icon: ReactNode;
  trend?: number[];
  color?: string;
  suffix?: string;
}) {
  return (
    <GlassCard className="kpi-card min-w-0 p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="truncate text-xs font-medium text-slate-500">{label}</p>
        <span className="kpi-icon" style={{ color }}>{icon}</span>
      </div>
      <div className="mt-3 flex items-end justify-between gap-2">
        <p className="truncate text-[26px] font-semibold leading-none tracking-tight text-slate-900">
          {typeof value === 'number' ? <AnimatedNumber value={value} suffix={suffix}/> : value}
        </p>
        {trend && <Sparkline values={trend} color={color} label={label}/>}
      </div>
      <p className="mt-2 truncate text-xs text-slate-500">{detail}</p>
    </GlassCard>
  );
}

export function ScoreRing({ label, score, color, icon }: { label: string; score: number | null; color: string; icon: ReactNode }) {
  const circumference = 2 * Math.PI * 38;
  const progress = score == null ? 0 : Math.min(100, Math.max(0, score));
  return (
    <div className="score-ring-card flex min-w-0 items-center gap-3 rounded-xl border border-slate-200/80 bg-white/75 p-3 sm:flex-col sm:gap-2 sm:p-4">
      <div className="relative h-[76px] w-[76px] shrink-0" role="img" aria-label={`${label}: ${score == null ? 'unavailable' : `${score} out of 100`}`}>
        <svg viewBox="0 0 88 88" className="h-full w-full -rotate-90">
          <circle cx="44" cy="44" r="38" fill="none" stroke="var(--ring-track)" strokeWidth="7"/>
          <circle className="score-ring-progress" cx="44" cy="44" r="38" fill="none" stroke={color} strokeWidth="7" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - progress / 100)}/>
        </svg>
        <span className="absolute inset-0 flex flex-col items-center justify-center text-sm font-semibold text-slate-900">{score == null ? '—' : score}<span className="text-[9px] font-medium text-slate-400">{score == null ? '' : '/100'}</span></span>
      </div>
      <div className="min-w-0 sm:text-center">
        <span className="mb-1 inline-flex text-slate-500 sm:hidden">{icon}</span>
        <p className="truncate text-xs font-semibold text-slate-700">{label}</p>
        <p className="mt-1 text-[11px] text-slate-500">{score == null ? 'Current audit unavailable' : 'Current Lighthouse score'}</p>
      </div>
    </div>
  );
}

export function SeverityBadge({ severity }: { severity: IssueSeverity }) {
  return <span className={`severity-badge severity-${severity}`}><span aria-hidden="true" className="severity-dot"/>{severity}</span>;
}

export function SectionHeader({ title, description, icon, action }: { title: string; description?: string; icon?: ReactNode; action?: ReactNode }) {
  return (
    <div className="section-header mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        {icon && <span className="section-icon">{icon}</span>}
        <div className="min-w-0">
          <h2 className="font-heading text-base font-semibold tracking-tight text-slate-900 sm:text-lg">{title}</h2>
          {description && <p className="mt-1 text-xs leading-5 text-slate-500 sm:text-sm">{description}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    try { setDark(localStorage.getItem('wm_theme') === 'dark'); }
    catch { setDark(false); }
  }, []);

  function changeTheme(enabled: boolean) {
    setDark(enabled);
    try { localStorage.setItem('wm_theme', enabled ? 'dark' : 'light'); }
    catch { /* Theme remains active for this page view. */ }
  }

  return (
    <label className="theme-toggle" title="Toggle light or dark theme">
      <input id="wm-theme-toggle" type="checkbox" aria-label="Use dark theme" checked={dark} onChange={(event) => changeTheme(event.target.checked)}/>
      <span className="theme-toggle-track"><Sun size={14}/><Moon size={14}/><span className="theme-toggle-thumb"/></span>
    </label>
  );
}

export function SeverityDonut({ items }: { items: Array<{ label: string; value: number; color: string }> }) {
  const total = items.reduce((sum, item) => sum + item.value, 0);
  let current = 0;
  const stops = items.map((item) => {
    const start = total ? (current / total) * 100 : 0;
    current += item.value;
    const end = total ? (current / total) * 100 : 0;
    return `${item.color} ${start}% ${end}%`;
  });
  const background = total ? `conic-gradient(${stops.join(', ')})` : 'conic-gradient(#e2e8f0 0% 100%)';
  return (
    <div className="flex flex-wrap items-center justify-center gap-6 py-2 sm:justify-start">
      <div className="severity-donut" role="img" aria-label={`Severity distribution: ${items.map((item) => `${item.label} ${item.value}`).join(', ')}`} style={{ background }}>
        <span><strong>{total}</strong><small>findings</small></span>
      </div>
      <ul className="grid min-w-[150px] flex-1 grid-cols-2 gap-x-5 gap-y-3">
        {items.map((item) => <li key={item.label} className="flex items-center justify-between gap-3 text-xs"><span className="inline-flex items-center gap-2 text-slate-600"><i className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }}/>{item.label}</span><strong className="tabular-nums text-slate-900">{item.value}</strong></li>)}
      </ul>
    </div>
  );
}
