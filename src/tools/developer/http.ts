/** HTTP header parsing and a light user-agent parser. */

export interface ParsedHeaders {
  startLine?: { kind: 'request' | 'response'; text: string; method?: string; path?: string; status?: number; reason?: string; version?: string };
  headers: { name: string; value: string }[];
  invalid: string[];
}

export function parseHeaders(raw: string): ParsedHeaders {
  const lines = raw.replace(/\r\n?/g, '\n').split('\n');
  const out: ParsedHeaders = { headers: [], invalid: [] };
  let i = 0;
  while (i < lines.length && !lines[i].trim()) i++;
  const first = lines[i]?.trim() ?? '';
  const res = first.match(/^(HTTP\/[\d.]+)\s+(\d{3})\s*(.*)$/i);
  const req = first.match(/^([A-Z]+)\s+(\S+)\s+(HTTP\/[\d.]+)$/);
  if (res) {
    out.startLine = { kind: 'response', text: first, version: res[1], status: Number(res[2]), reason: res[3] };
    i++;
  } else if (req) {
    out.startLine = { kind: 'request', text: first, method: req[1], path: req[2], version: req[3] };
    i++;
  }
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    // Obsolete line folding: continuation lines start with whitespace.
    if (/^[ \t]/.test(line) && out.headers.length) {
      out.headers[out.headers.length - 1].value += ' ' + line.trim();
      continue;
    }
    const m = line.match(/^([!#$%&'*+\-.^_`|~0-9A-Za-z]+)\s*:\s*(.*)$/);
    if (m) out.headers.push({ name: m[1], value: m[2].trim() });
    else out.invalid.push(line);
  }
  return out;
}

/** Canonical capitalisation: content-type → Content-Type. */
export const canonicalName = (n: string) => n.toLowerCase().replace(/(^|-)([a-z])/g, (_, d: string, c: string) => d + c.toUpperCase());

export const SECURITY_HEADERS: { name: string; purpose: string }[] = [
  { name: 'Strict-Transport-Security', purpose: 'Forces HTTPS on future visits' },
  { name: 'Content-Security-Policy', purpose: 'Restricts where scripts, styles and other resources can load from' },
  { name: 'X-Content-Type-Options', purpose: 'Stops browsers guessing (sniffing) content types' },
  { name: 'Referrer-Policy', purpose: 'Controls how much referrer information is sent' },
  { name: 'Permissions-Policy', purpose: 'Limits access to powerful browser features' },
  { name: 'X-Frame-Options', purpose: 'Prevents the page being framed (clickjacking); superseded by CSP frame-ancestors' },
];

export interface UaInfo {
  browser?: string;
  browserVersion?: string;
  engine?: string;
  os?: string;
  osVersion?: string;
  device: 'mobile' | 'tablet' | 'desktop' | 'bot' | 'unknown';
}

/** Best-effort user-agent parsing. User-agent strings can be spoofed and are frozen in modern browsers. */
export function parseUserAgent(ua: string): UaInfo {
  const s = ua.trim();
  const info: UaInfo = { device: 'unknown' };
  if (!s) return info;
  const pick = (re: RegExp) => s.match(re);
  if (/bot|crawler|spider|crawling|slurp|facebookexternalhit|bingpreview/i.test(s)) info.device = 'bot';

  const browsers: [string, RegExp][] = [
    ['Edge', /Edg(?:e|A|iOS)?\/([\d.]+)/],
    ['Opera', /(?:OPR|Opera)\/([\d.]+)/],
    ['Samsung Internet', /SamsungBrowser\/([\d.]+)/],
    ['UC Browser', /UCBrowser\/([\d.]+)/],
    ['Firefox', /(?:Firefox|FxiOS)\/([\d.]+)/],
    ['Chrome', /(?:Chrome|CriOS)\/([\d.]+)/],
    ['Safari', /Version\/([\d.]+).*Safari\//],
  ];
  for (const [name, re] of browsers) {
    const m = pick(re);
    if (m) {
      info.browser = name;
      info.browserVersion = m[1];
      break;
    }
  }
  if (/Gecko\/\d/.test(s) && /Firefox/.test(s)) info.engine = 'Gecko';
  else if (/AppleWebKit/.test(s) && /(Chrome|CriOS|Edg|OPR|SamsungBrowser)/.test(s) && !/iPhone|iPad|iPod/.test(s)) info.engine = 'Blink';
  else if (/AppleWebKit/.test(s)) info.engine = 'WebKit';
  else if (/Trident/.test(s)) info.engine = 'Trident';

  let m: RegExpMatchArray | null;
  if ((m = pick(/Windows NT ([\d.]+)/))) {
    info.os = 'Windows';
    info.osVersion = ({ '10.0': '10 or 11', '6.3': '8.1', '6.2': '8', '6.1': '7' } as Record<string, string>)[m[1]] ?? m[1];
  } else if ((m = pick(/Android ([\d.]+)/))) {
    info.os = 'Android';
    info.osVersion = m[1];
  } else if ((m = pick(/(?:iPhone|CPU) OS ([\d_]+)/))) {
    info.os = /iPad/.test(s) ? 'iPadOS' : 'iOS';
    info.osVersion = m[1].replace(/_/g, '.');
  } else if ((m = pick(/Mac OS X ([\d_.]+)/))) {
    info.os = 'macOS';
    info.osVersion = m[1].replace(/_/g, '.');
  } else if (/CrOS/.test(s)) info.os = 'ChromeOS';
  else if (/Linux/.test(s)) info.os = 'Linux';

  if (info.device !== 'bot') {
    if (/iPad|Tablet|(Android(?!.*Mobile))/i.test(s)) info.device = 'tablet';
    else if (/Mobi|iPhone|iPod|Android.*Mobile/i.test(s)) info.device = 'mobile';
    else if (info.os) info.device = 'desktop';
  }
  return info;
}
