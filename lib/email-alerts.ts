import type { IssueDetail, ScanResult } from '@/types';
import { normalizeComparisonUrl } from '@/lib/url-identity';

export type EmailAlertOutcome = {
  needed: boolean;
  sent: boolean;
  message: string;
  recipients?: string[];
};

function hostOf(value: string) {
  try { return new URL(value).hostname.toLowerCase().replace(/^www\./, ''); }
  catch { return value.toLowerCase(); }
}
function signature(issue: IssueDetail) {
  let path = '/';
  try { path = new URL(issue.url || 'https://example.invalid').pathname.toLowerCase().replace(/\/+$/, '') || '/'; } catch { /* root fallback */ }
  const title = issue.title.toLowerCase().replace(/\b\d+\/100\b/g, 'score').replace(/\s+/g, ' ').trim();
  return `${issue.category}|${title}|${path}`;
}
function escapeHtml(value: string) {
  const entities: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return value.replace(/[&<>"']/g, (character) => entities[character] ?? character);
}

/** Sends one alert for newly detected critical issues or a transition to website-down. */
export async function sendCriticalIssueEmail(scan: ScanResult, previous: ScanResult | null, recipientOverride?: string): Promise<EmailAlertOutcome> {
  const critical = scan.detailedIssues.filter((issue) => issue.severity === 'critical');
  const previousCritical = new Set((previous?.detailedIssues ?? []).filter((issue) => issue.severity === 'critical').map(signature));
  const newCritical = critical.filter((issue) => !previousCritical.has(signature(issue)));
  const siteWentDown = !scan.uptime.ok && (previous?.uptime?.ok !== false);
  const needed = siteWentDown || newCritical.length > 0;
  if (!needed) return { needed: false, sent: false, message: 'No new critical issue or new website-down event; no email needed.' };

  const apiKey = process.env.RESEND_API_KEY?.trim();
  const configuredRecipients = (process.env.ALERT_EMAIL_TO ?? '').split(',').map((item) => item.trim()).filter(Boolean);
  const overrideList = (recipientOverride ?? '').split(',').map((item) => item.trim()).filter(Boolean);
  const recipientList = overrideList.length ? overrideList : configuredRecipients;
  const from = process.env.ALERT_EMAIL_FROM?.trim();
  if (!apiKey || !recipientList.length || !from) {
    return { needed: true, sent: false, message: 'Critical issue detected, but email alerts are not configured. Set RESEND_API_KEY, ALERT_EMAIL_TO, and ALERT_EMAIL_FROM.' };
  }

  const subject = `[Website Monitor AI] ${siteWentDown ? 'Website is DOWN' : `${newCritical.length} new critical issue(s)`} — ${hostOf(scan.siteUrl)}`;
  const issueRows = newCritical.slice(0, 15).map((issue) => `<tr><td style="padding:10px;border-bottom:1px solid #e2e8f0"><b>${escapeHtml(issue.title)}</b><br><span style="color:#475569">${escapeHtml(issue.category)} · ${escapeHtml(issue.severity)}</span><br><a href="${escapeHtml(issue.url || scan.siteUrl)}">${escapeHtml(issue.url || scan.siteUrl)}</a><p>${escapeHtml(issue.what)}</p><p><b>Recommended action:</b> ${escapeHtml(issue.recommendation)}</p></td></tr>`).join('');
  const textIssues = newCritical.slice(0, 15).map((issue) => `- ${issue.title} (${issue.category}, ${issue.severity})\n  URL: ${issue.url || scan.siteUrl}\n  Finding: ${issue.what}\n  Recommended: ${issue.recommendation}`).join('\n\n');
  const text = `Website Monitor AI alert\nWebsite: ${scan.siteUrl}\nChecked: ${scan.checkedAt}\nHTTP: ${scan.uptime.status ?? 'no response'}\n${siteWentDown ? `Website-down reason: ${scan.uptime.error || 'Homepage check failed'}` : ''}\n\nNew critical findings:\n${textIssues || 'Website availability changed to down.'}\n\nOpen your protected Website Monitor AI dashboard to review the full scan.`;
  const html = `<div style="font-family:Arial,sans-serif;color:#0f172a;max-width:760px;margin:auto"><div style="background:#8f0000;color:#fff;padding:22px;border-radius:12px"><h1 style="margin:0;font-size:22px">Website Monitor AI alert</h1><p style="margin:8px 0 0">${siteWentDown ? 'Website is down' : 'New critical findings detected'}</p></div><div style="padding:20px 4px"><p><b>Website:</b> <a href="${escapeHtml(scan.siteUrl)}">${escapeHtml(scan.siteUrl)}</a></p><p><b>Checked:</b> ${escapeHtml(new Date(scan.checkedAt).toLocaleString())}</p><p><b>HTTP status:</b> ${scan.uptime.status ?? 'No response'}</p>${siteWentDown ? `<p style="color:#b91c1c"><b>Website unavailable:</b> ${escapeHtml(scan.uptime.error || 'Homepage check failed')}</p>` : ''}${newCritical.length ? `<h2 style="font-size:18px">${newCritical.length} new critical finding(s)</h2><table style="border-collapse:collapse;width:100%">${issueRows}</table>` : ''}<p style="margin-top:24px;color:#64748b;font-size:12px">This email was generated automatically from a read-only monitoring scan.</p></div></div>`;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: recipientList, subject, text, html }),
      signal: AbortSignal.timeout(12000),
      cache: 'no-store',
    });
    const payload = await response.json().catch(() => ({})) as { message?: string; id?: string };
    if (!response.ok) return { needed: true, sent: false, recipients: recipientList, message: `Email alert provider returned HTTP ${response.status}: ${payload.message || 'check Resend API key and verified sender domain.'}` };
    return { needed: true, sent: true, recipients: recipientList, message: `Critical issue alert email sent to ${recipientList.join(', ')}.` };
  } catch (error) {
    return { needed: true, sent: false, recipients: recipientList, message: `Email alert request failed: ${error instanceof Error ? error.message : 'network error'}` };
  }
}


export function findPreviousScan(
  scan: ScanResult,
  history: ScanResult[]
) {
  const currentUrl = normalizeComparisonUrl(scan.siteUrl);

  return history
    .filter(
      (item) =>
        item.id !== scan.id &&
        item.checkedAt < scan.checkedAt &&
        normalizeComparisonUrl(item.siteUrl) === currentUrl
    )
    .sort((a, b) => b.checkedAt.localeCompare(a.checkedAt))[0] ?? null;
}