import type { IssueDetail } from '@/types';

/** A stable key lets the same issue keep its workflow status across scans. */
export function getIssueTrackingKey(issue: Pick<IssueDetail, 'category' | 'title' | 'url'>): string {
  const title = issue.title
    .toLowerCase()
    .replace(/mobile performance score is \d+\/100/g, 'mobile performance score')
    .replace(/\b\d+\/100\b/g, 'score')
    .replace(/\b\d+\s+image\(s\)/g, 'N image(s)')
    .replace(/\b\d+\s+(?=(?:images?|findings?|h1|urls?|pages?)\b)/g, 'N ')
    .replace(/\b\d+(?:\.\d+)?\s*(?:ms|s|kb|kib|mb)\b/g, 'measurement')
    .replace(/\s+/g, ' ')
    .trim();
  let path = '/';
  try { path = new URL(issue.url || 'https://example.invalid').pathname.toLowerCase().replace(/\/+$/, '') || '/'; } catch { /* use the root fallback */ }
  const source = `${issue.category}|${title}|${path}`;
  // Small deterministic FNV-1a hash; this is an identifier, not a security hash.
  let hash = 2166136261;
  for (let i = 0; i < source.length; i += 1) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `${issue.category}-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}
