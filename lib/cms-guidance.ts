import type { IssueDetail } from '@/types';

/** Practical WordPress / Elementor steps tailored to the type of monitoring finding. */
export function getCmsGuidance(issue: Pick<IssueDetail, 'category' | 'title' | 'what' | 'recommendation'>): string[] {
  const text = `${issue.title} ${issue.what} ${issue.recommendation}`.toLowerCase();
  if (/alt text|image-alt|image alt/.test(text)) return [
    'WordPress: open Media → Library, select the affected image, and add accurate Alt Text. Use an empty alt value only for decorative images.',
    'Elementor: edit the page, select the Image widget, confirm the correct image is selected, and review its alt text in the media details. Update and clear page/cache plugin caches after publishing.'
  ];
  if (/title length|document title|page title|missing title/.test(text)) return [
    'WordPress: edit the page and review the SEO title in Yoast SEO, Rank Math, or your active SEO plugin. Keep it unique and representative of the page.',
    'Elementor: confirm the page heading and SEO title are not being confused; the browser/search title is normally managed by WordPress and the SEO plugin, not the Heading widget.'
  ];
  if (/meta description/.test(text)) return [
    'WordPress: edit the page and enter a unique meta description in the active SEO plugin (for example, Yoast SEO or Rank Math).',
    'Elementor: edit the page content so it matches the description; changing visible text alone does not necessarily update the meta description.'
  ];
  if (/h1|heading order|heading hierarchy/.test(text)) return [
    'Elementor: edit the page, select each Heading widget, and set its HTML Tag to H1/H2/H3 according to the content hierarchy. Keep one clear primary page heading where practical.',
    'WordPress: check the theme/page title output as well, so the theme and Elementor template do not unintentionally produce duplicate primary headings.'
  ];
  if (/canonical|robots|indexing|structured data|crawlable/.test(text)) return [
    'WordPress: review the page’s SEO plugin settings for canonical URL, index/noindex, sitemap and structured-data settings. Do not change canonical URLs without confirming the preferred public URL.',
    'Elementor: ensure important navigation uses real links with valid destinations; do not use clickable-looking text or buttons without a valid link target.'
  ];
  if (/broken link|internal url|request failed|http \d{3}|redirect/.test(text) || issue.category === 'links') return [
    'WordPress: open the affected page and locate the link/button destination. Correct the URL or restore the target page before updating the source link.',
    'Elementor: select the Button, Image, Icon or Text Editor widget and inspect its Link field. Prefer the final canonical destination to avoid unnecessary redirect chains.'
  ];
  if (/button|discernible name|link name|aria-|screen reader|accessible name|accessibility/.test(text) || issue.category === 'accessibility') return [
    'Elementor: give icon-only buttons and links a clear visible label where possible; check button text, link destinations, widget labels and keyboard focus.',
    'WordPress: verify the active theme and plugins do not generate empty links/buttons. Re-test with keyboard navigation and an accessibility audit after changes.'
  ];
  if (/performance|render-blocking|cache lifetime|image delivery|main-thread|font display|unused javascript|css/.test(text) || issue.category === 'performance') return [
    'WordPress: optimize large images, use appropriately sized WebP/AVIF where supported, review caching/CDN settings, and remove unused plugins/scripts only after testing.',
    'Elementor: inspect large hero/background images, motion effects and unnecessary widgets. Test CSS/JS optimization and cache changes on staging, then re-run PageSpeed to verify impact.'
  ];
  if (/https|mixed content|browser errors|console|deprecated|security|best practices/.test(text) || issue.category === 'best-practices') return [
    'WordPress: update the theme and plugins in a staging environment first; inspect browser console errors and server/CDN logs before changing production.',
    'Elementor: review custom HTML/CSS/JS widgets and third-party embeds that may be producing console or browser-policy errors.'
  ];
  if (issue.category === 'availability') return [
    'WordPress: check hosting/PHP/server logs, DNS, TLS certificates, firewall and CDN status. Confirm the site works from an independent network.',
    'Elementor: this is usually not an Elementor editor setting; first restore site availability, then check template/plugin conflicts if only certain pages fail.'
  ];
  return [
    'WordPress: open the affected page in the dashboard and compare the finding with the page’s SEO, media, link and plugin settings before making changes.',
    'Elementor: inspect the relevant widget/template, make one small change at a time, clear caches and re-run the scan. Keep a backup and test significant changes on staging.'
  ];
}
