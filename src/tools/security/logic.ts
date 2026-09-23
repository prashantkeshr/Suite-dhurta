/** Cryptographically secure generators. All randomness comes from crypto.getRandomValues. */

/** Uniform random integer in [0, max) without modulo bias. */
export function randomInt(max: number): number {
  if (!Number.isInteger(max) || max <= 0 || max > 2 ** 32) throw new RangeError('max must be an integer in 1..2^32');
  const limit = Math.floor(2 ** 32 / max) * max;
  const buf = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    if (buf[0] < limit) return buf[0] % max;
  }
}

export const CHARSETS = {
  lower: 'abcdefghijklmnopqrstuvwxyz',
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  digits: '0123456789',
  symbols: '!@#$%^&*()-_=+[]{};:,.<>/?~',
};
const AMBIGUOUS = /[Il1O0o|`'"]/g;

export interface PasswordOptions {
  length: number;
  lower: boolean;
  upper: boolean;
  digits: boolean;
  symbols: boolean;
  excludeAmbiguous: boolean;
}

export function passwordAlphabet(o: PasswordOptions): string[] {
  const sets = (['lower', 'upper', 'digits', 'symbols'] as const).filter((k) => o[k]).map((k) => (o.excludeAmbiguous ? CHARSETS[k].replace(AMBIGUOUS, '') : CHARSETS[k]));
  return sets;
}

/** Generate a password containing at least one character from every selected set. */
export function generatePassword(o: PasswordOptions): string {
  const sets = passwordAlphabet(o);
  if (sets.length === 0) throw new Error('Select at least one character type.');
  const length = Math.max(sets.length, Math.min(512, Math.floor(o.length)));
  const all = sets.join('');
  const chars = sets.map((s) => s[randomInt(s.length)]);
  while (chars.length < length) chars.push(all[randomInt(all.length)]);
  // Fisher–Yates shuffle so the guaranteed characters are not always first.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

/** Entropy in bits for a random string of `length` over an alphabet of `size`. */
export const entropyBits = (length: number, size: number) => (size > 1 ? length * Math.log2(size) : 0);

export function strengthLabel(bits: number): { label: string; tone: 'error' | 'warning' | 'success' } {
  if (bits < 50) return { label: 'Weak', tone: 'error' };
  if (bits < 80) return { label: 'Fair', tone: 'warning' };
  if (bits < 110) return { label: 'Strong', tone: 'success' };
  return { label: 'Very strong', tone: 'success' };
}

export function uuidV4(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function randomToken(bytes: number, format: 'hex' | 'base64' | 'base64url'): string {
  const b = crypto.getRandomValues(new Uint8Array(Math.max(1, Math.min(1024, bytes))));
  if (format === 'hex') return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  const b64 = btoa(String.fromCharCode(...b));
  return format === 'base64' ? b64 : b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export type HashAlgo = 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512';

export async function digestHex(algo: HashAlgo, data: BufferSource): Promise<string> {
  const buf = await crypto.subtle.digest(algo, data);
  return Array.from(new Uint8Array(buf), (x) => x.toString(16).padStart(2, '0')).join('');
}
