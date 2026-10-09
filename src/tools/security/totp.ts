/**
 * TOTP / HOTP two-factor codes (RFC 6238 / RFC 4226), computed with Web Crypto.
 * The secret never leaves the browser. Pure async functions, unit-tested
 * against the RFC 6238 test vectors.
 */

export type Algo = 'SHA-1' | 'SHA-256' | 'SHA-512';

/** Decode an RFC 4648 Base32 secret (as apps print it, spaces and padding allowed). */
export function base32Decode(input: string): Uint8Array {
  const clean = input.toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');
  const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error(`“${ch}” is not a valid Base32 character.`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((value >>> bits) & 0xff);
    }
  }
  return new Uint8Array(out);
}

/** HOTP for a specific counter. */
export async function hotp(secret: Uint8Array, counter: number, digits = 6, algorithm: Algo = 'SHA-1'): Promise<string> {
  const msg = new Uint8Array(8);
  const view = new DataView(msg.buffer);
  // 64-bit big-endian counter (safe for counters below 2^53).
  view.setUint32(0, Math.floor(counter / 2 ** 32));
  view.setUint32(4, counter >>> 0);
  const key = await crypto.subtle.importKey('raw', secret as BufferSource, { name: 'HMAC', hash: algorithm }, false, ['sign']);
  const hmac = new Uint8Array(await crypto.subtle.sign('HMAC', key, msg as BufferSource));
  const offset = hmac[hmac.length - 1] & 0x0f;
  const bin = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(bin % 10 ** digits).padStart(digits, '0');
}

export interface TotpOptions {
  digits?: number;
  period?: number;
  algorithm?: Algo;
}

export async function totp(secret: Uint8Array, atMs = Date.now(), { digits = 6, period = 30, algorithm = 'SHA-1' }: TotpOptions = {}): Promise<string> {
  return hotp(secret, Math.floor(atMs / 1000 / period), digits, algorithm);
}

/** Seconds left in the current step. */
export const secondsRemaining = (atMs = Date.now(), period = 30) => period - (Math.floor(atMs / 1000) % period);

/** Parse an otpauth:// URI (from a QR code) into a secret and options. */
export function parseOtpauth(uri: string): { secret: Uint8Array; label: string; issuer?: string; options: TotpOptions } | null {
  const m = /^otpauth:\/\/totp\/([^?]*)\?(.*)$/i.exec(uri.trim());
  if (!m) return null;
  const params = new URLSearchParams(m[2]);
  const secretB32 = params.get('secret');
  if (!secretB32) return null;
  const algoRaw = params.get('algorithm')?.toUpperCase();
  const algorithm: Algo = algoRaw === 'SHA256' ? 'SHA-256' : algoRaw === 'SHA512' ? 'SHA-512' : 'SHA-1';
  return {
    secret: base32Decode(secretB32),
    label: decodeURIComponent(m[1]),
    issuer: params.get('issuer') ?? undefined,
    options: { digits: Number(params.get('digits')) || 6, period: Number(params.get('period')) || 30, algorithm },
  };
}
