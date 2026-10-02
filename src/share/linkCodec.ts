/**
 * Files inside links. A file (name, type, bytes) is packed into the URL
 * fragment — the part after "#", which browsers never send to any server — so
 * a link can carry a small file from one person to another with no upload.
 *
 *   payload = "1" + mode + "." + base64url(data)
 *   mode  r = raw, z = deflate-compressed, e = encrypted
 *   container = u32 fileLength | u16 headerLength | header JSON | file bytes
 *   encrypted data = salt(16) | iv(12) | AES-GCM-256(1-byte compressed flag + container)
 *   key = PBKDF2-SHA-256(password, salt, 250 000 iterations)
 *
 * Pure (Web Crypto + fflate), so it is unit-tested in Node.
 */
import { deflateSync, inflateSync, strToU8, strFromU8 } from 'fflate';

export interface SharedFile {
  name: string;
  type: string;
  bytes: Uint8Array;
}

export class LinkError extends Error {
  constructor(
    message: string,
    readonly reason: 'truncated' | 'invalid' | 'password' | 'wrong-password',
  ) {
    super(message);
  }
}

const ITERATIONS = 250_000;
/** Longer links are refused: several browsers and apps cannot handle them. */
export const MAX_LINK_CHARS = 1_500_000;

/* ---------- base64url ---------- */

const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const LOOKUP = new Int16Array(128).fill(-1);
for (let i = 0; i < ALPHA.length; i++) LOOKUP[ALPHA.charCodeAt(i)] = i;

export function toBase64Url(bytes: Uint8Array): string {
  const parts: string[] = [];
  let chunk = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    chunk += ALPHA[(n >> 18) & 63] + ALPHA[(n >> 12) & 63];
    if (i + 1 < bytes.length) chunk += ALPHA[(n >> 6) & 63];
    if (i + 2 < bytes.length) chunk += ALPHA[n & 63];
    if (chunk.length > 8192) {
      parts.push(chunk);
      chunk = '';
    }
  }
  parts.push(chunk);
  return parts.join('');
}

export function fromBase64Url(s: string): Uint8Array {
  const clean = s.replace(/[=\s]/g, '');
  if (clean.length % 4 === 1) throw new LinkError('This link is incomplete — it may have been cut off when it was sent.', 'truncated');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const v = [0, 1, 2, 3].map((k) => (i + k < clean.length ? LOOKUP[clean.charCodeAt(i + k)] ?? -1 : 0));
    if (v.some((x, k) => i + k < clean.length && x < 0)) throw new LinkError('This link contains characters that do not belong in it.', 'invalid');
    const n = (v[0] << 18) | (v[1] << 12) | (v[2] << 6) | v[3];
    out[o++] = (n >> 16) & 255;
    if (i + 2 < clean.length) out[o++] = (n >> 8) & 255;
    if (i + 3 < clean.length) out[o++] = n & 255;
  }
  return out.subarray(0, o);
}

/* ---------- container ---------- */

function pack(file: SharedFile): Uint8Array {
  const header = strToU8(JSON.stringify({ n: file.name.slice(0, 200), t: file.type.slice(0, 100) }));
  const out = new Uint8Array(6 + header.length + file.bytes.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, file.bytes.length);
  dv.setUint16(4, header.length);
  out.set(header, 6);
  out.set(file.bytes, 6 + header.length);
  return out;
}

function unpack(data: Uint8Array): SharedFile {
  const truncated = () => new LinkError('This link is incomplete — it may have been cut off when it was sent.', 'truncated');
  if (data.length < 6) throw truncated();
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const size = dv.getUint32(0);
  const hlen = dv.getUint16(4);
  if (data.length !== 6 + hlen + size) throw truncated();
  let header: { n?: unknown; t?: unknown };
  try {
    header = JSON.parse(strFromU8(data.subarray(6, 6 + hlen)));
  } catch {
    throw new LinkError('This link is damaged.', 'invalid');
  }
  return { name: String(header.n || 'shared-file'), type: String(header.t || 'application/octet-stream'), bytes: data.slice(6 + hlen) };
}

/* ---------- crypto ---------- */

async function deriveKey(password: string, salt: Uint8Array) {
  const base = await crypto.subtle.importKey('raw', strToU8(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: salt as BufferSource, iterations: ITERATIONS, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

/* ---------- public API ---------- */

export async function encodeFile(file: SharedFile, password?: string): Promise<string> {
  const container = pack(file);
  const deflated = deflateSync(container, { level: 9 });
  const compressed = deflated.length < container.length;
  const body = compressed ? deflated : container;
  if (!password) return `1${compressed ? 'z' : 'r'}.${toBase64Url(body)}`;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = new Uint8Array(1 + body.length);
  plain[0] = compressed ? 1 : 0;
  plain.set(body, 1);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await deriveKey(password, salt), plain));
  const out = new Uint8Array(28 + cipher.length);
  out.set(salt, 0);
  out.set(iv, 16);
  out.set(cipher, 28);
  return `1e.${toBase64Url(out)}`;
}

export const isEncrypted = (payload: string) => payload.startsWith('1e.');

export async function decodeFile(payload: string, password?: string): Promise<SharedFile> {
  const m = /^1([rze])\.(.+)$/s.exec(payload.trim());
  if (!m) throw new LinkError('This is not a Dhurta Suite file link, or it is incomplete.', 'invalid');
  const [, mode, b64] = m;
  const data = fromBase64Url(b64);
  const inflate = (d: Uint8Array) => {
    try {
      return inflateSync(d);
    } catch {
      throw new LinkError('This link is incomplete — it may have been cut off when it was sent.', 'truncated');
    }
  };
  if (mode === 'r') return unpack(data);
  if (mode === 'z') return unpack(inflate(data));
  if (!password) throw new LinkError('This file is protected with a password.', 'password');
  if (data.length < 29) throw new LinkError('This link is incomplete — it may have been cut off when it was sent.', 'truncated');
  let plain: Uint8Array;
  try {
    plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: data.slice(16, 28) }, await deriveKey(password, data.slice(0, 16)), data.slice(28)));
  } catch {
    // AES-GCM authenticates: a wrong password and a damaged link look the same.
    throw new LinkError('Wrong password, or the link was changed or cut off.', 'wrong-password');
  }
  return unpack(plain[0] ? inflate(plain.subarray(1)) : plain.subarray(1));
}

/** Rough link length for a file before encoding (used to guide the user). */
export const estimateLinkChars = (bytes: number, prefixLength = 40) => prefixLength + Math.ceil(((bytes + 64) * 4) / 3);
