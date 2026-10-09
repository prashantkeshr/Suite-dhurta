import { describe, expect, it } from 'vitest';
import { encryptFile, decryptFile, isEncryptedContainer, CryptoError } from './fileCrypto';
import { estimateStrength, crackTimeText } from './passwordStrength';
import { base32Decode, totp, parseOtpauth } from './totp';

const bytes = (s: string) => new TextEncoder().encode(s);
const str = (b: Uint8Array) => new TextDecoder().decode(b);

describe('file encryption', () => {
  it('round-trips a file with its name and type', async () => {
    const file = { name: 'नोट्स.pdf', type: 'application/pdf', bytes: crypto.getRandomValues(new Uint8Array(5000)) };
    const blob = await encryptFile(file, 'correct horse battery');
    const enc = new Uint8Array(await blob.arrayBuffer());
    expect(isEncryptedContainer(enc)).toBe(true);
    expect(str(enc.subarray(0, 6))).toBe('DSENC1');
    const back = await decryptFile(enc, 'correct horse battery');
    expect(back.name).toBe('नोट्स.pdf');
    expect(back.type).toBe('application/pdf');
    expect(back.bytes).toEqual(file.bytes);
  }, 30000);

  it('rejects a wrong password and a non-container', async () => {
    const enc = new Uint8Array(await (await encryptFile({ name: 'a.txt', type: 'text/plain', bytes: bytes('secret') }, 'right')).arrayBuffer());
    await expect(decryptFile(enc, 'wrong')).rejects.toMatchObject({ reason: 'password' });
    await expect(decryptFile(bytes('not encrypted'), 'x')).rejects.toBeInstanceOf(CryptoError);
    expect(isEncryptedContainer(bytes('hello'))).toBe(false);
  }, 20000);
});

describe('password strength', () => {
  it('rates weak and strong passwords sensibly', () => {
    expect(estimateStrength('123456').score).toBe(0);
    expect(estimateStrength('password').score).toBe(0);
    expect(estimateStrength('qwerty123').warnings.some((w) => /sequence/.test(w))).toBe(true);
    expect(estimateStrength('aaaaaa').warnings.some((w) => /repeat/.test(w))).toBe(true);
    const strong = estimateStrength('Tr0ub4dour&3xplr!ng');
    expect(strong.score).toBeGreaterThanOrEqual(3);
    expect(estimateStrength('velvet-orbit-canyon-sprout-mango').score).toBe(4);
  });
  it('gives longer crack times for more bits', () => {
    expect(crackTimeText(20)).toMatch(/second|instant/);
    expect(crackTimeText(45)).not.toMatch(/instant/);
    expect(crackTimeText(80)).toMatch(/years|forever/);
  });
});

describe('TOTP (RFC 6238 vectors)', () => {
  const secret = bytes('12345678901234567890'); // 20-byte ASCII seed from the RFC
  it('matches the published SHA-1 test vectors', async () => {
    expect(await totp(secret, 59_000, { digits: 8 })).toBe('94287082');
    expect(await totp(secret, 1_111_111_109_000, { digits: 8 })).toBe('07081804');
    expect(await totp(secret, 1_111_111_111_000, { digits: 8 })).toBe('14050471');
  });
  it('decodes Base32 and otpauth URIs', async () => {
    expect(str(base32Decode('JBSWY3DP'))).toBe('Hello');
    expect(str(base32Decode('jbsw y3dp'))).toBe('Hello');
    const p = parseOtpauth('otpauth://totp/Dhurta:prashant?secret=JBSWY3DPEHPK3PXP&issuer=Dhurta&digits=6&period=30');
    expect(p?.issuer).toBe('Dhurta');
    expect(p?.options.digits).toBe(6);
    expect(p?.secret.length).toBeGreaterThan(0);
    expect(parseOtpauth('https://example.com')).toBeNull();
  });
});
