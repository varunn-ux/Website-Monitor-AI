import type { ScanActivity, ScanResult } from '@/types';
import { getHistory } from '@/lib/storage';
import { findPreviousScan, sendCriticalIssueEmail } from '@/lib/email-alerts';

export type AlertRun = { activity?: ScanActivity; sent: boolean; needed: boolean; message: string };

/** Uses the last saved run for the same website to avoid repeating the same critical alert every scan. */
export async function evaluateCriticalEmailAlert(scan: ScanResult, recipientOverride?: string): Promise<AlertRun> {
  const history = await getHistory();
  const previous = findPreviousScan(scan, history.scans);
  const outcome = await sendCriticalIssueEmail(scan, previous, recipientOverride);
  if (!outcome.needed) return { sent: false, needed: false, message: outcome.message };
  return {
    sent: outcome.sent,
    needed: true,
    message: outcome.message,
    activity: {
      timestamp: new Date().toISOString(),
      step: 'Critical email alert',
      message: outcome.message,
      level: outcome.sent ? 'success' : 'warning',
    },
  };
}
