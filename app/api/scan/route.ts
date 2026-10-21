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
    try { const body = await request.json() as { siteUrl?: unknown; crawlLimit?: unknown; includeSitemap?: unknown }; if (typeof body.siteUrl === 'string') options.siteUrl = body.siteUrl; if (typeof body.crawlLimit === 'number') options.crawlLimit = body.crawlLimit; options.includeSitemap = body.includeSitemap === true; } catch { /* integrations may send an empty body to use defaults */ }
    const result = await runWebsiteScan(undefined, options);
    const alert = await evaluateScanEmailAlert(result, { mode: 'manual' });
    if (alert.activity) { result.activities.push(alert.activity); if (!alert.sent) result.warnings.push(alert.message); }
    let storage: { saved: boolean; reason?: string } = { saved: false, reason: 'Supabase is not configured.' };
    try { storage = await saveScan(result); } catch (error) { storage = { saved: false, reason: error instanceof Error ? error.message : 'History save failed' }; }
    return NextResponse.json({ ...result, storage });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Scan failed' }, { status: 500 });
  }
}
