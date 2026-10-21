export function normalizeComparisonUrl(value: string): string {
  const input = value.trim();

  try {
    const url = new URL(input);

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return input;
    }

    url.hostname = url.hostname.toLowerCase();

    // Trailing slashes normalize karein.
    const path = url.pathname.replace(/\/+$/, '');

    // Protocol, hostname, path aur query compare honge.
    // Fragment (#section) comparison mein ignore hoga.
    return `${url.origin}${path}${url.search}`;
  } catch {
    return input;
  }
}

export function normalizeSiteHost(value: string) {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return value.toLowerCase();
  }
}

export function isSameSite(first: string, second: string) {
  return normalizeSiteHost(first) === normalizeSiteHost(second);
}