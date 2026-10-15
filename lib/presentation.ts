import type { ScanActivity, SpeedMetrics } from '@/types';

/** True when Lighthouse returned at least one usable score or Core Web Vital. */
export function hasLighthouseData(speed?: SpeedMetrics | null): boolean {
  if (!speed) return false;
  return [speed.performance, speed.accessibility, speed.bestPractices, speed.seo, speed.lcpMs, speed.cls, speed.tbtMs]
    .some((value) => typeof value === 'number' && Number.isFinite(value));
}

/** Turn low-level provider errors into a message suitable for a dashboard or report. */
export function explainPageSpeedError(error?: string | null): string {
  if (!error) return 'PageSpeed Insights did not return a usable Lighthouse result for this scan.';
  const message = error.toLowerCase();
  if (/http 429|quota|rate.limit/.test(message)) {
    return 'Google PageSpeed Insights rejected the request because of a quota or rate limit. Wait before retrying, then check the PageSpeed Insights API quota and key restrictions in Google Cloud Console.';
  }
  if (/http 403|forbidden|permission denied|access denied/.test(message)) {
    return 'Google PageSpeed Insights denied this request. Verify that the PageSpeed Insights API is enabled and that the API key belongs to the correct Google Cloud project and is allowed to call this API.';
  }
  if (/timed out|timeout|abort|aborted/.test(message)) {
    return 'Google PageSpeed Insights did not finish within the allowed time, even after one retry. This scan has no verified Lighthouse scores, so the dashboard will not substitute guessed values. Try another scan later; if it keeps happening, check API quota/key restrictions and the website response time.';
  }
  return `PageSpeed Insights is unavailable: ${error}`;
}

/** Old saved scans can contain identical activity rows; hide duplicate copies without losing real repeated steps. */
export function uniqueActivities(activities?: ScanActivity[] | null): ScanActivity[] {
  const seen = new Set<string>();
  return (activities ?? []).filter((entry) => {
    const key = [entry.timestamp, entry.step, entry.message, entry.level, entry.durationMs ?? ''].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
