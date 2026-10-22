'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Globe,
  Plus,
  Trash2,
  Pause,
  Play,
  ExternalLink,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Clock,
  Mail,
  Sliders,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import type { MonitoredSite } from '@/types';

type MonitoredWebsitesProps = {
  onSelectSite: (url: string) => void;
  selectedUrl: string;
};

export function MonitoredWebsites({ onSelectSite, selectedUrl }: MonitoredWebsitesProps) {
  const [sites, setSites] = useState<MonitoredSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(true);

  // Form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingSite, setEditingSite] = useState<MonitoredSite | null>(null);
  const [formUrl, setFormUrl] = useState('');
  const [formName, setFormName] = useState('');
  const [formCrawlLimit, setFormCrawlLimit] = useState(30);
  const [formInterval, setFormInterval] = useState(1440);
  const [formAlertEmail, setFormAlertEmail] = useState('');
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const loadSites = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const response = await fetch('/api/monitored-sites', { cache: 'no-store' });
      const data = await response.json();
      if (data.ready === false && data.reason) {
        setReady(false);
        setError(data.reason);
      } else if (Array.isArray(data.sites)) {
        setReady(true);
        setSites(data.sites);
      }
    } catch {
      setError('Could not contact monitored websites endpoint.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSites();
  }, [loadSites]);

  const handleAddSite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSite && !formUrl.trim()) {
      setFormError('Please enter a website URL.');
      return;
    }
    setFormSubmitting(true);
    setFormError('');

    try {
      const endpoint = '/api/monitored-sites';
      const isEdit = Boolean(editingSite);
      const response = await fetch(endpoint, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          isEdit
            ? {
                id: editingSite!.id,
                name: formName.trim(),
                crawlLimit: formCrawlLimit,
                checkIntervalMinutes: formInterval,
                alertEmail: formAlertEmail.trim(),
              }
            : {
                url: formUrl.trim(),
                name: formName.trim() || undefined,
                crawlLimit: formCrawlLimit,
                checkIntervalMinutes: formInterval,
                alertEmail: formAlertEmail.trim() || undefined,
              }
        ),
      });

      const data = await response.json();
      if (!response.ok || !data.ok) {
        setFormError(data.error || 'Failed to save monitored site.');
      } else {
        setFormUrl('');
        setFormName('');
        setFormAlertEmail('');
        setShowAddForm(false);
        setEditingSite(null);
        await loadSites();
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setFormSubmitting(false);
    }
  };

  const startEdit = (site: MonitoredSite, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingSite(site);
    setFormUrl(site.url);
    setFormName(site.name || '');
    setFormCrawlLimit(site.crawlLimit);
    setFormInterval(site.checkIntervalMinutes);
    setFormAlertEmail(site.alertEmail || '');
    setShowAddForm(true);
  };

  const toggleActive = async (site: MonitoredSite) => {
    try {
      const response = await fetch('/api/monitored-sites', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: site.id,
          isActive: !site.isActive,
        }),
      });
      if (response.ok) {
        setSites((prev) =>
          prev.map((s) => (s.id === site.id ? { ...s, isActive: !s.isActive } : s))
        );
      }
    } catch {
      // ignore
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to remove this website from monitoring?')) return;
    try {
      const response = await fetch(`/api/monitored-sites?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        setSites((prev) => prev.filter((s) => s.id !== id));
      }
    } catch {
      // ignore
    }
  };

  const getStatusBadge = (status: MonitoredSite['lastStatus']) => {
    switch (status) {
      case 'healthy':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200">
            <CheckCircle2 size={12} /> Healthy
          </span>
        );
      case 'issues':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 border border-amber-200">
            <AlertTriangle size={12} /> Issues
          </span>
        );
      case 'down':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700 border border-red-200">
            <AlertCircle size={12} /> Down
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-500 border border-slate-200">
            Not checked
          </span>
        );
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-brand-50 p-2 text-brand-700">
              <Globe size={20} />
            </div>
            <h2 className="text-lg font-bold text-slate-900">Monitored Websites</h2>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            The configured Vercel cron checks due websites daily (up to three sites per run).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void loadSites()}
            title="Refresh sites list"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-700 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-brand-800"
          >
            <Plus size={14} />
            {showAddForm ? 'Cancel' : 'Add Website'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-800">
          <p className="font-semibold">Notice</p>
          <p className="mt-0.5">{error}</p>
        </div>
      )}

      {/* Add / Edit Website Form */}
      {showAddForm && (
        <form onSubmit={handleAddSite} className="mt-5 rounded-xl border border-brand-200 bg-brand-50/50 p-4">
          <h3 className="text-sm font-semibold text-slate-900">
            {editingSite ? `Edit Settings: ${editingSite.url}` : 'Add New Monitored Website'}
          </h3>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="lg:col-span-2">
              <label className="block text-xs font-medium text-slate-700">Website URL *</label>
              <input
                type="url"
                required
                disabled={Boolean(editingSite)}
                placeholder="https://example.com"
                value={formUrl}
                onChange={(e) => setFormUrl(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 shadow-sm focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600 disabled:bg-slate-100 disabled:text-slate-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">Display Name (optional)</label>
              <input
                type="text"
                placeholder="Main Production Site"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 shadow-sm focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">Crawl Limit</label>
              <select
                value={formCrawlLimit}
                onChange={(e) => setFormCrawlLimit(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 shadow-sm focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
              >
                <option value={30}>30 pages (Fast)</option>
                <option value={50}>50 pages</option>
                <option value={100}>100 pages</option>
                <option value={250}>250 pages</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">Check Interval</label>
              <select
                value={formInterval}
                onChange={(e) => setFormInterval(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 shadow-sm focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
              >
                <option value={1440}>Every 24 hours (Daily)</option>
              </select>
              <p className="mt-1 text-[10px] leading-3 text-slate-500">
                This deployment is configured for once-daily scans at 03:00 UTC. Sub-daily intervals are unavailable.
              </p>
            </div>
            <div className="lg:col-span-2">
              <label className="block text-xs font-medium text-slate-700">Alert Email (optional override)</label>
              <input
                type="email"
                placeholder="alerts@yourdomain.com (defaults to ALERT_EMAIL_TO)"
                value={formAlertEmail}
                onChange={(e) => setFormAlertEmail(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 shadow-sm focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
              />
            </div>
          </div>

          {formError && <p className="mt-2 text-xs text-red-600">{formError}</p>}

          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={formSubmitting}
              className="rounded-lg bg-brand-700 px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-brand-800 disabled:opacity-50"
            >
              {formSubmitting ? 'Validating...' : 'Save Website'}
            </button>
          </div>
        </form>
      )}

      {/* Sites List */}
      <div className="mt-5 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
        {sites.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-400">
            {ready
              ? 'No websites added yet. Click "Add Website" to begin multi-site monitoring.'
              : 'Execute the SQL migration in Supabase to enable monitored websites.'}
          </div>
        ) : (
          sites.map((site) => {
            const isSelected = selectedUrl.toLowerCase().replace(/\/+$/, '') === site.url.toLowerCase().replace(/\/+$/, '');
            return (
              <div
                key={site.id}
                onClick={() => onSelectSite(site.url)}
                className={`flex flex-col gap-3 p-4 transition sm:flex-row sm:items-center sm:justify-between cursor-pointer ${
                  isSelected ? 'bg-brand-50/60' : 'hover:bg-slate-50'
                } ${!site.isActive ? 'opacity-60 bg-slate-50/50' : ''}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2.5">
                    <span className="font-semibold text-slate-900 text-sm truncate">
                      {site.name || site.url}
                    </span>
                    {getStatusBadge(site.lastStatus)}
                    {!site.isActive && (
                      <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                        Paused
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                    <span className="truncate">{site.url}</span>
                    <span className="inline-flex items-center gap-1">
                      <Clock size={11} /> Daily
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Sliders size={11} /> {site.crawlLimit} pages
                    </span>
                    {site.alertEmail && (
                      <span className="inline-flex items-center gap-1 text-slate-400">
                        <Mail size={11} /> {site.alertEmail}
                      </span>
                    )}
                    {site.lastCheckedAt && (
                      <span className="text-slate-400">
                        Last checked: {new Date(site.lastCheckedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-auto" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => void toggleActive(site)}
                    title={site.isActive ? 'Pause monitoring' : 'Resume monitoring'}
                    className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold shadow-sm transition ${
                      site.isActive
                        ? 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                        : 'bg-emerald-600 text-white hover:bg-emerald-700'
                    }`}
                  >
                    {site.isActive ? <Pause size={12} /> : <Play size={12} />}
                    {site.isActive ? 'Pause' : 'Resume'}
                  </button>
                  <button
                    onClick={(e) => startEdit(site, e)}
                    title="Edit monitoring settings"
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-100"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => onSelectSite(site.url)}
                    title="Load into scanner and view reports"
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-brand-700 shadow-sm transition hover:bg-slate-100"
                  >
                    Select
                  </button>
                  <button
                    onClick={(e) => void handleDelete(site.id, e)}
                    title="Delete monitored site"
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 transition"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
