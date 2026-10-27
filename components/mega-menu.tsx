'use client';

import { AnimatePresence, motion } from 'motion/react';
import { Activity, ArrowRight, ChevronRight, Gauge, Globe, Mail, Menu, ShieldCheck, Sparkles, X } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { ThemeToggle } from './dashboard-ui';

type MegaMenuProps = {
  activeSection: string;
  siteUrl: string;
  lastScanLabel: string;
  issueCount: number;
  busy: boolean;
  onRunScan: () => void;
  onSendTestEmail: () => void;
  onNavChange: (section: string) => void;
  currentStatus: 'healthy' | 'down' | 'warning' | 'issues' | 'idle';
};

const menuGroups = [
  {
    heading: 'Monitor',
    items: [
      { id: 'overview', label: 'Overview', description: 'Health summary and command center', icon: Activity },
      { id: 'live-activity', label: 'Live Scan', description: 'Live streaming activity', icon: Sparkles },
      { id: 'websites', label: 'Websites', description: 'Monitored site inventory', icon: Globe },
    ],
  },
  {
    heading: 'Analyze',
    items: [
      { id: 'analytics', label: 'Analytics & Trends', description: 'Scores, uptime, and patterns', icon: Gauge },
      { id: 'page-audits', label: 'Pages & SEO', description: 'Metadata, link checks and crawl health', icon: ShieldCheck },
    ],
  },
  {
    heading: 'Fix & report',
    items: [
      { id: 'priority-issues', label: 'Priority Issues', description: 'Highest-impact findings', icon: ShieldCheck },
      { id: 'issue-management', label: 'Issue Workflow', description: 'Detailed remediation steps', icon: Activity },
      { id: 'reports', label: 'Reports & Export', description: 'Saved history and export tools', icon: ArrowRight },
      { id: 'scan-history', label: 'Scan History', description: 'Recent run timeline', icon: Activity },
    ],
  },
] as const;

// Based on the reference file: Navbar.tsx (header style change after the hero)
export function MegaMenu({
  activeSection,
  siteUrl,
  lastScanLabel,
  issueCount,
  busy,
  onRunScan,
  onSendTestEmail,
  onNavChange,
  currentStatus,
}: MegaMenuProps) {
  const [open, setOpen] = useState(false);
  const pendingNavigation = useRef<string | null>(null);
  const currentTone = useMemo(() => {
    if (currentStatus === 'healthy') return 'bg-emerald-500/15 text-emerald-700 ring-emerald-200';
    if (currentStatus === 'down') return 'bg-rose-500/15 text-rose-700 ring-rose-200';
    if (currentStatus === 'warning' || currentStatus === 'issues') return 'bg-amber-500/15 text-amber-700 ring-amber-200';
    return 'bg-slate-500/10 text-slate-700 ring-slate-200';
  }, [currentStatus]);

  const visibleMenuGroups = useMemo(() => {
    if (currentStatus !== 'idle') return menuGroups;
    const availableSections = new Set(['overview', 'websites', 'scan-history']);
    return menuGroups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => availableSections.has(item.id)),
      }))
      .filter((group) => group.items.length > 0);
  }, [currentStatus]);

  const handleNavigate = (section: string) => {
    onNavChange(section);
    pendingNavigation.current = section;
    setOpen(false);
  };

  return (
    <div className="sticky top-0 z-40" onMouseLeave={() => setOpen(false)}>
      <div className="border-b border-white/60 bg-white/65 backdrop-blur-xl shadow-[0_20px_60px_rgba(148,163,184,0.08)]">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <a href="#overview" className="flex min-w-0 items-center gap-3 rounded-2xl px-2 py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-500 to-cyan-400 text-white shadow-[0_16px_30px_rgba(79,70,229,0.28)]">
              <Activity size={19} />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold tracking-[-0.04em] text-slate-900 sm:text-base">Website Monitor <span className="text-indigo-600">AI</span></span>
              <span className="hidden text-[11px] text-slate-500 sm:block">Monitoring workspace</span>
            </span>
          </a>

          <div className="hidden flex-1 items-center justify-center lg:flex">
            <button
              type="button"
              onClick={() => setOpen((value) => !value)}
              onMouseEnter={() => setOpen(true)}
              onFocus={() => setOpen(true)}
              aria-haspopup="true"
              aria-expanded={open}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200/80 bg-white/80 px-3 py-2 text-xs font-semibold text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] transition hover:border-indigo-200 hover:text-indigo-700"
            >
              Explore <ChevronRight size={14} className={`transition ${open ? 'rotate-90' : ''}`} />
            </button>
          </div>

          <div className="hidden min-w-0 items-center gap-3 lg:flex">
            <div className="max-w-[240px] truncate rounded-full border border-slate-200 bg-slate-50/70 px-3 py-1.5 text-[11px] font-medium text-slate-700">
              {siteUrl}
            </div>
            <span className="whitespace-nowrap text-[11px] text-slate-500">{lastScanLabel}</span>
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button type="button" onClick={onSendTestEmail} disabled={busy} className="hidden items-center gap-1.5 rounded-full border border-slate-200 bg-white/85 px-2.5 py-2 text-[11px] font-semibold text-slate-700 shadow-sm transition hover:border-indigo-200 hover:text-indigo-700 sm:inline-flex">
              <Mail size={13} />
              Test Email
            </button>
            <button type="button" onClick={onRunScan} disabled={busy} className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-indigo-600 to-violet-600 px-3 py-2 text-[11px] font-semibold text-white shadow-[0_12px_24px_rgba(79,70,229,0.25)] transition hover:shadow-[0_16px_28px_rgba(79,70,229,0.35)] disabled:opacity-60 sm:px-4">
              {busy ? 'Scanning…' : 'Run scan'}
            </button>
            <button type="button" onClick={() => setOpen((value) => !value)} className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white/80 text-slate-700 lg:hidden" aria-label="Open navigation menu">
              {open ? <X size={16} /> : <Menu size={16} />}
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence
        onExitComplete={() => {
          const section = pendingNavigation.current;
          if (!section) return;

          pendingNavigation.current = null;
          const target = document.getElementById(section);
          if (!target) return;

          window.history.pushState(null, '', `#${section}`);
          window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => {
              target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
          });
        }}
      >
        {open && (
          <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.22, ease: 'easeOut' }} className="border-b border-slate-200/80 bg-white/80 backdrop-blur-xl">
            <div className="mx-auto grid max-w-[1440px] gap-6 px-4 py-5 sm:px-6 lg:grid-cols-[1.2fr_0.8fr] lg:px-8">
              <div className="grid gap-5 md:grid-cols-3">
                {visibleMenuGroups.map((group) => (
                  <div key={group.heading} className="space-y-3">
                    <p className="px-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">{group.heading}</p>
                    <div className="space-y-2">
                      {group.items.map(({ id, label, description, icon: Icon }) => {
                        const isActive = activeSection === id;
                        return (
                          <button
                            key={id}
                            type="button"
                            onClick={() => handleNavigate(id)}
                            className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left transition ${isActive ? 'border-indigo-200 bg-indigo-50/80 text-indigo-700' : 'border-transparent bg-slate-50/60 text-slate-700 hover:border-slate-200 hover:bg-white'}`}
                          >
                            <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${isActive ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600'}`}>
                              <Icon size={15} />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-semibold tracking-[-0.02em]">{label}</span>
                              <span className="mt-0.5 block text-[11px] text-slate-500">{description}</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded-[28px] border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-cyan-50 p-4 shadow-[0_20px_40px_rgba(79,70,229,0.08)]">
                <div className="flex items-center justify-between gap-3">
                  <span className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ring-1 ${currentTone}`}>
                    <span className="h-1.5 w-1.5 rounded-full bg-current" />
                    {currentStatus === 'idle' ? 'Waiting' : currentStatus}
                  </span>
                  <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-400">Focused view</span>
                </div>
                <div className="mt-4 rounded-[24px] border border-white/80 bg-white/70 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Latest report</p>
                  <div className="mt-3 flex items-end justify-between gap-3">
                    <div>
                      <p className="text-3xl font-semibold tracking-[-0.06em] text-slate-900">{issueCount}</p>
                      <p className="mt-1 text-xs text-slate-500">open findings</p>
                    </div>
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-500 to-cyan-400 text-lg font-semibold text-white shadow-[0_15px_30px_rgba(79,70,229,0.25)]">
                      {issueCount > 0 ? '!' : '✓'}
                    </div>
                  </div>
                  <p className="mt-4 text-xs text-slate-500">{lastScanLabel}</p>
                </div>
                <button type="button" onClick={onRunScan} disabled={busy} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white shadow-[0_16px_32px_rgba(15,23,42,0.15)] transition hover:bg-slate-900 disabled:opacity-60">
                  {busy ? 'Scan in progress' : 'Run latest scan'}
                  <ArrowRight size={15} />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
