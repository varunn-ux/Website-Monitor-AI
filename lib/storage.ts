import { createClient } from '@supabase/supabase-js';
import type { IssueCategory, IssueSeverity, IssueTrackingRecord, IssueWorkflowStatus, MonitoredSite, ScanResult } from '@/types';
import { normalizeComparisonUrl } from '@/lib/url-identity';

function normalizedSupabaseUrl(raw: string) {
  const url = new URL(raw);
  // The environment variable must contain the project root, not /rest/v1.
  url.pathname = url.pathname.replace(/\/rest\/v1\/?$/i, '').replace(/\/$/, '');
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/$/, '');
}
function getSupabase() {
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!rawUrl || !key) return null;
  let url: string;
  try { url = normalizedSupabaseUrl(rawUrl); }
  catch { throw new Error('NEXT_PUBLIC_SUPABASE_URL is not a valid URL. Paste the Supabase project URL, such as https://your-project.supabase.co.'); }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}
function friendlyStorageError(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes('website_scans') && (lower.includes('schema cache') || lower.includes('could not find the table') || lower.includes('does not exist') || lower.includes('relation'))) {
    return 'Supabase credentials are present, but public.website_scans has not been created (or its schema cache has not refreshed). In Supabase Dashboard → SQL Editor, run the included supabase-schema.sql file, then retry.';
  }
  if (lower.includes('invalid api key') || lower.includes('invalid jwt') || lower.includes('jwt')) {
    return 'Supabase rejected the secret key. Verify that SUPABASE_SERVICE_ROLE_KEY is a server-side secret from the same Supabase project as the URL, then restart/redeploy.';
  }
  return `Supabase history error: ${message}`;
}
export async function saveScan(scan: ScanResult) {
  let supabase;
  try { supabase = getSupabase(); }
  catch (error) { return { saved: false, reason: error instanceof Error ? error.message : 'Supabase URL is invalid.' }; }
  if (!supabase) return { saved: false, reason: 'Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on the server, restart the app, and retry.' };
  const { error } = await supabase.from('website_scans').upsert({ id: scan.id, checked_at: scan.checkedAt, site_url: scan.siteUrl, overall_status: scan.overallStatus, result: scan }, { onConflict: 'id' });
  if (error) return { saved: false, reason: friendlyStorageError(error.message) };
  return { saved: true, reason: 'Scan saved to Supabase history.' };
}
export async function getHistory() {
  let supabase;
  try { supabase = getSupabase(); }
  catch (error) { return { configured: false, tableReady: false, scans: [] as ScanResult[], reason: error instanceof Error ? error.message : 'Supabase URL is invalid.' }; }
  if (!supabase) return { configured: false, tableReady: false, scans: [] as ScanResult[], reason: 'Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to the server environment.' };
  const { data, error } = await supabase.from('website_scans').select('result').order('checked_at', { ascending: false }).limit(100);
  if (error) return { configured: true, tableReady: false, scans: [] as ScanResult[], reason: friendlyStorageError(error.message) };
  return { configured: true, tableReady: true, scans: (data ?? []).map((row: { result: ScanResult }) => row.result), reason: '' };
}


function normalizedSiteHost(siteUrl: string) {
  const url = new URL(siteUrl);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Website URL must use HTTP or HTTPS.');
  return url.hostname.toLowerCase().replace(/^www\./, '');
}

const allowedCategories: IssueCategory[] = ['availability', 'links', 'seo', 'performance', 'accessibility', 'best-practices'];
const allowedSeverities: IssueSeverity[] = ['critical', 'high', 'medium', 'low'];
const allowedStatuses: IssueWorkflowStatus[] = ['open', 'in_progress', 'fixed', 'ignored'];

export async function getIssueTracking(siteUrl: string) {
  let supabase;
  try { supabase = getSupabase(); } catch (error) { return { ready: false, records: [] as IssueTrackingRecord[], reason: error instanceof Error ? error.message : 'Supabase setup error.' }; }
  if (!supabase) return { ready: false, records: [] as IssueTrackingRecord[], reason: 'Configure Supabase URL and server secret key to save issue ownership and status.' };
  let siteHost: string;
  try { siteHost = normalizedSiteHost(siteUrl); } catch { return { ready: false, records: [] as IssueTrackingRecord[], reason: 'Enter a valid website URL to load issue tracking.' }; }
  const { data, error } = await supabase.from('website_issue_tracking').select('site_host,issue_key,issue_title,category,severity,url,status,owner,notes,updated_at').eq('site_host', siteHost).order('updated_at', { ascending: false }).limit(5000);
  if (error) {
    const message = error.message.toLowerCase().includes('website_issue_tracking')
      ? 'Issue workflow table is missing. Run the updated supabase-schema.sql file once in Supabase → SQL Editor.'
      : friendlyStorageError(error.message);
    return { ready: false, records: [] as IssueTrackingRecord[], reason: message };
  }
  const records: IssueTrackingRecord[] = (data ?? []).map((row: any) => ({
    siteHost: row.site_host, issueKey: row.issue_key, issueTitle: row.issue_title, category: row.category, severity: row.severity, url: row.url ?? '', status: row.status, owner: row.owner ?? '', notes: row.notes ?? '', updatedAt: row.updated_at,
  }));
  return { ready: true, records, reason: '' };
}

export async function saveIssueTracking(input: { siteUrl: string; issueKey: string; issueTitle: string; category: string; severity: string; url?: string; status: string; owner?: string; notes?: string }) {
  let supabase;
  try { supabase = getSupabase(); } catch (error) { return { saved: false, reason: error instanceof Error ? error.message : 'Supabase setup error.' }; }
  if (!supabase) return { saved: false, reason: 'Configure Supabase URL and server secret key before saving issue workflow details.' };
  let siteHost: string;
  try { siteHost = normalizedSiteHost(input.siteUrl); } catch { return { saved: false, reason: 'Enter a valid website URL.' }; }
  if (!input.issueKey || input.issueKey.length > 80 || !input.issueTitle.trim()) return { saved: false, reason: 'Issue key and title are required.' };
  if (!allowedCategories.includes(input.category as IssueCategory) || !allowedSeverities.includes(input.severity as IssueSeverity) || !allowedStatuses.includes(input.status as IssueWorkflowStatus)) return { saved: false, reason: 'Invalid issue category, severity or status.' };
  const row = {
    site_host: siteHost, issue_key: input.issueKey, issue_title: input.issueTitle.slice(0, 240), category: input.category, severity: input.severity, url: (input.url ?? '').slice(0, 2048), status: input.status, owner: (input.owner ?? '').slice(0, 160), notes: (input.notes ?? '').slice(0, 4000), updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase.from('website_issue_tracking').upsert(row, { onConflict: 'site_host,issue_key' }).select('site_host,issue_key,issue_title,category,severity,url,status,owner,notes,updated_at').single();
  if (error) {
    const message = error.message.toLowerCase().includes('website_issue_tracking')
      ? 'Issue workflow table is missing. Run the updated supabase-schema.sql file once in Supabase → SQL Editor.'
      : friendlyStorageError(error.message);
    return { saved: false, reason: message };
  }
  const record: IssueTrackingRecord = { siteHost: data.site_host, issueKey: data.issue_key, issueTitle: data.issue_title, category: data.category, severity: data.severity, url: data.url ?? '', status: data.status, owner: data.owner ?? '', notes: data.notes ?? '', updatedAt: data.updated_at };
  return { saved: true, record, reason: 'Issue status and ownership saved.' };
}

function mapMonitoredSiteRow(row: any): MonitoredSite {
  return {
    id: row.id,
    url: row.url,
    name: row.name ?? '',
    isActive: Boolean(row.is_active),
    crawlLimit: row.crawl_limit ?? 30,
    checkIntervalMinutes: row.check_interval_minutes ?? 60,
    alertEmail: row.alert_email ?? '',
    lastStatus: row.last_status ?? 'unknown',
    lastStatusCode: row.last_status_code ?? null,
    lastCheckedAt: row.last_checked_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getMonitoredSites() {
  let supabase;
  try { supabase = getSupabase(); } catch (error) { return { ready: false, sites: [] as MonitoredSite[], reason: error instanceof Error ? error.message : 'Supabase error' }; }
  if (!supabase) return { ready: false, sites: [] as MonitoredSite[], reason: 'Supabase credentials missing.' };
  const { data, error } = await supabase.from('monitored_sites').select('*').order('created_at', { ascending: false });
  if (error) {
    const isMissing = error.message.toLowerCase().includes('monitored_sites');
    return { ready: false, sites: [] as MonitoredSite[], reason: isMissing ? 'Table public.monitored_sites is not created yet. Please run the SQL migration.' : friendlyStorageError(error.message) };
  }
  return { ready: true, sites: (data ?? []).map(mapMonitoredSiteRow), reason: '' };
}

export async function createMonitoredSite(input: {
  url: string;
  name?: string;
  crawlLimit?: number;
  checkIntervalMinutes?: number;
  alertEmail?: string;
}) {
  let supabase;
  try { supabase = getSupabase(); } catch (error) { return { saved: false, reason: error instanceof Error ? error.message : 'Supabase error' }; }
  if (!supabase) return { saved: false, reason: 'Supabase credentials missing.' };

  const finalUrl = normalizeComparisonUrl(input.url);

  const { data, error } = await supabase.from('monitored_sites').insert({
    url: finalUrl,
    name: (input.name ?? '').slice(0, 100),
    crawl_limit: Math.min(Math.max(input.crawlLimit ?? 30, 10), 500),
    check_interval_minutes: Math.max(input.checkIntervalMinutes ?? 60, 5),
    alert_email: (input.alertEmail ?? '').slice(0, 200),
    is_active: true,
  }).select('*').single();

  if (error) {
    if (error.code === '23505') return { saved: false, reason: 'This website URL is already monitored.' };
    return { saved: false, reason: friendlyStorageError(error.message) };
  }
  return { saved: true, site: mapMonitoredSiteRow(data), reason: '' };
}

export async function updateMonitoredSite(id: string, patch: {
  name?: string;
  isActive?: boolean;
  crawlLimit?: number;
  checkIntervalMinutes?: number;
  alertEmail?: string;
}) {
  let supabase;
  try { supabase = getSupabase(); } catch (error) { return { saved: false, reason: error instanceof Error ? error.message : 'Supabase error' }; }
  if (!supabase) return { saved: false, reason: 'Supabase credentials missing.' };

  const updates: Record<string, any> = { updated_at: new Date().toISOString() };
  if (typeof patch.name === 'string') updates.name = patch.name.slice(0, 100);
  if (typeof patch.isActive === 'boolean') updates.is_active = patch.isActive;
  if (typeof patch.crawlLimit === 'number') updates.crawl_limit = Math.min(Math.max(patch.crawlLimit, 10), 500);
  if (typeof patch.checkIntervalMinutes === 'number') updates.check_interval_minutes = Math.max(patch.checkIntervalMinutes, 5);
  if (typeof patch.alertEmail === 'string') updates.alert_email = patch.alertEmail.slice(0, 200);

  const { data, error } = await supabase.from('monitored_sites').update(updates).eq('id', id).select('*').single();
  if (error) return { saved: false, reason: friendlyStorageError(error.message) };
  return { saved: true, site: mapMonitoredSiteRow(data), reason: '' };
}

export async function deleteMonitoredSite(id: string) {
  let supabase;
  try { supabase = getSupabase(); } catch (error) { return { deleted: false, reason: error instanceof Error ? error.message : 'Supabase error' }; }
  if (!supabase) return { deleted: false, reason: 'Supabase credentials missing.' };

  const { error } = await supabase.from('monitored_sites').delete().eq('id', id);
  if (error) return { deleted: false, reason: friendlyStorageError(error.message) };
  return { deleted: true, reason: '' };
}

export async function updateMonitoredSiteStatus(id: string, status: 'healthy' | 'issues' | 'down', statusCode: number | null) {
  let supabase;
  try { supabase = getSupabase(); } catch { return; }
  if (!supabase) return;
  await supabase.from('monitored_sites').update({
    last_status: status,
    last_status_code: statusCode,
    last_checked_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', id);
}

export async function getDueMonitoredSites(limit: number = 5) {
  let supabase;
  try { supabase = getSupabase(); } catch { return []; }
  if (!supabase) return [];

  // Active sites
  const { data, error } = await supabase.from('monitored_sites').select('*').eq('is_active', true);
  if (error || !data) return [];

  const now = Date.now();
  const due = (data as any[]).filter(site => {
    if (!site.last_checked_at) return true;
    const lastChecked = new Date(site.last_checked_at).getTime();
    const intervalMs = (site.check_interval_minutes || 60) * 60 * 1000;
    return (now - lastChecked) >= intervalMs;
  });

  return due.slice(0, limit).map(mapMonitoredSiteRow);
}
