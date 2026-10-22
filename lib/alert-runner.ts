import type { ScanActivity, ScanResult } from '@/types';
import { claimEmailNotificationAttempt, getSiteHistory, recordEmailNotification } from '@/lib/storage';
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
  const notificationType = mode === 'scheduled' ? 'scheduled-digest' : 'manual-alert';
  const idempotencyKey = `${notificationType}:${scan.id}`;
  const claim = await claimEmailNotificationAttempt({
    idempotencyKey,
    scanId: scan.id,
    siteUrl: scan.siteUrl,
    notificationType,
    triggerReason: mode === 'scheduled' ? 'Scheduled digest' : 'Manual scan change evaluation',
  });
  if (claim.duplicate) {
    return {
      sent: false,
      needed: false,
      message: 'Duplicate notification suppressed; this scan already has an email attempt recorded.',
      activity: {
        timestamp: new Date().toISOString(),
        step: mode === 'scheduled' ? 'Scheduled email report' : 'Scan change email alert',
        message: 'Duplicate notification suppressed for this scan.',
        level: 'info',
      },
    };
  }

  const outcome = await sendScanAlertEmail(scan, previous, options);
  const event = await recordEmailNotification({
    idempotencyKey,
    scanId: scan.id,
    siteUrl: scan.siteUrl,
    notificationType,
    triggerReason: outcome.triggerReason,
    status: outcome.status,
    providerMessageId: outcome.providerMessageId,
    errorReason: outcome.status === 'failed' ? outcome.message : undefined,
  });
  const historyNote = !event.saved
    ? ` Email history was not saved: ${event.reason}${claim.saved ? '' : claim.reason ? `; duplicate suppression is unavailable: ${claim.reason}` : ''}`
    : '';
  const message = `${outcome.message}${historyNote}`;

  if (!outcome.needed) {
    return {
      sent: false,
      needed: false,
      message,
      activity: {
        timestamp: new Date().toISOString(),
        step: mode === 'scheduled' ? 'Scheduled email report' : 'Scan change email alert',
        message,
        level: outcome.status === 'skipped' ? 'info' : 'warning',
      },
    };
  }

  return {
    sent: outcome.sent,
    needed: true,
    message,
    activity: {
      timestamp: new Date().toISOString(),
      step: mode === 'scheduled' ? 'Scheduled email report' : 'Scan change email alert',
      message,
      level: outcome.status === 'accepted' ? 'success' : outcome.status === 'skipped' ? 'info' : 'warning',
    },
  };
}

export async function logQuietModeSkip(scan: ScanResult): Promise<ScanActivity> {
  const idempotencyKey = `quiet-mode:${scan.id}`;
  const triggerReason = 'Quiet Mode is enabled for this manual scan.';
  const claim = await claimEmailNotificationAttempt({
    idempotencyKey,
    scanId: scan.id,
    siteUrl: scan.siteUrl,
    notificationType: 'quiet-mode',
    triggerReason,
  });
  const event = claim.claimed
    ? await recordEmailNotification({
        idempotencyKey,
        scanId: scan.id,
        siteUrl: scan.siteUrl,
        notificationType: 'quiet-mode',
        triggerReason,
        status: 'skipped',
      })
    : { saved: claim.duplicate, reason: claim.reason };
  const message = event.saved
    ? 'Email notification skipped by Quiet Mode.'
    : `Email notification skipped by Quiet Mode; history was not saved: ${event.reason}`;
  return {
    timestamp: new Date().toISOString(),
    step: 'Scan email alert',
    message,
    level: event.saved ? 'info' : 'warning',
  };
}

/** Legacy backwards-compatible export */
export async function evaluateCriticalEmailAlert(
  scan: ScanResult,
  recipientOverride?: string
): Promise<AlertRun> {
  return evaluateScanEmailAlert(scan, { mode: 'manual', recipientOverride });
}
