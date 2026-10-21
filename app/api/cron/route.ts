import { NextRequest, NextResponse } from 'next/server';
import { runWebsiteScan } from '@/lib/monitor';
import { saveScan, claimDueMonitoredSites, updateMonitoredSiteStatus, claimDefaultScheduledScan } from '@/lib/storage';
import { evaluateScanEmailAlert } from '@/lib/alert-runner';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    console.error('[Cron] CRON_SECRET is not configured on the server. Failing closed.');
    return NextResponse.json(
      { error: 'CRON_SECRET is not configured on the server. Scheduled scans are disabled until configured.' },
      { status: 500 }
    );
  }

  const authHeader = request.headers.get('authorization')?.trim();
  const expectedAuth = `Bearer ${secret}`;

  // Enforce strict Authorization: Bearer <CRON_SECRET>. Fail closed on missing or incorrect credentials.
  if (!authHeader || authHeader !== expectedAuth) {
    console.warn('[Cron] Unauthorized call attempt: invalid or missing Bearer token.');
    return NextResponse.json({ error: 'Unauthorized: valid Bearer token required.' }, { status: 401 });
  }

  console.log('[Cron] Execution authorized. Processing due monitored sites...');

  try {
    const schedule = await claimDueMonitoredSites(3);
    if (!schedule.ready) {
      return NextResponse.json({ error: schedule.reason || 'Monitored-site scheduling is unavailable.' }, { status: 503 });
    }

    if (schedule.hasMonitoredSites) {
      const results = [];
      for (const site of schedule.sites) {
        try {
          const scan = await runWebsiteScan(undefined, {
            siteUrl: site.url,
            crawlLimit: site.crawlLimit,
            includeSitemap: true,
          });

          const alert = await evaluateScanEmailAlert(scan, {
            mode: 'scheduled',
            recipientOverride: site.alertEmail || undefined,
          });
          if (alert.activity) {
            scan.activities.push(alert.activity);
            if (!alert.sent) scan.warnings.push(alert.message);
          }

          const storage = await saveScan(scan);
          await updateMonitoredSiteStatus(site.id, scan.overallStatus, scan.uptime.status);

          results.push({
            siteUrl: site.url,
            status: scan.overallStatus,
            alert: { needed: alert.needed, sent: alert.sent, message: alert.message },
            storage,
          });
        } catch (scanError) {
          const message = scanError instanceof Error ? scanError.message : 'Scan failed';
          try {
            await updateMonitoredSiteStatus(site.id, 'down', 500);
            results.push({ siteUrl: site.url, status: 'down', error: message });
          } catch (statusError) {
            results.push({
              siteUrl: site.url,
              status: 'down',
              error: `${message}; status update failed: ${statusError instanceof Error ? statusError.message : 'unknown database error'}`,
            });
          }
        }
      }

      return NextResponse.json({
        ok: true,
        mode: 'multi-site',
        processed: results.length,
        results,
      });
    }

    const defaultSiteUrl = process.env.SITE_URL?.trim();
    if (!defaultSiteUrl) {
      return NextResponse.json({ ok: true, mode: 'multi-site', processed: 0, results: [] });
    }
    const claimed = await claimDefaultScheduledScan(defaultSiteUrl);
    if (!claimed) {
      return NextResponse.json({ ok: true, mode: 'default-site', skipped: true, reason: 'A scheduled scan for this website was already claimed today.' });
    }

    const result = await runWebsiteScan(undefined, { siteUrl: defaultSiteUrl, includeSitemap: true });
    const alert = await evaluateScanEmailAlert(result, { mode: 'scheduled' });
    if (alert.activity) {
      result.activities.push(alert.activity);
      if (!alert.sent) result.warnings.push(alert.message);
    }
    const storage = await saveScan(result);

    return NextResponse.json({
      ok: true,
      mode: 'default-site',
      status: result.overallStatus,
      checkedAt: result.checkedAt,
      alert: { needed: alert.needed, sent: alert.sent, message: alert.message },
      storage,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Scheduled scan failed' }, { status: 500 });
  }
}
