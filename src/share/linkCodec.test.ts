import { describe, expect, it } from 'vitest';
import { encodeFile, decodeFile, toBase64Url, fromBase64Url, isEncrypted, LinkError } from './linkCodec';

const text = (s: string) => new TextEncoder().encode(s);

describe('file links', () => {
  it('base64url round-trips every length', () => {
    for (let n = 0; n < 40; n++) {
      const b = Uint8Array.from({ length: n }, (_, i) => (i * 37 + n) & 255);
      expect(fromBase64Url(toBase64Url(b))).toEqual(b);
    }
    expect(toBase64Url(new Uint8Array([251, 255]))).toBe('-_8');
  });

  it('round-trips text (compressed) with name and type', async () => {
    const file = { name: 'नोट्स.md', type: 'text/markdown', bytes: text('# Hello\n'.repeat(200)) };
    const link = await encodeFile(file);
    expect(link.startsWith('1z.')).toBe(true);
    expect(link.length).toBeLessThan(200);
    const back = await decodeFile(link);
    expect(back.name).toBe('नोट्स.md');
    expect(back.type).toBe('text/markdown');
    expect(new TextDecoder().decode(back.bytes)).toBe('# Hello\n'.repeat(200));
  });

  it('stores incompressible data raw', async () => {
    const bytes = crypto.getRandomValues(new Uint8Array(3000));
    const link = await encodeFile({ name: 'x.bin', type: '', bytes });
    expect(link.startsWith('1r.')).toBe(true);
    expect((await decodeFile(link)).bytes).toEqual(bytes);
  });

  it('encrypts with a password and rejects a wrong one', async () => {
    const file = { name: 'secret.txt', type: 'text/plain', bytes: text('pin 4321') };
    const link = await encodeFile(file, 'correct horse');
    expect(isEncrypted(link)).toBe(true);
    expect(link).not.toContain(toBase64Url(text('pin 4321')));
    await expect(decodeFile(link)).rejects.toMatchObject({ reason: 'password' });
    await expect(decodeFile(link, 'wrong')).rejects.toMatchObject({ reason: 'wrong-password' });
    expect(new TextDecoder().decode((await decodeFile(link, 'correct horse')).bytes)).toBe('pin 4321');
  }, 20000);

  it('detects links cut off by a chat app', async () => {
    const raw = await encodeFile({ name: 'a.bin', type: '', bytes: crypto.getRandomValues(new Uint8Array(500)) });
    await expect(decodeFile(raw.slice(0, raw.length - 40))).rejects.toMatchObject({ reason: 'truncated' });
    const z = await encodeFile({ name: 'a.txt', type: 'text/plain', bytes: text('abc '.repeat(500)) });
    await expect(decodeFile(z.slice(0, z.length - 5))).rejects.toBeInstanceOf(LinkError);
    await expect(decodeFile('hello')).rejects.toMatchObject({ reason: 'invalid' });
  });
});
