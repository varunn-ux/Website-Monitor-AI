import { NextResponse } from 'next/server';
import { runWebsiteScan } from '@/lib/monitor';
import { saveScan } from '@/lib/storage';
import { evaluateScanEmailAlert } from '@/lib/alert-runner';
import type { ScanActivity } from '@/types';
import type { ScanOptions } from '@/lib/monitor';

export const runtime = 'nodejs';
export const maxDuration = 300;

function activity(step: string, message: string, level: ScanActivity['level']): ScanActivity {
  return { timestamp: new Date().toISOString(), step, message, level };
}
export async function POST(request: Request) {
  let requestOptions: ScanOptions = {};
  try {
    const body = await request.json() as { siteUrl?: unknown; crawlLimit?: unknown; includeSitemap?: unknown };
    if (typeof body.siteUrl === 'string' && body.siteUrl.trim()) requestOptions.siteUrl = body.siteUrl.trim();
    const requestedLimit = Number(body.crawlLimit);
    if (Number.isFinite(requestedLimit)) requestOptions.crawlLimit = Math.min(500, Math.max(10, Math.round(requestedLimit)));
    requestOptions.includeSitemap = body.includeSitemap === true;
  } catch { /* empty/missing JSON means use safe defaults */ }
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (event: unknown) => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`)); }
        catch { closed = true; }
      };
      void (async () => {
        try {
          const result = await runWebsiteScan((entry) => send({ type: 'activity', activity: entry }), requestOptions);
          const alert = await evaluateScanEmailAlert(result, { mode: 'manual' });
          if (alert.activity) {
            result.activities.push(alert.activity);
            if (!alert.sent) result.warnings.push(alert.message);
            send({ type: 'activity', activity: alert.activity });
          }
          const savingActivity = activity('Supabase history', 'Saving scan results and issue details to the database.', 'info');
          result.activities.push(savingActivity);
          send({ type: 'activity', activity: savingActivity });
          const storage = await saveScan(result);
          const storageActivity = activity('Supabase history', storage.saved ? 'Scan results were saved to Supabase.' : storage.reason || 'Scan history could not be saved.', storage.saved ? 'success' : 'warning');
          result.activities.push(storageActivity);
          if (!storage.saved && storage.reason) result.warnings.push(storage.reason);
          send({ type: 'activity', activity: storageActivity });
          send({ type: 'complete', result, storage });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Scan failed';
          send({ type: 'error', error: message, activity: activity('Scan failed', message, 'error') });
        } finally {
          if (!closed) {
            closed = true;
            try { controller.close(); } catch { /* the client may already have disconnected */ }
          }
        }
      })();
    },
    cancel() { /* Scan is read-only; backend may finish even if the browser disconnects. */ },
  });
  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' } });
}
