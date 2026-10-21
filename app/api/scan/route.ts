import { NextResponse } from 'next/server';
import type { ScanOptions } from '@/lib/monitor';
import { runWebsiteScan } from '@/lib/monitor';
import { saveScan } from '@/lib/storage';
import { evaluateScanEmailAlert } from '@/lib/alert-runner';
export const runtime = 'nodejs';
export const maxDuration = 300;
export async function POST(request: Request) {
  try {
    let options: ScanOptions = {};
    let sendEmailAlert = true;
    try {
      const body = await request.json() as { siteUrl?: unknown; crawlLimit?: unknown; includeSitemap?: unknown; sendEmailAlert?: unknown };
      if (typeof body.siteUrl === 'string') options.siteUrl = body.siteUrl;
      if (typeof body.crawlLimit === 'number') options.crawlLimit = body.crawlLimit;
      options.includeSitemap = body.includeSitemap === true;
      if (typeof body.sendEmailAlert === 'boolean') sendEmailAlert = body.sendEmailAlert;
    } catch { /* integrations may send an empty body to use defaults */ }
    const result = await runWebsiteScan(undefined, options);
    if (sendEmailAlert) {
      const alert = await evaluateScanEmailAlert(result, { mode: 'manual' });
      if (alert.activity) { result.activities.push(alert.activity); if (!alert.sent) result.warnings.push(alert.message); }
    } else {
      result.activities.push({
        timestamp: new Date().toISOString(),
        step: 'Scan email alert',
        message: 'Email notification disabled for this manual scan (quiet mode).',
        level: 'info',
      });
    }
    let storage: { saved: boolean; reason?: string } = { saved: false, reason: 'Supabase is not configured.' };
    try { storage = await saveScan(result); } catch (error) { storage = { saved: false, reason: error instanceof Error ? error.message : 'History save failed' }; }
    return NextResponse.json({ ...result, storage });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Scan failed' }, { status: 500 });
  }
}
