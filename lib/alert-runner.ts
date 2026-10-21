import type { ScanActivity, ScanResult } from '@/types';
import { getSiteHistory } from '@/lib/storage';
import { findPreviousScan, sendScanAlertEmail, type ScanTriggerMode } from '@/lib/email-alerts';

export type AlertRun = { activity?: ScanActivity; sent: boolean; needed: boolean; message: string };

export interface AlertOptions {
  mode?: ScanTriggerMode;
  recipientOverride?: string;
}

/**
 * Evaluates whether to send an email alert and executes it:
 * - In 'manual' mode: Only sends if changes are detected compared to the previous scan.
 * - In 'scheduled' mode: Always sends an email (even if the scan is identical to the previous one).
 */
export async function evaluateScanEmailAlert(
  scan: ScanResult,
  options: AlertOptions = {}
): Promise<AlertRun> {
  const mode = options.mode ?? 'manual';
  const history = await getSiteHistory(scan.siteUrl);
  const previous = findPreviousScan(scan, history.scans);
  const outcome = await sendScanAlertEmail(scan, previous, options);

  if (!outcome.needed) {
    return { sent: false, needed: false, message: outcome.message };
  }

  return {
    sent: outcome.sent,
    needed: true,
    message: outcome.message,
    activity: {
      timestamp: new Date().toISOString(),
      step: mode === 'scheduled' ? 'Scheduled email report' : 'Scan change email alert',
      message: outcome.message,
      level: outcome.sent ? 'success' : 'warning',
    },
  };
}

/** Legacy backwards-compatible export */
export async function evaluateCriticalEmailAlert(
  scan: ScanResult,
  recipientOverride?: string
): Promise<AlertRun> {
  return evaluateScanEmailAlert(scan, { mode: 'manual', recipientOverride });
}
