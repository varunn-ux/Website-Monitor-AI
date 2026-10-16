import { NextRequest, NextResponse } from 'next/server';
import { runWebsiteScan } from '@/lib/monitor';
import { saveScan, getDueMonitoredSites, updateMonitoredSiteStatus } from '@/lib/storage';
import { evaluateCriticalEmailAlert } from '@/lib/alert-runner';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  const isVercelCron = request.headers.get('x-vercel-cron') === '1' || request.headers.get('user-agent')?.includes('vercel-cron');
  const isSecretMatch = secret && authHeader === `Bearer ${secret}`;

  if (!isSecretMatch && !isVercelCron) {
    console.warn('[Cron] Unauthorized call attempt');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  console.log('[Cron] Execution started. Checking due monitored sites...');

  try {
    // 1. Check if there are active, due websites in monitored_sites table
    // Process in a bounded batch of up to 3 to prevent timeouts on Vercel/serverless
    const dueSites = await getDueMonitoredSites(3);

    if (dueSites.length > 0) {
      const results = [];
      for (const site of dueSites) {
        try {
          const scan = await runWebsiteScan(undefined, {
            siteUrl: site.url,
            crawlLimit: site.crawlLimit,
          });

          const alert = await evaluateCriticalEmailAlert(scan, site.alertEmail || undefined);
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
          results.push({
            siteUrl: site.url,
            status: 'down',
            error: scanError instanceof Error ? scanError.message : 'Scan failed',
          });
          await updateMonitoredSiteStatus(site.id, 'down', 500);
        }
      }

      return NextResponse.json({
        ok: true,
        mode: 'multi-site',
        processed: results.length,
        results,
      });
    }

    // 2. Fallback to default single-site scan if no monitored_sites are configured/due
    const result = await runWebsiteScan();
    const alert = await evaluateCriticalEmailAlert(result);
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
