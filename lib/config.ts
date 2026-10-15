import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/** Read the default website from the server environment. This is configuration, not a secret. */
export function getSiteUrl(rawValue?: string) {
  const raw = (rawValue ?? process.env.SITE_URL)?.trim();
  if (!raw) throw new Error('SITE_URL is missing. Add a default website URL to .env.local, or enter a website in the dashboard.');

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('Enter a complete website URL such as https://example.com.');
  }

  if (!['https:', 'http:'].includes(url.protocol)) {
    throw new Error('Only HTTP and HTTPS website URLs are supported.');
  }
  if (url.username || url.password) {
    throw new Error('Website URLs must not contain usernames or passwords.');
  }
  if (url.port && !((url.protocol === 'http:' && url.port === '80') || (url.protocol === 'https:' && url.port === '443'))) {
    throw new Error('For safety, only standard HTTP (80) and HTTPS (443) ports are allowed.');
  }
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') || hostname.endsWith('.internal') || hostname.endsWith('.lan') || hostname.endsWith('.test')) {
    throw new Error('Use a public website address, not localhost or an internal/local hostname.');
  }

  url.hash = '';
  return url.toString().replace(/\/$/, '');
}

function isPublicIpv4(address: string) {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b, c] = parts;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && (b === 168 || (b === 0 && (c === 0 || c === 2)) || (b === 88 && c === 99))) return false;
  if (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  return true;
}

function isPublicIp(address: string) {
  const version = isIP(address);
  if (version === 4) return isPublicIpv4(address);
  if (version !== 6) return false;

  const value = address.toLowerCase();
  // Reject loopback, unspecified, private/ULA, link-local, multicast, mapped IPv4,
  // and documentation ranges. Public global unicast addresses normally start with 2 or 3.
  if (value === '::' || value === '::1' || value.startsWith('::ffff:') || value.startsWith('fc') || value.startsWith('fd') || value.startsWith('fe8') || value.startsWith('fe9') || value.startsWith('fea') || value.startsWith('feb') || value.startsWith('ff') || value.startsWith('2001:db8:')) return false;
  return value.startsWith('2') || value.startsWith('3');
}

/**
 * Validate an arbitrary website URL before making server-side requests.
 * DNS is checked as a defense-in-depth SSRF guard; crawling then stays on this site host.
 */
export async function validatePublicSiteUrl(rawValue: string) {
  const cleanUrl = getSiteUrl(rawValue);
  const url = new URL(cleanUrl);
  const inputHost = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const candidates = new Set([inputHost]);
  const rootHost = inputHost.replace(/^www\./, '');
  candidates.add(rootHost.startsWith('www.') ? rootHost.slice(4) : `www.${rootHost}`);

  for (const hostname of candidates) {
    if (isIP(hostname)) {
      if (!isPublicIp(hostname)) throw new Error('Private or reserved IP addresses cannot be scanned. Enter a public website domain.');
      continue;
    }
    let addresses: Array<{ address: string; family: number }>;
    try {
      addresses = await lookup(hostname, { all: true, verbatim: true });
    } catch {
      // The www alias is only required if the entered hostname or redirect actually uses it.
      if (hostname !== inputHost) continue;
      throw new Error(`The hostname “${hostname}” could not be resolved. Check the URL and DNS, then try again.`);
    }
    if (addresses.length && addresses.some((item) => !isPublicIp(item.address))) {
      throw new Error(`The hostname “${hostname}” resolves to a private or reserved IP address and was blocked for safety.`);
    }
  }
  return cleanUrl;
}

export function isSameSiteHost(candidate: string, base: string) {
  try {
    const target = new URL(candidate);
    const origin = new URL(base);
    const rootHost = (host: string) => host.toLowerCase().replace(/^www\./, '');
    const isDefaultPort = (url: URL) => !url.port || (url.protocol === 'http:' && url.port === '80') || (url.protocol === 'https:' && url.port === '443');
    return ['http:', 'https:'].includes(target.protocol) && !target.username && !target.password && rootHost(target.hostname) === rootHost(origin.hostname) && isDefaultPort(target) && isDefaultPort(origin);
  } catch {
    return false;
  }
}
