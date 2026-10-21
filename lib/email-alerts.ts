import type { IssueDetail, ScanResult } from '@/types';
import { normalizeComparisonUrl } from '@/lib/url-identity';

export type EmailAlertOutcome = {
  needed: boolean;
  sent: boolean;
  message: string;
  recipients?: string[];
};

export type ScanTriggerMode = 'manual' | 'scheduled';

export interface ScanChanges {
  hasChanges: boolean;
  siteWentDown: boolean;
  siteRecovered: boolean;
  statusChanged: boolean;
  previousStatus?: string;
  currentStatus: string;
  newIssues: IssueDetail[];
  resolvedIssues: IssueDetail[];
  scoreChanges: { metric: string; from: number | null; to: number | null }[];
  isInitialScan: boolean;
}

function hostOf(value: string) {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return value.toLowerCase();
  }
}

function signature(issue: IssueDetail) {
  let path = '/';
  try {
    path = new URL(issue.url || 'https://example.invalid').pathname.toLowerCase().replace(/\/+$/, '') || '/';
  } catch {
    /* root fallback */
  }
  const title = issue.title.toLowerCase().replace(/\b\d+\/100\b/g, 'score').replace(/\s+/g, ' ').trim();
  return `${issue.category}|${title}|${path}`;
}

function escapeHtml(value: string) {
  const entities: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return value.replace(/[&<>"']/g, (character) => entities[character] ?? character);
}

/**
 * Detects differences between current scan and previous scan for the same website.
 */
export function detectScanChanges(scan: ScanResult, previous: ScanResult | null): ScanChanges {
  if (!previous) {
    return {
      hasChanges: true,
      siteWentDown: !scan.uptime.ok,
      siteRecovered: false,
      statusChanged: true,
      currentStatus: scan.overallStatus,
      newIssues: scan.detailedIssues ?? [],
      resolvedIssues: [],
      scoreChanges: [],
      isInitialScan: true,
    };
  }

  const siteWentDown = !scan.uptime.ok && (previous.uptime?.ok !== false);
  const siteRecovered = scan.uptime.ok && (previous.uptime?.ok === false);
  const statusChanged = scan.overallStatus !== previous.overallStatus;

  const prevIssueSignatures = new Set((previous.detailedIssues ?? []).map(signature));
  const currIssueSignatures = new Set((scan.detailedIssues ?? []).map(signature));

  const newIssues = (scan.detailedIssues ?? []).filter((i) => !prevIssueSignatures.has(signature(i)));
  const resolvedIssues = (previous.detailedIssues ?? []).filter((i) => !currIssueSignatures.has(signature(i)));

  const scoreChanges: { metric: string; from: number | null; to: number | null }[] = [];
  const metrics = ['performance', 'accessibility', 'bestPractices', 'seo'] as const;
  for (const m of metrics) {
    const from = previous.speed?.[m] ?? null;
    const to = scan.speed?.[m] ?? null;
    if (from !== to && (from != null || to != null)) {
      scoreChanges.push({ metric: m, from, to });
    }
  }

  const hasChanges =
    siteWentDown ||
    siteRecovered ||
    statusChanged ||
    newIssues.length > 0 ||
    resolvedIssues.length > 0 ||
    scoreChanges.length > 0;

  return {
    hasChanges,
    siteWentDown,
    siteRecovered,
    statusChanged,
    previousStatus: previous.overallStatus,
    currentStatus: scan.overallStatus,
    newIssues,
    resolvedIssues,
    scoreChanges,
    isInitialScan: false,
  };
}

/**
 * Sends an email notification based on scan mode and changes:
 * - Manual Scan: Only sends if changes are detected; if no changes, skips email.
 * - Scheduled Scan: Always sends email (even if scan is identical to previous).
 */
export async function sendScanAlertEmail(
  scan: ScanResult,
  previous: ScanResult | null,
  options: { mode?: ScanTriggerMode; recipientOverride?: string } = {}
): Promise<EmailAlertOutcome> {
  const mode = options.mode ?? 'manual';
  const changes = detectScanChanges(scan, previous);

  // Manual scan rule: If no changes occurred, do NOT send any email.
  if (mode === 'manual' && !changes.hasChanges) {
    return {
      needed: false,
      sent: false,
      message: 'No changes detected since the previous scan; manual scan email skipped.',
    };
  }

  const apiKey = process.env.RESEND_API_KEY?.trim();
  const configuredRecipients = (process.env.ALERT_EMAIL_TO ?? '').split(',').map((item) => item.trim()).filter(Boolean);
  const overrideList = (options.recipientOverride ?? '').split(',').map((item) => item.trim()).filter(Boolean);
  const recipientList = overrideList.length ? overrideList : configuredRecipients;
  const from = process.env.ALERT_EMAIL_FROM?.trim();

  if (!apiKey || !recipientList.length || !from) {
    return {
      needed: true,
      sent: false,
      message: `${mode === 'scheduled' ? 'Scheduled report' : 'Scan change alert'} is ready, but email is not configured. Set RESEND_API_KEY, ALERT_EMAIL_TO, and ALERT_EMAIL_FROM.`,
    };
  }

  const host = hostOf(scan.siteUrl);
  let subject = '';
  let bannerColor = '#1e3a8a'; // default navy
  let bannerTitle = '';
  let bannerSubtitle = '';

  if (changes.siteWentDown) {
    bannerColor = '#991b1b'; // red
    bannerTitle = 'Website is DOWN';
    bannerSubtitle = `Homepage request failed for ${host}`;
    subject = `[Website Monitor AI] ALERT: Website is DOWN — ${host}`;
  } else if (changes.siteRecovered) {
    bannerColor = '#166534'; // green
    bannerTitle = 'Website is Back UP';
    bannerSubtitle = `Availability restored for ${host}`;
    subject = `[Website Monitor AI] RESOLVED: Website is back UP — ${host}`;
  } else if (mode === 'scheduled' && !changes.hasChanges) {
    bannerColor = '#1e3a8a'; // navy
    bannerTitle = 'Scheduled Website Health Digest';
    bannerSubtitle = `Status: ${scan.overallStatus.toUpperCase()} · No changes since previous scan`;
    subject = `[Website Monitor AI] Scheduled Digest: No changes (${scan.overallStatus}) — ${host}`;
  } else if (mode === 'scheduled') {
    bannerColor = '#4338ca'; // indigo
    bannerTitle = 'Scheduled Scan: Changes Detected';
    bannerSubtitle = `Periodic scan detected updates for ${host}`;
    subject = `[Website Monitor AI] Scheduled Report: Changes detected — ${host}`;
  } else if (changes.isInitialScan) {
    bannerColor = '#1e3a8a';
    bannerTitle = 'Initial Website Scan Completed';
    bannerSubtitle = `Baseline report created for ${host}`;
    subject = `[Website Monitor AI] Initial Scan Report — ${host}`;
  } else {
    bannerColor = '#4338ca'; // indigo
    bannerTitle = 'Scan Changes Detected';
    bannerSubtitle = `${changes.newIssues.length} new issue(s), ${changes.resolvedIssues.length} resolved`;
    subject = `[Website Monitor AI] Changes Detected (${changes.newIssues.length} new, ${changes.resolvedIssues.length} resolved) — ${host}`;
  }

  // Build HTML issue rows
  const newIssueRows = changes.newIssues.slice(0, 10).map((issue) => `
    <tr>
      <td style="padding:10px;border-bottom:1px solid #e2e8f0">
        <b style="color:#0f172a">${escapeHtml(issue.title)}</b>
        <br><span style="color:#64748b;font-size:12px">${escapeHtml(issue.category)} · <b>${escapeHtml(issue.severity.toUpperCase())}</b></span>
        <br><a href="${escapeHtml(issue.url || scan.siteUrl)}" style="color:#2563eb;font-size:12px">${escapeHtml(issue.url || scan.siteUrl)}</a>
        <p style="margin:6px 0 4px;font-size:13px;color:#334155">${escapeHtml(issue.what)}</p>
        <p style="margin:0;font-size:13px;color:#047857"><b>Recommended fix:</b> ${escapeHtml(issue.recommendation)}</p>
      </td>
    </tr>
  `).join('');

  const resolvedIssueRows = changes.resolvedIssues.slice(0, 10).map((issue) => `
    <li style="padding:4px 0;color:#166534">
      <b>${escapeHtml(issue.title)}</b> (${escapeHtml(issue.category)})
    </li>
  `).join('');

  const scoreRows = changes.scoreChanges.map((sc) => `
    <tr>
      <td style="padding:6px 12px;border:1px solid #e2e8f0;font-weight:bold">${escapeHtml(sc.metric)}</td>
      <td style="padding:6px 12px;border:1px solid #e2e8f0">${sc.from ?? 'Unavailable'}</td>
      <td style="padding:6px 12px;border:1px solid #e2e8f0;font-weight:bold">${sc.to ?? 'Unavailable'}</td>
    </tr>
  `).join('');

  const html = `
    <div style="font-family:Arial,sans-serif;color:#0f172a;max-width:760px;margin:auto;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">
      <div style="background:${bannerColor};color:#fff;padding:24px 28px">
        <h1 style="margin:0;font-size:22px;letter-spacing:-0.5px">${escapeHtml(bannerTitle)}</h1>
        <p style="margin:8px 0 0;font-size:14px;opacity:0.9">${escapeHtml(bannerSubtitle)}</p>
      </div>
      <div style="padding:24px 28px;background:#ffffff">
        <table style="width:100%;margin-bottom:20px;border-collapse:collapse;font-size:14px">
          <tr>
            <td style="padding:6px 0;color:#64748b"><b>Website:</b></td>
            <td style="padding:6px 0"><a href="${escapeHtml(scan.siteUrl)}" style="color:#2563eb">${escapeHtml(scan.siteUrl)}</a></td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b"><b>Trigger:</b></td>
            <td style="padding:6px 0"><span style="text-transform:capitalize">${escapeHtml(mode)}</span> Scan</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b"><b>Checked At:</b></td>
            <td style="padding:6px 0">${escapeHtml(new Date(scan.checkedAt).toLocaleString())}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b"><b>Overall Status:</b></td>
            <td style="padding:6px 0"><b style="text-transform:uppercase">${escapeHtml(scan.overallStatus)}</b> (HTTP ${scan.uptime.status ?? 'N/A'})</td>
          </tr>
        </table>

        ${!changes.hasChanges ? `
          <div style="background:#f0fdf4;border:1px solid #bbf7d0;padding:16px;border-radius:8px;margin-bottom:20px">
            <p style="margin:0;color:#166534;font-size:14px">
              <b>No changes detected:</b> All health, uptime, and performance metrics are consistent with the previous scan.
            </p>
          </div>
        ` : ''}

        ${changes.siteWentDown ? `
          <div style="background:#fef2f2;border:1px solid #fecaca;padding:16px;border-radius:8px;margin-bottom:20px">
            <p style="margin:0;color:#991b1b;font-size:14px">
              <b>Downtime Reason:</b> ${escapeHtml(scan.uptime.error || 'Homepage HTTP check failed.')}
            </p>
          </div>
        ` : ''}

        ${changes.newIssues.length > 0 ? `
          <h2 style="font-size:16px;margin:24px 0 12px;color:#0f172a">New Issue(s) Detected (${changes.newIssues.length})</h2>
          <table style="border-collapse:collapse;width:100%;margin-bottom:24px">${newIssueRows}</table>
        ` : ''}

        ${changes.resolvedIssues.length > 0 ? `
          <h2 style="font-size:16px;margin:24px 0 12px;color:#166534">Resolved Issue(s) (${changes.resolvedIssues.length})</h2>
          <ul style="margin:0 0 24px;padding-left:20px">${resolvedIssueRows}</ul>
        ` : ''}

        ${changes.scoreChanges.length > 0 ? `
          <h2 style="font-size:16px;margin:24px 0 12px;color:#0f172a">Lighthouse Score Changes</h2>
          <table style="border-collapse:collapse;width:100%;font-size:13px;margin-bottom:24px">
            <tr style="background:#f8fafc">
              <th style="padding:6px 12px;border:1px solid #e2e8f0;text-align:left">Metric</th>
              <th style="padding:6px 12px;border:1px solid #e2e8f0;text-align:left">Previous</th>
              <th style="padding:6px 12px;border:1px solid #e2e8f0;text-align:left">Current</th>
            </tr>
            ${scoreRows}
          </table>
        ` : ''}

        <div style="background:#f8fafc;padding:16px;border-radius:8px;margin-top:20px">
          <p style="margin:0 0 8px;font-size:13px;color:#475569"><b>Current Lighthouse Scores:</b></p>
          <p style="margin:0;font-size:13px;color:#334155">
            Performance: <b>${scan.speed?.performance ?? 'Unavailable'}</b> · 
            Accessibility: <b>${scan.speed?.accessibility ?? 'Unavailable'}</b> · 
            Best Practices: <b>${scan.speed?.bestPractices ?? 'Unavailable'}</b> · 
            SEO: <b>${scan.speed?.seo ?? 'Unavailable'}</b>
          </p>
        </div>

        <p style="margin-top:24px;color:#94a3b8;font-size:12px;border-top:1px solid #f1f5f9;padding-top:16px">
          This report was generated automatically by Website Monitor AI (${mode} scan).
        </p>
      </div>
    </div>
  `;

  const text = `Website Monitor AI — ${bannerTitle}
Website: ${scan.siteUrl}
Mode: ${mode} scan
Checked: ${scan.checkedAt}
Status: ${scan.overallStatus} (HTTP ${scan.uptime.status ?? 'N/A'})

${!changes.hasChanges ? 'No changes detected: Website metrics remain consistent with previous scan.\n' : ''}
${changes.siteWentDown ? `Downtime Reason: ${scan.uptime.error || 'Homepage check failed'}\n` : ''}
${changes.newIssues.length ? `New Issues (${changes.newIssues.length}):\n` + changes.newIssues.map((i) => `- [${i.severity.toUpperCase()}] ${i.title} (${i.url || scan.siteUrl})\n  Fix: ${i.recommendation}`).join('\n') + '\n\n' : ''}
${changes.resolvedIssues.length ? `Resolved Issues (${changes.resolvedIssues.length}):\n` + changes.resolvedIssues.map((i) => `- ${i.title}`).join('\n') + '\n\n' : ''}
${changes.scoreChanges.length ? `Score Changes:\n` + changes.scoreChanges.map((s) => `- ${s.metric}: ${s.from ?? 'N/A'} -> ${s.to ?? 'N/A'}`).join('\n') + '\n\n' : ''}

Scores: Performance: ${scan.speed?.performance ?? 'N/A'} | Accessibility: ${scan.speed?.accessibility ?? 'N/A'} | SEO: ${scan.speed?.seo ?? 'N/A'}`;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: recipientList, subject, text, html }),
      signal: AbortSignal.timeout(12000),
      cache: 'no-store',
    });
    const payload = (await response.json().catch(() => ({}))) as { message?: string; id?: string };
    if (!response.ok) {
      return {
        needed: true,
        sent: false,
        recipients: recipientList,
        message: `Email alert provider returned HTTP ${response.status}: ${payload.message || 'check Resend API key and verified sender domain.'}`,
      };
    }
    return {
      needed: true,
      sent: true,
      recipients: recipientList,
      message: `${mode === 'scheduled' ? 'Scheduled email report' : 'Scan change alert email'} sent to ${recipientList.join(', ')}.`,
    };
  } catch (error) {
    return {
      needed: true,
      sent: false,
      recipients: recipientList,
      message: `Email alert request failed: ${error instanceof Error ? error.message : 'network error'}`,
    };
  }
}

/** Legacy alias for backwards compatibility */
export async function sendCriticalIssueEmail(
  scan: ScanResult,
  previous: ScanResult | null,
  recipientOverride?: string
): Promise<EmailAlertOutcome> {
  return sendScanAlertEmail(scan, previous, { mode: 'manual', recipientOverride });
}

export function findPreviousScan(scan: ScanResult, history: ScanResult[]) {
  const currentUrl = normalizeComparisonUrl(scan.siteUrl);

  return (
    history
      .filter(
        (item) =>
          item.id !== scan.id &&
          item.checkedAt < scan.checkedAt &&
          normalizeComparisonUrl(item.siteUrl) === currentUrl
      )
      .sort((a, b) => b.checkedAt.localeCompare(a.checkedAt))[0] ?? null
  );
}