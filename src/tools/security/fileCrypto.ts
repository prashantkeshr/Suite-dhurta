/**
 * Encrypt and decrypt a file with a password, in the browser.
 *
 * AES-256-GCM with a key derived from the password by PBKDF2-SHA-256
 * (600,000 iterations, matching current OWASP guidance). The original file
 * name and type are encrypted too, so the container leaks nothing but its size.
 *
 * Container:  "DSENC1" | salt(16) | iv(12) | AES-GCM( u16 headerLen | header JSON | file bytes )
 *
 * Pure (Web Crypto only), so the round-trip is unit-tested in Node.
 */

const MAGIC = new Uint8Array([0x44, 0x53, 0x45, 0x4e, 0x43, 0x31]); // "DSENC1"
const ITERATIONS = 600_000;

export class CryptoError extends Error {
  constructor(
    message: string,
    readonly reason: 'format' | 'password' | 'empty',
  ) {
    super(message);
  }
}

export interface DecryptedFile {
  name: string;
  type: string;
  bytes: Uint8Array;
}

async function deriveKey(password: string, salt: Uint8Array, usage: KeyUsage[]): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: salt as BufferSource, iterations: ITERATIONS, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, usage);
}

export async function encryptFile(file: DecryptedFile, password: string, onProgress?: (p: number) => void): Promise<Blob> {
  if (!password) throw new CryptoError('A password is required.', 'password');
  if (!file.bytes.length) throw new CryptoError('The file is empty.', 'empty');
  onProgress?.(0.1);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, ['encrypt']);
  onProgress?.(0.5);
  const header = new TextEncoder().encode(JSON.stringify({ n: file.name.slice(0, 255), t: file.type.slice(0, 120) }));
  const plain = new Uint8Array(2 + header.length + file.bytes.length);
  new DataView(plain.buffer).setUint16(0, header.length);
  plain.set(header, 2);
  plain.set(file.bytes, 2 + header.length);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain));
  onProgress?.(0.95);
  const out = new Uint8Array(MAGIC.length + 16 + 12 + cipher.length);
  out.set(MAGIC, 0);
  out.set(salt, MAGIC.length);
  out.set(iv, MAGIC.length + 16);
  out.set(cipher, MAGIC.length + 28);
  onProgress?.(1);
  return new Blob([out as BlobPart], { type: 'application/octet-stream' });
}

export const isEncryptedContainer = (bytes: Uint8Array) => bytes.length >= MAGIC.length && MAGIC.every((b, i) => bytes[i] === b);

export async function decryptFile(bytes: Uint8Array, password: string, onProgress?: (p: number) => void): Promise<DecryptedFile> {
  if (!isEncryptedContainer(bytes)) throw new CryptoError('This is not a Dhurta Suite encrypted file (.dsenc).', 'format');
  if (bytes.length < MAGIC.length + 28 + 16) throw new CryptoError('This encrypted file is incomplete or damaged.', 'format');
  onProgress?.(0.1);
  const salt = bytes.slice(MAGIC.length, MAGIC.length + 16);
  const iv = bytes.slice(MAGIC.length + 16, MAGIC.length + 28);
  const cipher = bytes.subarray(MAGIC.length + 28);
  const key = await deriveKey(password, salt, ['decrypt']);
  onProgress?.(0.5);
  let plain: Uint8Array;
  try {
    plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher as unknown as BufferSource));
  } catch {
    // AES-GCM authentication fails identically for a wrong password or tampering.
    throw new CryptoError('Wrong password, or the file was changed or corrupted.', 'password');
  }
  onProgress?.(0.95);
  const headerLen = new DataView(plain.buffer, plain.byteOffset, plain.byteLength).getUint16(0);
  let header: { n?: string; t?: string } = {};
  try {
    header = JSON.parse(new TextDecoder().decode(plain.subarray(2, 2 + headerLen)));
  } catch {
    /* fall back to generic name */
  }
  onProgress?.(1);
  return { name: header.n || 'decrypted-file', type: header.t || 'application/octet-stream', bytes: plain.slice(2 + headerLen) };
}
