import { load } from 'cheerio';
import { randomUUID } from 'node:crypto';
import { GoogleGenAI } from '@google/genai';
import type { CrawlRedirect, IssueDetail, LinkIssue, PageSeo, ScanActivity, ScanResult, SpeedAudit, SpeedMetrics } from '@/types';
import { getSiteUrl, validatePublicSiteUrl } from '@/lib/config';
import { isConfirmedHttpFailure, isKnownHttpStatus } from '@/lib/availability';

const FETCH_TIMEOUT_MS = 12000;
const DEFAULT_MAX_LINKS = 30;
const MAX_ALLOWED_LINKS = 500;
export type ScanOptions = { siteUrl?: string; crawlLimit?: number; includeSitemap?: boolean };
const MAX_HTML_BYTES = 2_000_000;
type ProgressHandler = (activity: ScanActivity) => void;

async function fetchWithTimeout(url: string) {
  return fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), redirect: 'manual', headers: { 'user-agent': 'WebsiteMonitoringAgent/1.2 (+site-owner monitoring)' }, cache: 'no-store' });
}

function isHtml(contentType: string | null) { return !!contentType?.toLowerCase().includes('text/html'); }
async function readLimitedText(response: Response, maxBytes: number) {
  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    await response.body?.cancel();
    throw new Error(`Response is too large to inspect safely (over ${Math.round(maxBytes / 1_000_000)} MB).`);
  }
  if (!response.body) return '';

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytesRead = 0;
  let text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      if (bytesRead > maxBytes) {
        await reader.cancel();
        throw new Error(`Response is too large to inspect safely (over ${Math.round(maxBytes / 1_000_000)} MB).`);
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}
function normalizeCrawlUrl(raw: string) {
  try {
    const url = new URL(raw);
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
    url.hash = '';
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '');
    return url.toString();
  } catch { return raw; }
}
function isAllowedCrawlHost(candidate: string, base: string) {
  try {
    const target = new URL(candidate);
    const origin = new URL(base);
    if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password) return false;
    const rootHost = (host: string) => host.toLowerCase().replace(/^www\./, '');
    const isDefaultPort = (url: URL) => !url.port || (url.protocol === 'http:' && url.port === '80') || (url.protocol === 'https:' && url.port === '443');
    // Follow canonical www/non-www redirects, but never follow a website redirect to an unrelated host or unusual port.
    return rootHost(target.hostname) === rootHost(origin.hostname) && isDefaultPort(target) && isDefaultPort(origin);
  } catch { return false; }
}
type HtmlFetchResult = { response: Response; html: string; finalUrl: string; redirects: CrawlRedirect[]; redirectNote?: string };
async function getHtml(url: string, siteRoot: string): Promise<HtmlFetchResult> {
  let currentUrl = url;
  const redirects: CrawlRedirect[] = [];
  let response: Response | null = null;
  let redirectNote: string | undefined;
  const redirectCodes = new Set([301, 302, 303, 307, 308]);

  for (let hop = 0; hop <= 8; hop++) {
    response = await fetchWithTimeout(currentUrl);
    if (!redirectCodes.has(response.status)) break;
    const location = response.headers.get('location');
    if (!location) { redirectNote = `HTTP ${response.status} did not include a Location header.`; break; }
    let nextUrl: string;
    try {
      const next = new URL(location, currentUrl);
      next.hash = '';
      nextUrl = next.toString();
    } catch {
      redirectNote = `Invalid redirect target in Location header: ${location}`;
      break;
    }
    if (!isAllowedCrawlHost(nextUrl, siteRoot)) {
      redirectNote = `Redirect target is outside the monitored website host and was not followed: ${nextUrl}`;
      break;
    }
    if (redirects.some((item) => item.from === nextUrl) || nextUrl === currentUrl) {
      redirectNote = `Redirect loop detected at ${nextUrl}`;
      break;
    }
    if (hop === 8) {
      redirectNote = 'Redirect chain exceeded the 8-hop safety limit.';
      break;
    }
    redirects.push({ from: currentUrl, to: nextUrl, status: response.status });
    currentUrl = nextUrl;
  }

  if (!response) throw new Error('No HTTP response was received.');
  const type = response.headers.get('content-type');
  if (redirectCodes.has(response.status) || !isHtml(type)) {
    return { response, html: '', finalUrl: currentUrl, redirects, ...(redirectNote ? { redirectNote } : {}) };
  }
  let html: string;
  try {
    html = await readLimitedText(response, MAX_HTML_BYTES);
  } catch (error) {
    if (error instanceof Error && error.message.includes('too large')) {
      throw new Error('Page is too large to inspect safely (over 2 MB).');
    }
    throw error;
  }
  return { response, html, finalUrl: currentUrl, redirects, ...(redirectNote ? { redirectNote } : {}) };
}

function extractSeo(url: string, status: number, html: string): PageSeo {
  const $ = load(html);
  const title = $('title').first().text().trim();
  const description = $('meta[name="description"]').attr('content')?.trim() ?? '';
  const h1Texts = $('h1').map((_, el) => $(el).text().trim()).get().filter(Boolean).slice(0, 10);
  const h1Count = $('h1').length;
  const images = $('img').length;
  const missingAltElements = $('img').filter((_, el) => !$(el).attr('alt')?.trim());
  const missingAltImages = missingAltElements.map((_, el) => {
    const src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-lazy-src') || '(image has no src attribute)';
    try { return new URL(src, url).toString(); } catch { return src; }
  }).get().slice(0, 50);
  const imagesMissingAlt = missingAltElements.length;
  const canonical = $('link[rel="canonical"]').attr('href') ?? '';
  const issues: string[] = [];
  if (!title) issues.push('Missing page title');
  else if (title.length < 30 || title.length > 60) issues.push(`Title length is ${title.length}; aim for roughly 30–60 characters`);
  if (!description) issues.push('Missing meta description');
  else if (description.length < 70 || description.length > 160) issues.push(`Meta description length is ${description.length}; aim for roughly 70–160 characters`);
  if (h1Count === 0) issues.push('Missing H1 heading');
  if (h1Count > 1) issues.push(`Found ${h1Count} H1 headings; review heading hierarchy`);
  if (imagesMissingAlt > 0) issues.push(`${imagesMissingAlt} image(s) missing alt text`);
  if (!canonical) issues.push('Missing canonical URL');
  if (status >= 400) issues.push(`Page returned HTTP ${status}`);
  return { url, status, title, titleLength: title.length, description, h1Count, h1Texts, images, imagesMissingAlt, missingAltImages, canonical, issues };
}

type SitemapDiscovery = { urls: string[]; sources: string[]; warnings: string[] };

async function fetchSameSiteText(startUrl: string, siteRoot: string): Promise<{ ok: boolean; status: number; text: string; finalUrl: string }> {
  let currentUrl = startUrl;
  const redirectCodes = new Set([301, 302, 303, 307, 308]);
  for (let hop = 0; hop <= 8; hop++) {
    const response = await fetchWithTimeout(currentUrl);
    if (redirectCodes.has(response.status)) {
      const location = response.headers.get('location');
      if (!location) return { ok: false, status: response.status, text: '', finalUrl: currentUrl };
      let next: string;
      try { next = new URL(location, currentUrl).toString(); } catch { return { ok: false, status: response.status, text: '', finalUrl: currentUrl }; }
      if (!isAllowedCrawlHost(next, siteRoot) || next === currentUrl || hop === 8) return { ok: false, status: response.status, text: '', finalUrl: currentUrl };
      currentUrl = next;
      continue;
    }
    if (!response.ok) return { ok: false, status: response.status, text: '', finalUrl: currentUrl };
    let text: string;
    try {
      text = await readLimitedText(response, MAX_HTML_BYTES);
    } catch (error) {
      if (error instanceof Error && error.message.includes('too large')) return { ok: false, status: response.status, text: '', finalUrl: currentUrl };
      throw error;
    }
    return { ok: true, status: response.status, text, finalUrl: currentUrl };
  }
  return { ok: false, status: 0, text: '', finalUrl: currentUrl };
}

async function discoverSitemapUrls(siteRoot: string, urlLimit: number, addActivity: (step: string, message: string, level?: ScanActivity['level'], durationMs?: number) => void): Promise<SitemapDiscovery> {
  const started = Date.now();
  const sources = new Set<string>();
  const discovered = new Set<string>();
  const warnings: string[] = [];
  let robotsChecked = false;
  try {
    const robotsUrl = new URL('/robots.txt', siteRoot).toString();
    const robots = await fetchSameSiteText(robotsUrl, siteRoot);
    robotsChecked = robots.ok;
    if (robots.ok) {
      for (const line of robots.text.split(/\r?\n/)) {
        const match = line.match(/^\s*sitemap\s*:\s*(\S+)/i);
        if (match) {
          try {
            const candidate = new URL(match[1], siteRoot).toString();
            if (isAllowedCrawlHost(candidate, siteRoot)) sources.add(candidate);
          } catch { /* ignore malformed robots sitemap declarations */ }
        }
      }
    }
  } catch (error) {
    warnings.push(`Could not read robots.txt for sitemap discovery: ${error instanceof Error ? error.message : 'request failed'}`);
  }
  // WordPress core and common SEO plugins use one of these default locations.
  for (const path of ['/wp-sitemap.xml', '/sitemap_index.xml', '/sitemap.xml']) {
    try { sources.add(new URL(path, siteRoot).toString()); } catch { /* siteRoot was already validated */ }
  }

  const sitemapQueue = Array.from(sources);
  const visitedSitemaps = new Set<string>();
  const readSitemaps = new Set<string>();
  const maxSitemapFiles = 12;
  while (sitemapQueue.length && visitedSitemaps.size < maxSitemapFiles && discovered.size < urlLimit) {
    const sitemapUrl = sitemapQueue.shift()!;
    if (visitedSitemaps.has(sitemapUrl) || !isAllowedCrawlHost(sitemapUrl, siteRoot)) continue;
    visitedSitemaps.add(sitemapUrl);
    addActivity('Reading sitemap', `Requesting sitemap ${sitemapUrl} (${visitedSitemaps.size}/${maxSitemapFiles} sitemap-file safety limit).`);
    try {
      const response = await fetchSameSiteText(sitemapUrl, siteRoot);
      if (!response.ok) { addActivity('Reading sitemap', `${sitemapUrl} was unavailable (HTTP ${response.status}).`, 'warning'); continue; }
      readSitemaps.add(response.finalUrl);
      const $ = load(response.text, { xmlMode: true });
      const locations = $('loc').map((_, el) => $(el).text().trim()).get().filter(Boolean);
      const isIndex = $('sitemapindex').length > 0;
      addActivity('Sitemap parsed', `${response.finalUrl}: ${locations.length} loc entr(ies) found${isIndex ? ' in a sitemap index' : ''}.`, locations.length ? 'success' : 'warning');
      if (isIndex) {
        for (const location of locations) {
          try {
            const child = new URL(location, response.finalUrl).toString();
            if (isAllowedCrawlHost(child, siteRoot) && !visitedSitemaps.has(child) && !sitemapQueue.includes(child) && sitemapQueue.length < maxSitemapFiles) sitemapQueue.push(child);
          } catch { /* ignore invalid sitemap child URLs */ }
        }
      } else {
        for (const location of locations) {
          try {
            const pageUrl = new URL(location, response.finalUrl);
            pageUrl.hash = '';
            if (isAllowedCrawlHost(pageUrl.toString(), siteRoot) && ['http:', 'https:'].includes(pageUrl.protocol)) {
              const normalized = normalizeCrawlUrl(pageUrl.toString());
              if (!discovered.has(normalized)) discovered.add(normalized);
              if (discovered.size >= urlLimit) break;
            }
          } catch { /* ignore invalid sitemap loc entries */ }
        }
      }
    } catch (error) {
      warnings.push(`Sitemap read failed for ${sitemapUrl}: ${error instanceof Error ? error.message : 'request failed'}`);
    }
  }
  if (!discovered.size) {
    warnings.push(robotsChecked
      ? 'Sitemap scan was enabled, but no accessible same-site sitemap URLs were found. The crawl will continue using internal links.'
      : 'Sitemap scan was enabled, but robots.txt and common sitemap URLs did not return a readable sitemap. The crawl will continue using internal links.');
  }
  addActivity('Sitemap discovery', `Collected ${discovered.size} same-site page URL(s) from ${readSitemaps.size} readable sitemap file(s); crawl seeds are capped by the configured URL limit.`, discovered.size ? 'success' : 'warning', Date.now() - started);
  return { urls: Array.from(discovered).slice(0, Math.max(0, urlLimit - 1)), sources: Array.from(readSitemaps), warnings };
}

function isTimeoutError(error: unknown) {
  const item = error as { name?: string; message?: string };
  return /timeout|timed out|aborted|aborterror/i.test(`${item?.name ?? ''} ${item?.message ?? error ?? ''}`);
}

function configuredPageSpeedTimeout() {
  const configured = Number(process.env.PAGESPEED_TIMEOUT_MS ?? 75000);
  return Number.isFinite(configured) ? Math.min(120000, Math.max(30000, Math.round(configured))) : 75000;
}

async function requestPageSpeed(siteUrl: string, timeoutMs: number): Promise<SpeedMetrics> {
  const endpoint = new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed');
  endpoint.searchParams.set('url', siteUrl);
  endpoint.searchParams.set('strategy', 'mobile');
  for (const category of ['PERFORMANCE', 'ACCESSIBILITY', 'BEST_PRACTICES', 'SEO']) endpoint.searchParams.append('category', category);
  const key = process.env.PAGESPEED_API_KEY?.trim();
  if (key) endpoint.searchParams.set('key', key);

  const response = await fetch(endpoint, { signal: AbortSignal.timeout(timeoutMs), cache: 'no-store' });
  if (!response.ok) {
    let providerMessage = '';
    try {
      const body = await response.json();
      providerMessage = typeof body?.error?.message === 'string' ? body.error.message : '';
    } catch { /* An error response is not always JSON. */ }
    const message = providerMessage.toLowerCase();
    const reason = /api key.*expir|key.*expir/.test(message)
      ? 'the API key has expired; replace PAGESPEED_API_KEY and redeploy'
      : /api.?key.*invalid|invalid api.?key/.test(message)
        ? 'the API key is invalid; verify the key in the correct Google Cloud project'
        : /service_disabled|api.*not enabled|has not been used|disabled/.test(message)
          ? 'the PageSpeed Insights API is not enabled for this Google Cloud project'
          : /api_key_service_blocked|referer|ip address|key.*restrict/.test(message)
            ? 'the API key restrictions block this PageSpeed Insights request'
            : response.status === 429 || /quota|rate.?limit/.test(message)
              ? 'the PageSpeed Insights quota or rate limit was reached'
              : response.status === 403
                ? 'Google Cloud denied access; check API enablement, project access, and key restrictions'
                : `the request was rejected (HTTP ${response.status})`;
    throw new Error(`PageSpeed API returned HTTP ${response.status}: ${reason}.`);
  }

  const data = await response.json();
  const lighthouse = data?.lighthouseResult;
  if (!lighthouse?.categories || !lighthouse?.audits) {
    throw new Error('PageSpeed API response did not include usable Lighthouse categories and audits.');
  }
  const cats = lighthouse.categories;
  const audits = lighthouse.audits as Record<string, any>;
  const score = (name: string) => typeof cats[name]?.score === 'number' ? Math.round(cats[name].score * 100) : null;
  const findings: SpeedAudit[] = Object.entries(audits)
    .filter(([_, audit]) => typeof audit?.score === 'number' && audit.score < 0.9 && !['notApplicable', 'manual', 'informative', 'error'].includes(audit.scoreDisplayMode) && !!audit.title)
    .map(([id, audit]) => ({ id, title: String(audit.title), description: String(audit.description ?? '').replace(/\s+/g, ' ').trim().slice(0, 500), ...(audit.displayValue ? { displayValue: String(audit.displayValue) } : {}), score: audit.score as number }))
    .sort((a, b) => a.score - b.score)
    .slice(0, 12);
  const result: SpeedMetrics = {
    performance: score('performance'),
    accessibility: score('accessibility'),
    bestPractices: score('best-practices'),
    seo: score('seo'),
    lcpMs: typeof audits['largest-contentful-paint']?.numericValue === 'number' ? audits['largest-contentful-paint'].numericValue : null,
    cls: typeof audits['cumulative-layout-shift']?.numericValue === 'number' ? audits['cumulative-layout-shift'].numericValue : null,
    tbtMs: typeof audits['total-blocking-time']?.numericValue === 'number' ? audits['total-blocking-time'].numericValue : null,
    findings,
  };
  if (![result.performance, result.accessibility, result.bestPractices, result.seo, result.lcpMs, result.cls, result.tbtMs].some((value) => typeof value === 'number' && Number.isFinite(value))) {
    throw new Error('PageSpeed API returned a Lighthouse report but no usable scores or Core Web Vitals.');
  }
  return result;
}

async function checkSpeed(siteUrl: string, onRetry?: (message: string) => void): Promise<SpeedMetrics> {
  const timeoutMs = configuredPageSpeedTimeout();
  try {
    return await requestPageSpeed(siteUrl, timeoutMs);
  } catch (firstError) {
    // Retry only timeouts. Quota/permission errors are not helped by an immediate second request.
    if (!isTimeoutError(firstError)) {
      const message = firstError instanceof Error ? firstError.message : 'PageSpeed check failed';
      return { performance: null, accessibility: null, bestPractices: null, seo: null, lcpMs: null, cls: null, tbtMs: null, findings: [], error: message };
    }

    const retryTimeoutMs = Math.min(45000, timeoutMs);
    onRetry?.(`The first PageSpeed attempt timed out after ${Math.round(timeoutMs / 1000)} seconds. Retrying once with a ${Math.round(retryTimeoutMs / 1000)}-second timeout.`);
    try {
      return await requestPageSpeed(siteUrl, retryTimeoutMs);
    } catch (retryError) {
      const firstMessage = firstError instanceof Error ? firstError.message : 'request timed out';
      const retryMessage = retryError instanceof Error ? retryError.message : 'unknown retry error';
      const errorMessage = isTimeoutError(retryError)
        ? `PageSpeed timed out on both attempts (${Math.round(timeoutMs / 1000)} seconds and ${Math.round(retryTimeoutMs / 1000)} seconds). ${firstMessage}. Retry: ${retryMessage}`
        : `The first PageSpeed attempt timed out after ${Math.round(timeoutMs / 1000)} seconds; retry failed: ${retryMessage}`;
      return { performance: null, accessibility: null, bestPractices: null, seo: null, lcpMs: null, cls: null, tbtMs: null, findings: [], error: errorMessage };
    }
  }
}

function explainSeoIssue(issue: string, page: PageSeo): Omit<IssueDetail, 'id' | 'url' | 'source'> {
  if (issue === 'Missing page title') return { category: 'seo', severity: 'medium', title: issue, what: 'This page does not have a <title> element in its HTML.', impact: 'Search engines and browser tabs use the title to understand and label the page.', recommendation: 'Add a unique, descriptive title in the page SEO settings. Aim for about 30–60 characters and describe the actual page content.' };
  if (issue.startsWith('Title length')) return { category: 'seo', severity: 'low', title: 'Review title length', what: `The current title is ${page.titleLength} characters: “${page.title || '(empty)'}”.`, impact: 'Very short titles can lack context; long titles may be truncated in search results. These ranges are guidelines, not ranking guarantees.', recommendation: 'Write a concise, unique title describing this page, ideally around 30–60 characters.' };
  if (issue === 'Missing meta description') return { category: 'seo', severity: 'medium', title: issue, what: 'No meta name="description" tag was found in the page HTML.', impact: 'Search engines may choose unrelated page text for the search snippet.', recommendation: 'Add a unique summary of the page in the SEO settings, usually around 70–160 characters. Keep it accurate and useful.' };
  if (issue.startsWith('Meta description length')) return { category: 'seo', severity: 'low', title: 'Review meta description length', what: `The description is ${page.description.length} characters: “${page.description}”.`, impact: 'Descriptions that are too short may omit context; long descriptions may be truncated. Google may still choose a different snippet.', recommendation: 'Edit the description to give a clear, page-specific summary, roughly 70–160 characters.' };
  if (issue === 'Missing H1 heading') return { category: 'seo', severity: 'medium', title: issue, what: 'No H1 heading was found in the HTML.', impact: 'Visitors and search engines have less obvious information about the page’s main topic.', recommendation: 'Add one visible, descriptive H1 heading that represents the primary topic. Keep subheadings in a logical H2/H3 hierarchy.' };
  if (issue.startsWith('Found') && issue.includes('H1 headings')) return { category: 'seo', severity: 'low', title: 'Review multiple H1 headings', what: issue, impact: 'Multiple H1s are valid in some HTML patterns, but can make the page outline less clear if used inconsistently.', recommendation: 'Check the heading hierarchy and use one clear primary H1 where practical; use H2/H3 for sections.' };
  if (issue.includes('missing alt text')) return { category: 'accessibility', severity: 'medium', title: issue, what: `${page.imagesMissingAlt} image(s) on this page have no meaningful alt attribute. ${page.missingAltImages.length < page.imagesMissingAlt ? 'The list below is capped at 50 image URLs.' : ''}`, impact: 'Screen-reader users may not get the information conveyed by meaningful images, and search engines have less descriptive context.', recommendation: 'Add concise alt text describing each informative image. For decorative images use alt="". Do not stuff keywords into alt text.' };
  if (issue === 'Missing canonical URL') return { category: 'seo', severity: 'medium', title: issue, what: 'No rel="canonical" link tag was found in the HTML.', impact: 'If this page has duplicate or parameterized URLs, search engines may have less clarity about the preferred version.', recommendation: 'Add an absolute canonical URL pointing to the preferred public URL for this page; verify it does not point to a different or redirected page.' };
  if (issue.startsWith('Page returned HTTP')) return { category: 'availability', severity: 'high', title: issue, what: `The crawler received ${issue.replace('Page returned ', '')} for the page.`, impact: 'Visitors and search crawlers may not be able to access the page normally.', recommendation: 'Open the URL directly, inspect server/CDN logs, and fix the underlying response or redirect.' };
  return { category: 'seo', severity: 'low', title: issue, what: issue, impact: 'This check may affect how clearly search engines or assistive technology interpret the page.', recommendation: 'Review the page HTML and compare it with the SEO/accessibility guidance for the affected element.' };
}

function classifyAudit(audit: SpeedAudit): IssueDetail['category'] {
  const key = `${audit.id} ${audit.title}`.toLowerCase();
  if (/accessible|accessibility|aria|contrast|screen reader|discernible name|button.*name|link.*name|label.*form|focusable|tap target|target size|image-alt|heading order|sequentially-descending/.test(key)) return 'accessibility';
  if (/crawlable|canonical|meta description|document title|seo|robots|hreflang|structured data|indexing|valid source maps/.test(key)) return 'seo';
  if (/browser errors|errors-in-console|console errors|issues panel|console|deprecated|is-on-https|https|mixed content|content security policy|csp|secure/.test(key)) return 'best-practices';
  if (/broken link|link request|link returned|redirect loop/.test(key)) return 'links';
  return 'performance';
}

function auditSeverity(audit: SpeedAudit, category: IssueDetail['category']): IssueDetail['severity'] {
  const key = `${audit.id} ${audit.title}`.toLowerCase();
  const value = (audit.displayValue ?? '').replace(/,/g, '');
  const timeMatch = value.match(/([\d.]+)\s*(ms|s)\b/i);
  const bytesMatch = value.match(/([\d.]+)\s*(kib|kb|mb)\b/i);
  const milliseconds = timeMatch ? Number(timeMatch[1]) * (timeMatch[2].toLowerCase() === 's' ? 1000 : 1) : 0;
  const kib = bytesMatch ? Number(bytesMatch[1]) * (bytesMatch[2].toLowerCase() === 'mb' ? 1024 : 1) : 0;
  if (category === 'performance' && /render-blocking|use-efficient-cache-lifetimes|main-thread-work|image-delivery/.test(key) && (milliseconds >= 2000 || kib >= 1000)) return 'high';
  if (category === 'best-practices' && /is-on-https|mixed-content|unsafe/.test(key) && audit.score === 0) return 'high';
  if (category === 'seo' && /document-title|missing-title|robots-txt/.test(key) && audit.score === 0) return 'high';
  if (audit.score !== null && audit.score >= 0.9) return 'low';
  // Lighthouse scores describe audit outcomes, not severity; a zero score alone is not enough for a high-severity label.
  return 'medium';
}

function geminiErrorCategory(error: unknown) {
  const item = error as { status?: unknown; code?: unknown; message?: unknown };
  const status = Number(item?.status ?? item?.code);
  const message = typeof item?.message === 'string' ? item.message : '';
  if (status === 401 || /invalid.*api.?key|api.?key.*invalid|unauthorized/i.test(message)) return 'key';
  if (status === 403 || /permission|denied|forbidden/i.test(message)) return 'permission';
  if (status === 429 || /quota|rate.?limit|resource.?exhausted/i.test(message)) return 'quota';
  if (status === 404 || /model.*not found|not found.*model|unsupported model/i.test(message)) return 'model';
  return 'service';
}

function buildIssueDetails(uptime: ScanResult['uptime'], links: LinkIssue[], pages: PageSeo[], speed: SpeedMetrics): IssueDetail[] {
  const items: IssueDetail[] = [];
  if (isConfirmedHttpFailure(uptime.status)) {
    items.push({ id: 'website-down', category: 'availability', severity: 'critical', title: 'Website returned an unsuccessful homepage status', url: pages[0]?.url, what: `Homepage returned HTTP ${uptime.status}.`, impact: 'The homepage check received an unsuccessful HTTP response; visitors may be unable to access the site.', recommendation: 'Check the homepage response, hosting status, CDN/WAF rules, and server logs.' });
  } else if (!isKnownHttpStatus(uptime.status)) {
    items.push({ id: 'website-check-inconclusive', category: 'availability', severity: 'medium', title: 'Website availability could not be confirmed', url: pages[0]?.url, what: uptime.error || 'The homepage request did not receive an HTTP response.', impact: 'A network or scanner error is not proof that the website is down. Availability needs a successful HTTP response to be confirmed.', recommendation: 'Retry the scan and verify the website from another network before treating this as an outage.' });
  }
  for (const [index, link] of links.entries()) {
    const timedOut = link.status === null && /timed out|timeout|aborted/i.test(link.message);
    items.push({
      id: `link-${index}`,
      category: 'links',
      // A timeout is not proof of a broken link; treat it as a verification-needed issue.
      severity: !timedOut && link.status !== null && link.status >= 500 ? 'high' : 'medium',
      title: link.status ? `Internal URL returned HTTP ${link.status}` : timedOut ? 'URL request timed out' : 'Internal URL request failed',
      url: link.url,
      what: link.message,
      impact: timedOut ? 'The scanner could not confirm the page within the request timeout. The URL may be slow or temporarily unavailable; do not label it as broken until it is verified.' : 'Visitors may land on a failing URL, and crawlers can spend time on inaccessible destinations.',
      recommendation: timedOut ? 'Open the URL directly and retry the scan. If it repeatedly times out, review hosting response time, redirects, CDN/WAF rules, and server logs before changing the source link.' : 'Open the URL in a browser, correct the destination or restore the target page. If it redirects, update the source link to the final canonical URL.',
      source: 'Internal link crawl',
    });
  }
  for (const page of pages) for (const [index, issue] of page.issues.entries()) {
    const explained = explainSeoIssue(issue, page);
    items.push({ id: `seo-${items.length}-${index}`, ...explained, url: page.url, source: 'HTML/SEO rule check' });
  }
  if (speed.performance !== null && speed.performance < 90) items.push({ id: 'mobile-performance', category: 'performance', severity: speed.performance < 50 ? 'high' : speed.performance < 70 ? 'medium' : 'low', title: `Mobile performance score is ${speed.performance}/100`, url: pages[0]?.url, what: `Lighthouse measured ${speed.performance}/100 for mobile performance.`, impact: 'A lower mobile score can indicate slower loading or responsiveness, especially on constrained devices and networks.', recommendation: 'Start with the failing Lighthouse audits listed below. Common high-impact actions include resizing/compressing images, serving modern formats, reducing unused JavaScript, and removing render-blocking resources.', source: 'Google PageSpeed Insights / Lighthouse' });
  for (const [index, audit] of speed.findings.entries()) {
    const category = classifyAudit(audit);
    items.push({ id: `lighthouse-${audit.id}-${index}`, category, severity: auditSeverity(audit, category), title: audit.title, url: pages[0]?.url, what: `${audit.description}${audit.displayValue ? ` Current measurement: ${audit.displayValue}.` : ''}`, impact: `Lighthouse rated this audit ${Math.round((audit.score ?? 0) * 100)}/100. Review it alongside field data and business impact before making changes.`, recommendation: `Open the audit “${audit.title}” in PageSpeed Insights for element-level evidence and the recommended fix. Test changes before deploying to production.`, source: 'Google PageSpeed Insights / Lighthouse' });
  }
  return items;
}

function buildFallbackRecommendations(uptimeOk: boolean | null, linkIssues: LinkIssue[], seoPages: PageSeo[], speed: SpeedMetrics) {
  const allSeo = seoPages.flatMap(page => page.issues.map(issue => ({ page, issue })));
  const list: string[] = [];
  if (uptimeOk === false) list.push('Review the unsuccessful homepage HTTP response and verify hosting, DNS, TLS, and server logs.');
  if (uptimeOk === null) list.push('Retry the homepage check; a network or scanner error does not confirm that the website is down.');
  if (linkIssues.length) list.push(`Review ${linkIssues.length} internal link request error(s), starting with HTTP 5xx and network failures.`);
  const altPage = allSeo.find(item => item.issue.includes('missing alt text'));
  if (altPage) list.push(`Add descriptive alt text to ${altPage.page.imagesMissingAlt} image(s) on ${new URL(altPage.page.url).pathname || '/'}; use empty alt text for decorative images.`);
  if (allSeo.some(item => item.issue.toLowerCase().includes('title'))) list.push('Review page titles against the exact title findings; make each title unique and relevant.');
  if (allSeo.some(item => item.issue.toLowerCase().includes('description'))) list.push('Review meta descriptions against the exact findings and give each page a clear, unique summary.');
  if (allSeo.some(item => item.issue.includes('H1') || item.issue.includes('canonical'))) list.push('Check the listed H1 heading and canonical URL findings for the affected pages.');
  if (speed.performance !== null && speed.performance < 90) list.push('Prioritize mobile performance using the failed Lighthouse audits below; verify improvements with repeat runs.');
  return list.slice(0, 6);
}

async function getAiRecommendations(siteUrl: string, uptimeOk: boolean | null, linkIssues: LinkIssue[], seoPages: PageSeo[], speed: SpeedMetrics, detailedIssues: IssueDetail[], addActivity: (step: string, message: string, level?: ScanActivity['level']) => void) {
  const fallback = { aiSummary: 'Rule-based checks completed. Add GEMINI_API_KEY to receive AI-written analysis.', recommendations: buildFallbackRecommendations(uptimeOk, linkIssues, seoPages, speed) };
  if (!process.env.GEMINI_API_KEY?.trim()) {
    addActivity('AI analysis', 'GEMINI_API_KEY is not configured; keeping the rule-based summary.', 'warning');
    return fallback;
  }
  const configuredModel = (process.env.GEMINI_MODEL || '').trim().replace(/^models\//i, '');
  const model = configuredModel || 'gemini-3.8-flash';
  addActivity('AI analysis', `Sending a compact report to Gemini (${model}).`);
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const prompt = `You are a cautious website operations assistant. Analyze the monitoring findings and return JSON only with keys aiSummary (string, maximum 80 words) and recommendations (array of 3-6 concise actionable strings). Do not claim anything was fixed, avoid generic advice when a specific issue is provided, and distinguish measured facts from recommendations. Website: ${siteUrl}. Homepage HTTP response status: ${uptimeOk === null ? 'none received; availability is unconfirmed' : uptimeOk ? 'successful' : 'unsuccessful'}. Link issues: ${JSON.stringify(linkIssues.slice(0, 15))}. SEO findings: ${JSON.stringify(seoPages.filter(p => p.issues.length).slice(0, 12).map(p => ({url:p.url,issues:p.issues,missingAltImages:p.missingAltImages.slice(0,5)})))}. Detailed issues: ${JSON.stringify(detailedIssues.slice(0, 20))}. PageSpeed: ${JSON.stringify({performance:speed.performance,accessibility:speed.accessibility,bestPractices:speed.bestPractices,seo:speed.seo,lcpMs:speed.lcpMs,cls:speed.cls,tbtMs:speed.tbtMs,findings:speed.findings.slice(0,8),error:speed.error})}.`;
    const response = await ai.interactions.create({ model, input: prompt });
    const raw = (response as { output_text?: string }).output_text ?? '';
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    const parsed = JSON.parse(cleaned);
    const aiSummary = String(parsed.aiSummary ?? '').slice(0, 900);
    const recommendations = Array.isArray(parsed.recommendations) ? parsed.recommendations.map(String).slice(0, 6) : [];
    addActivity('AI analysis', 'Gemini returned a summary and actionable recommendations.', 'success');
    return { aiSummary: aiSummary || 'Gemini returned no summary. Rule-based findings are available below.', recommendations: recommendations.length ? recommendations : fallback.recommendations };
  } catch (error) {
    const category = geminiErrorCategory(error);
    const message = category === 'key'
      ? 'Gemini rejected the API key. Check that GEMINI_API_KEY is valid and belongs to the intended Google AI Studio project. Rule-based results remain available.'
      : category === 'permission'
        ? `Gemini denied access to ${model}. Check the key’s project access, API permissions, and whether that project can use this model. Rule-based results remain available.`
        : category === 'quota'
          ? 'Gemini quota or rate limit was reached. Check the project’s Gemini API quota and billing limits. Rule-based results remain available.'
          : category === 'model'
            ? `Gemini could not find or use the configured model (${model}). Verify the model ID and project availability in the current Gemini model list. Rule-based results remain available.`
            : 'Gemini request failed. Check Google AI service availability and the configured model. Rule-based results remain available.';
    console.warn(`[Gemini] Request failed (${category}); raw provider details were omitted.`);
    addActivity('AI analysis', message, 'warning');
    return { ...fallback, aiSummary: `${message} Rule-based results are shown.` };
  }
}

export async function runWebsiteScan(onProgress?: ProgressHandler, options: ScanOptions = {}): Promise<ScanResult> {
  const siteUrl = await validatePublicSiteUrl(options.siteUrl?.trim() || getSiteUrl());
  const requestedLimit = Number(options.crawlLimit ?? DEFAULT_MAX_LINKS);
  const crawlLimit = Number.isFinite(requestedLimit) ? Math.min(MAX_ALLOWED_LINKS, Math.max(10, Math.round(requestedLimit))) : DEFAULT_MAX_LINKS;
  const includeSitemap = options.includeSitemap === true;
  const warnings: string[] = [];
  const activities: ScanActivity[] = [];
  const redirects: CrawlRedirect[] = [];
  const addActivity = (step: string, message: string, level: ScanActivity['level'] = 'info', durationMs?: number) => {
    const activity: ScanActivity = { timestamp: new Date().toISOString(), step, message, level, ...(durationMs === undefined ? {} : { durationMs }) };
    activities.push(activity);
    onProgress?.(activity);
    return activity;
  };
  const started = Date.now();
  addActivity('Preparing scan', `Starting read-only monitoring for ${siteUrl}.`);
  let uptime: ScanResult['uptime'] = { ok: false, status: null, responseMs: null };
  let homepageResult: HtmlFetchResult | null = null;
  addActivity('Website availability', 'Requesting the homepage and measuring the HTTP response. Redirects to the same website host will be followed automatically.');
  const homepageStarted = Date.now();
  try {
    homepageResult = await getHtml(siteUrl, siteUrl);
    uptime = { ok: homepageResult.response.status >= 200 && homepageResult.response.status < 400, status: homepageResult.response.status, responseMs: Date.now() - homepageStarted, ...(homepageResult.response.status >= 400 ? { error: `Homepage returned HTTP ${homepageResult.response.status}` } : {}) };
    addActivity('Website availability', `Homepage responded with HTTP ${homepageResult.response.status} in ${uptime.responseMs} ms${homepageResult.finalUrl !== siteUrl ? `; final URL: ${homepageResult.finalUrl}` : ''}.`, uptime.ok ? 'success' : 'error', uptime.responseMs ?? undefined);
    if (homepageResult.redirectNote) {
      addActivity('Redirect handling', homepageResult.redirectNote, 'warning');
    }
  } catch (error) {
    uptime = { ok: false, status: null, responseMs: Date.now() - homepageStarted, error: error instanceof Error ? error.message : 'Website request failed' };
    warnings.push('Homepage could not be fetched. Link and SEO checks may be incomplete.');
    addActivity('Website availability', `Homepage request failed: ${uptime.error}`, 'error', uptime.responseMs ?? undefined);
  }

  const seoPages: PageSeo[] = [];
  const linkIssues: LinkIssue[] = [];
  let linksChecked = 0;
  let sitemapUrlsDiscovered = 0;
  let sitemapSources: string[] = [];
  let sitemapSeeds: string[] = [];
  if (includeSitemap) {
    addActivity('Sitemap discovery', 'Checking robots.txt and common WordPress/SEO sitemap endpoints before crawling.');
    const sitemap = await discoverSitemapUrls(siteUrl, crawlLimit, addActivity);
    sitemapSeeds = sitemap.urls;
    sitemapUrlsDiscovered = sitemap.urls.length;
    sitemapSources = sitemap.sources;
    warnings.push(...sitemap.warnings);
  }
  const initialQueue = [siteUrl, ...sitemapSeeds];
  const queue: string[] = [];
  for (const candidate of initialQueue) {
    const key = normalizeCrawlUrl(candidate);
    if (!queue.some((item) => normalizeCrawlUrl(item) === key) && queue.length < crawlLimit) queue.push(candidate);
  }
  const seen = new Set<string>();
  const visitedFinalUrls = new Set<string>();
  const crawlStarted = Date.now();
  addActivity('Internal link crawl', `Starting same-site crawl. Maximum URLs this run: ${crawlLimit}. Sitemap scan: ${includeSitemap ? `enabled (${sitemapUrlsDiscovered} URL(s) discovered)` : 'disabled'}. Following same-site redirects with an 8-hop limit.`);

  while (queue.length && linksChecked < crawlLimit) {
    const url = queue.shift()!;
    const requestedKey = normalizeCrawlUrl(url);
    if (seen.has(requestedKey) || visitedFinalUrls.has(requestedKey)) continue;
    seen.add(requestedKey);
    const urlStarted = Date.now();
    addActivity('Inspecting URL', `Requesting ${url} (${linksChecked + 1}/${crawlLimit} URL slots used).`);
    try {
      const result = normalizeCrawlUrl(url) === normalizeCrawlUrl(siteUrl) && homepageResult
        ? homepageResult
        : await getHtml(url, siteUrl);
      linksChecked++;

      for (const hop of result.redirects) {
        if (!redirects.some((item) => item.from === hop.from && item.to === hop.to && item.status === hop.status)) redirects.push(hop);
        addActivity('Redirect followed', `HTTP ${hop.status}: ${hop.from} -> ${hop.to}`, 'info');
      }
      const finalKey = normalizeCrawlUrl(result.finalUrl);
      if (finalKey !== requestedKey) visitedFinalUrls.add(finalKey);
      if (result.redirectNote) {
        const note = `${url}: ${result.redirectNote}`;
        if (!warnings.includes(note)) warnings.push(note);
        addActivity('Redirect handling', note, 'warning', Date.now() - urlStarted);
        if (/redirect loop|safety limit|did not include a Location|invalid redirect target/i.test(result.redirectNote)) {
          linkIssues.push({ url, status: result.response.status, message: result.redirectNote });
        }
      }

      if (result.response.status >= 400) {
        const message = normalizeCrawlUrl(result.finalUrl) !== requestedKey
          ? `Final destination returned HTTP ${result.response.status} after redirecting from ${url}.`
          : `HTTP ${result.response.status}`;
        linkIssues.push({ url: result.finalUrl, status: result.response.status, message });
        addActivity('Inspecting URL', `${result.finalUrl} returned HTTP ${result.response.status}; recorded as an issue.`, 'warning', Date.now() - urlStarted);
      }

      if (result.html) {
        const seo = extractSeo(result.finalUrl, result.response.status, result.html);
        seoPages.push(seo);
        const $ = load(result.html);
        const beforeQueue = queue.length;
        $('a[href]').each((_, el) => {
          if (linksChecked + queue.length >= crawlLimit) return;
          const href = $(el).attr('href')?.trim();
          if (!href || href.startsWith('#') || /^(mailto:|tel:|javascript:|data:)/i.test(href)) return;
          try {
            const absolute = new URL(href, result.finalUrl);
            absolute.hash = '';
            if (['http:', 'https:'].includes(absolute.protocol) && isAllowedCrawlHost(absolute.toString(), siteUrl)) {
              const normalized = normalizeCrawlUrl(absolute.toString());
              if (!seen.has(normalized) && !visitedFinalUrls.has(normalized) && !queue.some((queued) => normalizeCrawlUrl(queued) === normalized)) queue.push(normalized);
            }
          } catch { /* ignore malformed links */ }
        });
        const discovered = Math.max(0, queue.length - beforeQueue);
        addActivity('SEO review', `${result.finalUrl}: title ${seo.title ? `${seo.titleLength} chars` : 'missing'}, meta description ${seo.description ? `${seo.description.length} chars` : 'missing'}, ${seo.h1Count} H1, ${seo.issues.length} SEO finding(s).`, seo.issues.length ? 'warning' : 'success', Date.now() - urlStarted);
        addActivity('Internal link crawl', `${discovered} new same-site URL(s) discovered from ${new URL(result.finalUrl).pathname || '/'}.`);
      } else {
        const contentType = result.response.headers.get('content-type') || 'unknown content type';
        const finalIsRedirect = result.response.status >= 300 && result.response.status < 400;
        const message = finalIsRedirect
          ? `${url} remained at HTTP ${result.response.status}. ${result.redirectNote || 'The redirect target could not be followed.'}`
          : `${result.finalUrl} returned HTTP ${result.response.status} with ${contentType}; only HTML pages can be inspected for SEO.`;
        addActivity('Inspecting URL', message, result.response.status >= 400 || finalIsRedirect ? 'warning' : 'info', Date.now() - urlStarted);
      }
    } catch (error) {
      linksChecked++;
      const rawMessage = error instanceof Error ? error.message : 'Request failed';
      const timedOut = isTimeoutError(error);
      const message = timedOut
        ? `Request timed out after ${Math.round(FETCH_TIMEOUT_MS / 1000)} seconds. This does not prove the page is broken; retry the scan to verify whether the destination is slow or temporarily unreachable.`
        : rawMessage;
      linkIssues.push({ url, status: null, message });
      addActivity('Inspecting URL', `${url} could not be checked: ${message}`, timedOut ? 'warning' : 'error', Date.now() - urlStarted);
    }
  }
  if (queue.length) {
    warnings.push(`Crawl limit reached (${crawlLimit} URLs). Increase the crawl limit in the dashboard if you need deeper coverage.`);
    addActivity('Internal link crawl', `Stopped at the configured limit of ${crawlLimit} URL requests; ${queue.length} URL(s) remain unvisited.`, 'warning', Date.now() - crawlStarted);
  } else {
    addActivity('Internal link crawl', `Crawl completed: ${linksChecked} URL request(s), ${redirects.length} redirect hop(s), and ${linkIssues.length} link/request error(s) found.`, linkIssues.length ? 'warning' : 'success', Date.now() - crawlStarted);
  }

  addActivity('Google PageSpeed Insights', `Starting mobile Lighthouse audit. First attempt timeout: ${Math.round(configuredPageSpeedTimeout() / 1000)} seconds; one shorter retry is attempted if the request times out.`);
  const speedStarted = Date.now();
  const speed = await checkSpeed(siteUrl, (message) => addActivity('Google PageSpeed Insights', message, 'warning'));
  if (speed.error) {
    warnings.push(`PageSpeed check unavailable: ${speed.error}`);
    addActivity('Google PageSpeed Insights', `Audit unavailable: ${speed.error}`, 'warning', Date.now() - speedStarted);
  } else {
    addActivity('Google PageSpeed Insights', `Mobile scores - Performance ${speed.performance}, Accessibility ${speed.accessibility}, Best practices ${speed.bestPractices}, SEO ${speed.seo}. Found ${speed.findings.length} failing audit(s) to review.`, 'success', Date.now() - speedStarted);
  }

  const detailedIssues = buildIssueDetails(uptime, linkIssues, seoPages, speed);
  addActivity('Issue analysis', `Compiled ${detailedIssues.length} detailed finding(s) across availability, links, SEO, accessibility, performance, and best practices.`, detailedIssues.length ? 'warning' : 'success');
  addActivity('AI analysis', 'Preparing AI summary and recommendations from verified monitoring results.');
  const confirmedAvailable = uptime.status === null ? null : uptime.ok;
  const ai = await getAiRecommendations(siteUrl, confirmedAvailable, linkIssues, seoPages, speed, detailedIssues, addActivity);
  if (ai.aiSummary.startsWith('Rule-based checks') || ai.aiSummary.startsWith('AI analysis was unavailable') || ai.aiSummary.includes('Rule-based results are shown.')) warnings.push('AI analysis was not completed; rule-based recommendations are shown.');
  const confirmedDown = isConfirmedHttpFailure(uptime.status);
  const availabilityUnknown = !isKnownHttpStatus(uptime.status);
  const hasIssues = confirmedDown || availabilityUnknown || detailedIssues.length > 0 || (speed.performance !== null && speed.performance < 90);
  addActivity('Scan complete', `Finished in ${Math.round((Date.now() - started) / 1000)} second(s). ${detailedIssues.length} finding(s) need review.`, hasIssues ? 'warning' : 'success', Date.now() - started);
  return { id: randomUUID(), checkedAt: new Date().toISOString(), siteUrl, overallStatus: confirmedDown ? 'down' : hasIssues ? 'issues' : 'healthy', uptime, pagesChecked: seoPages.length, linksChecked, crawlConfig: { limit: crawlLimit, sitemapEnabled: includeSitemap, sitemapUrlsDiscovered, sitemapSources }, linkIssues, redirects, seoPages, speed, detailedIssues, activities, ...ai, warnings };
}
