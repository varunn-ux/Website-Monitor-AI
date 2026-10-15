import { NextRequest, NextResponse } from 'next/server';
import { runWebsiteScan } from '@/lib/monitor';
import { saveScan } from '@/lib/storage';
import { evaluateCriticalEmailAlert } from '@/lib/alert-runner';
export const runtime = 'nodejs';
export const maxDuration = 300;
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const result = await runWebsiteScan();
    const alert = await evaluateCriticalEmailAlert(result);
    if (alert.activity) { result.activities.push(alert.activity); if (!alert.sent) result.warnings.push(alert.message); }
    const storage = await saveScan(result);
    return NextResponse.json({ ok: true, status: result.overallStatus, checkedAt: result.checkedAt, alert: { needed: alert.needed, sent: alert.sent, message: alert.message }, storage });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Scheduled scan failed' }, { status: 500 });
  }
}
