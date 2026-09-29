/**
 * QR payload builders (generator) and parser (reader). Pure functions so the
 * formats can be unit-tested; they follow the de-facto formats that phone
 * cameras and UPI apps understand.
 */

export type QrKind = 'url' | 'text' | 'wifi' | 'upi' | 'vcard' | 'email' | 'sms' | 'phone';

/** Wi-Fi fields escape \ ; , : and " with a backslash (ZXing "WIFI:" format). */
const wifiEsc = (s: string) => s.replace(/([\\;,:"])/g, '\\$1');

export interface WifiInput {
  ssid: string;
  password: string;
  security: 'WPA' | 'WEP' | 'nopass';
  hidden: boolean;
}

export function wifiPayload({ ssid, password, security, hidden }: WifiInput): string {
  const parts = [`T:${security}`, `S:${wifiEsc(ssid)}`];
  if (security !== 'nopass') parts.push(`P:${wifiEsc(password)}`);
  if (hidden) parts.push('H:true');
  return `WIFI:${parts.join(';')};;`;
}

export interface UpiInput {
  vpa: string;
  name: string;
  amount: string;
  note: string;
}

export const isValidVpa = (vpa: string) => /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9.-]{1,64}$/.test(vpa.trim());

/** UPI deep link (NPCI linking specification): upi://pay?pa=…&pn=…&am=…&cu=INR&tn=… */
export function upiPayload({ vpa, name, amount, note }: UpiInput): string {
  const q: string[] = [`pa=${encodeURIComponent(vpa.trim())}`];
  if (name.trim()) q.push(`pn=${encodeURIComponent(name.trim())}`);
  const am = Number(amount);
  if (amount.trim() && am > 0) q.push(`am=${am.toFixed(2)}`);
  q.push('cu=INR');
  if (note.trim()) q.push(`tn=${encodeURIComponent(note.trim())}`);
  return `upi://pay?${q.join('&')}`;
}

export interface VcardInput {
  firstName: string;
  lastName: string;
  org: string;
  title: string;
  phone: string;
  email: string;
  website: string;
  address: string;
}

const vEsc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');

export function vcardPayload(v: VcardInput): string {
  const fn = [v.firstName, v.lastName].map((s) => s.trim()).filter(Boolean).join(' ') || v.org.trim();
  const lines = ['BEGIN:VCARD', 'VERSION:3.0', `N:${vEsc(v.lastName.trim())};${vEsc(v.firstName.trim())};;;`, `FN:${vEsc(fn)}`];
  if (v.org.trim()) lines.push(`ORG:${vEsc(v.org.trim())}`);
  if (v.title.trim()) lines.push(`TITLE:${vEsc(v.title.trim())}`);
  if (v.phone.trim()) lines.push(`TEL;TYPE=CELL:${v.phone.replace(/[^\d+]/g, '')}`);
  if (v.email.trim()) lines.push(`EMAIL:${v.email.trim()}`);
  if (v.website.trim()) lines.push(`URL:${normalizeUrl(v.website)}`);
  if (v.address.trim()) lines.push(`ADR;TYPE=WORK:;;${vEsc(v.address.trim())};;;;`);
  lines.push('END:VCARD');
  return lines.join('\r\n');
}

export function emailPayload(to: string, subject: string, body: string): string {
  const q = [subject && `subject=${encodeURIComponent(subject)}`, body && `body=${encodeURIComponent(body)}`].filter(Boolean);
  return `mailto:${to.trim()}${q.length ? `?${q.join('&')}` : ''}`;
}

export const smsPayload = (phone: string, message: string) => `SMSTO:${phone.replace(/[^\d+]/g, '')}:${message}`;
export const phonePayload = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`;

/** Add https:// when the user typed a bare domain. */
export function normalizeUrl(s: string): string {
  const t = s.trim();
  if (!t) return '';
  return /^[a-z][a-z0-9+.-]*:/i.test(t) ? t : `https://${t}`;
}

/* ---------- Reader: describe what a scanned code contains ---------- */

export interface ParsedQr {
  kind: QrKind;
  label: string;
  fields: [string, string][];
  /** A link the user can choose to open (never opened automatically). */
  href?: string;
  warnings: string[];
}

const SHORTENERS = ['bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'is.gd', 'cutt.ly', 'rb.gy', 'shorturl.at', 'ow.ly', 'buff.ly', 'tiny.cc', 'rebrand.ly', 's.id', 'v.gd'];

function unescapeWifi(s: string) {
  return s.replace(/\\(.)/g, '$1');
}

/** Split "T:WPA;S:name;P:pa\;ss;;" on unescaped semicolons. */
function wifiFields(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  let cur = '';
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === '\\' && i + 1 < body.length) {
      cur += ch + body[++i];
    } else if (ch === ';') {
      const k = cur.indexOf(':');
      if (k > 0) out[cur.slice(0, k).toUpperCase()] = unescapeWifi(cur.slice(k + 1));
      cur = '';
    } else cur += ch;
  }
  return out;
}

export function urlWarnings(raw: string): string[] {
  const w: string[] = [];
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return ['This link is not a valid web address.'];
  }
  const host = u.hostname.toLowerCase();
  if (u.protocol === 'http:') w.push('The link is not encrypted (http, not https).');
  if (u.protocol !== 'http:' && u.protocol !== 'https:') w.push(`The link uses the “${u.protocol}” scheme, which may open an app rather than a web page.`);
  if (host.split('.').some((p) => p.startsWith('xn--'))) w.push('The domain uses international characters (punycode) that can imitate a familiar name. Check it carefully.');
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith('[')) w.push('The link points to a bare IP address instead of a domain name.');
  if (u.username || u.password) w.push('The link contains a user name before “@”, a trick used to disguise the real destination.');
  if (SHORTENERS.includes(host)) w.push('This is a link shortener — the final destination is hidden until you open it.');
  return w;
}

export function parseQr(text: string): ParsedQr {
  const t = text.trim();
  if (/^WIFI:/i.test(t)) {
    const f = wifiFields(t.slice(5));
    const sec = f.T || 'nopass';
    return {
      kind: 'wifi',
      label: 'Wi-Fi network',
      fields: [
        ['Network (SSID)', f.S ?? ''],
        ['Security', sec === 'nopass' ? 'None (open network)' : sec],
        ...(f.P ? ([['Password', f.P]] as [string, string][]) : []),
        ...(f.H === 'true' ? ([['Hidden network', 'Yes']] as [string, string][]) : []),
      ],
      warnings: sec === 'nopass' ? ['This is an open network: traffic on it is not encrypted.'] : [],
    };
  }
  if (/^upi:\/\/pay/i.test(t)) {
    const q = new URLSearchParams(t.slice(t.indexOf('?') + 1));
    const fields: [string, string][] = [
      ['Pay to (UPI ID)', q.get('pa') ?? ''],
      ['Name', q.get('pn') ?? ''],
      ['Amount', q.get('am') ? `₹ ${q.get('am')}` : 'Entered by you'],
      ['Note', q.get('tn') ?? ''],
    ].filter(([, v]) => v) as [string, string][];
    const warnings = isValidVpa(q.get('pa') ?? '') ? [] : ['The UPI ID looks malformed.'];
    warnings.push('Check the name shown in your UPI app before paying. Scanning a code to receive money never requires your PIN.');
    return { kind: 'upi', label: 'UPI payment request', fields, href: t, warnings };
  }
  if (/^BEGIN:VCARD/i.test(t)) {
    const fields: [string, string][] = [];
    const map: Record<string, string> = { FN: 'Name', ORG: 'Organisation', TITLE: 'Title', TEL: 'Phone', EMAIL: 'Email', URL: 'Website', ADR: 'Address' };
    for (const line of t.split(/\r?\n/)) {
      const m = /^([A-Z]+)(?:;[^:]*)?:(.*)$/i.exec(line);
      if (m && map[m[1].toUpperCase()]) fields.push([map[m[1].toUpperCase()], m[2].replace(/\\([,;\\])/g, '$1').replace(/\\n/gi, ' ').replace(/;+/g, ' ').trim()]);
    }
    return { kind: 'vcard', label: 'Contact card', fields, warnings: [] };
  }
  if (/^mailto:/i.test(t)) {
    const [addr, qs] = t.slice(7).split('?');
    const q = new URLSearchParams(qs ?? '');
    const fields: [string, string][] = [['To', decodeURIComponent(addr)]];
    if (q.get('subject')) fields.push(['Subject', q.get('subject')!]);
    if (q.get('body')) fields.push(['Message', q.get('body')!]);
    return { kind: 'email', label: 'Email', fields, href: t, warnings: [] };
  }
  if (/^(SMSTO|sms):/i.test(t)) {
    const rest = t.replace(/^(SMSTO|sms):/i, '');
    const [num, ...msg] = rest.split(/[:?]/);
    return { kind: 'sms', label: 'Text message', fields: [['To', num], ['Message', msg.join(':').replace(/^body=/, '')]].filter(([, v]) => v) as [string, string][], warnings: ['Sending a text to an unknown number may cost money or subscribe you to a service.'] };
  }
  if (/^tel:/i.test(t)) return { kind: 'phone', label: 'Phone number', fields: [['Number', t.slice(4)]], href: t, warnings: [] };
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(t) || /^www\./i.test(t)) {
    const href = normalizeUrl(t);
    let host = '';
    try {
      host = new URL(href).hostname;
    } catch {
      /* reported by urlWarnings */
    }
    return { kind: 'url', label: 'Web link', fields: [['Domain', host], ['Full link', href]], href, warnings: urlWarnings(href) };
  }
  return { kind: 'text', label: 'Text', fields: [['Text', t]], warnings: [] };
}
