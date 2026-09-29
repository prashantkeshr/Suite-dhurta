import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import jsQR from 'jsqr';
import { wifiPayload, upiPayload, vcardPayload, emailPayload, smsPayload, normalizeUrl, isValidVpa, parseQr, urlWarnings } from './generators/payload';
import { renderQrSvg, designWarnings, contrastRatio, DEFAULT_DESIGN, type QrDesign, type DotStyle, type EyeStyle } from './generators/qrRender';
import { gs1CheckDigit, completeGs1 } from './generators/barcode';
import { evaluate, formatResult, CalcError } from './calculators/expr';
import { parseDate, age, ymdDiff, daysBetween, workingDays, addToDate, formatYmd } from './calculators/dates';
import { interest, bmi, bmiBand, healthyRange } from './calculators/logic';
import { sortTasks, isOverdue, type Task } from './productivity/tasks';
import { formatClock, nextPomodoroPhase } from './productivity/clock';

/** Rasterise an SVG in Node and decode it the way a scanner would. */
/** Same sizes as the in-app scan check. */
async function decodeSvg(svg: string): Promise<string | null> {
  for (const width of [300, 420, 600]) {
    const { data, info } = await sharp(Buffer.from(svg)).resize(width).flatten({ background: '#ffffff' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const text = jsQR(new Uint8ClampedArray(data.buffer, data.byteOffset, data.length), info.width, info.height, { inversionAttempts: 'attemptBoth' })?.data;
    if (text) return text;
  }
  return null;
}

describe('QR payloads', () => {
  it('builds and escapes Wi-Fi codes', () => {
    expect(wifiPayload({ ssid: 'Home;Net', password: 'p:a"ss\\', security: 'WPA', hidden: true })).toBe('WIFI:T:WPA;S:Home\\;Net;P:p\\:a\\"ss\\\\;H:true;;');
    expect(wifiPayload({ ssid: 'Cafe', password: 'x', security: 'nopass', hidden: false })).toBe('WIFI:T:nopass;S:Cafe;;');
  });

  it('builds UPI links and validates VPAs', () => {
    expect(upiPayload({ vpa: 'shop@okaxis', name: 'Asha Stores', amount: '250', note: 'Order 12' })).toBe('upi://pay?pa=shop%40okaxis&pn=Asha%20Stores&am=250.00&cu=INR&tn=Order%2012');
    expect(upiPayload({ vpa: 'shop@okaxis', name: '', amount: '', note: '' })).toBe('upi://pay?pa=shop%40okaxis&cu=INR');
    expect(isValidVpa('name.surname@oksbi')).toBe(true);
    expect(isValidVpa('not a vpa')).toBe(false);
  });

  it('builds vCards, email, SMS and URLs', () => {
    const v = vcardPayload({ firstName: 'Prashant', lastName: 'Keshri', org: 'Dhurta.Org', title: '', phone: '+91 98765 43210', email: 'a@b.in', website: 'dhurta.org', address: '' });
    expect(v).toContain('N:Keshri;Prashant;;;');
    expect(v).toContain('TEL;TYPE=CELL:+919876543210');
    expect(v).toContain('URL:https://dhurta.org');
    expect(v.startsWith('BEGIN:VCARD\r\nVERSION:3.0')).toBe(true);
    expect(emailPayload('a@b.in', 'Hi there', '')).toBe('mailto:a@b.in?subject=Hi%20there');
    expect(smsPayload('+91 98765-43210', 'Hello')).toBe('SMSTO:+919876543210:Hello');
    expect(normalizeUrl('example.com')).toBe('https://example.com');
    expect(normalizeUrl('http://x.in')).toBe('http://x.in');
  });

  it('parses scanned content and flags risky links', () => {
    const w = parseQr('WIFI:T:WPA;S:Home\\;Net;P:secret;;');
    expect(w.kind).toBe('wifi');
    expect(w.fields).toContainEqual(['Network (SSID)', 'Home;Net']);
    expect(w.fields).toContainEqual(['Password', 'secret']);
    expect(parseQr('upi://pay?pa=shop%40okaxis&pn=Asha&am=10.00&cu=INR').fields).toContainEqual(['Pay to (UPI ID)', 'shop@okaxis']);
    expect(parseQr('https://example.com/a').warnings).toEqual([]);
    expect(urlWarnings('http://bit.ly/x').length).toBe(2);
    expect(urlWarnings('https://xn--pypal-4ve.com').some((m) => m.includes('punycode'))).toBe(true);
    expect(urlWarnings('https://paypal.com@evil.example').some((m) => m.includes('“@”'))).toBe(true);
    expect(parseQr('hello world').kind).toBe('text');
  });
});

describe('branded QR renderer', () => {
  const text = 'https://suite.dhurta.org/tools/qr-generator';

  it('produces a standards-sized symbol with the chosen error correction', () => {
    const r = renderQrSvg(text, { ...DEFAULT_DESIGN, ecc: 'L' });
    expect(r.modules).toBe(17 + 4 * r.version);
    expect(r.svg.startsWith('<svg')).toBe(true);
    expect(r.logoCoverage).toBe(0);
  });

  const styles: [DotStyle, EyeStyle][] = [
    ['square', 'square'],
    ['rounded', 'rounded'],
    ['dots', 'circle'],
    ['fluid', 'leaf'],
  ];
  for (const [dotStyle, eyeStyle] of styles) {
    it(`decodes back to the content: ${dotStyle} dots, ${eyeStyle} eyes`, async () => {
      const r = renderQrSvg(text, { ...DEFAULT_DESIGN, dotStyle, eyeStyle, fg: '#1e1b4b', eyeColor: '#4f46e5' });
      expect(await decodeSvg(r.svg)).toBe(text);
    });
  }

  it('still decodes with a gradient, caption frame and a centred logo (ECC H)', async () => {
    const logo = await sharp({ create: { width: 64, height: 64, channels: 4, background: '#e11d48' } }).png().toBuffer();
    const d: QrDesign = { ...DEFAULT_DESIGN, dotStyle: 'rounded', eyeStyle: 'rounded', gradient: true, fg: '#312e81', fg2: '#0e7490', logo: `data:image/png;base64,${logo.toString('base64')}`, logoSize: 0.22, frame: 'caption', caption: 'SCAN ME' };
    const r = renderQrSvg(text, d);
    expect(r.logoCoverage).toBeGreaterThan(0.02);
    expect(r.logoCoverage).toBeLessThan(0.2);
    expect(r.svg).toContain('SCAN ME');
    expect(await decodeSvg(r.svg)).toBe(text);
  });

  it('handles Hindi and emoji text', async () => {
    const t = 'नमस्ते 🙏 Dhurta';
    expect(await decodeSvg(renderQrSvg(t, DEFAULT_DESIGN).svg)).toBe(t);
  });

  it('warns about low contrast, inverted colours and oversized logos', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0);
    const info = { svg: '', version: 3, modules: 29, logoCoverage: 0.25 };
    const w = designWarnings({ ...DEFAULT_DESIGN, fg: '#ffffff', bg: '#111111', logo: 'x' }, info);
    expect(w.some((m) => m.includes('inverted'))).toBe(true);
    expect(w.some((m) => m.includes('logo'))).toBe(true);
    expect(designWarnings({ ...DEFAULT_DESIGN, fg: '#bbbbbb' }, { ...info, logoCoverage: 0 }).some((m) => m.includes('Low contrast'))).toBe(true);
    expect(designWarnings(DEFAULT_DESIGN, { ...info, logoCoverage: 0 })).toEqual([]);
  });
});

describe('barcode check digits', () => {
  it('computes GS1 check digits', () => {
    expect(gs1CheckDigit('400638133393')).toBe(1); // EAN-13 4006381333931
    expect(gs1CheckDigit('03600029145')).toBe(2); // UPC-A 036000291452
    expect(gs1CheckDigit('9638507')).toBe(4); // EAN-8 96385074
  });
  it('completes or rejects numbers', () => {
    expect(completeGs1('400638133393', 13)).toEqual({ full: '4006381333931' });
    expect(completeGs1('4006381333931', 13)).toEqual({ full: '4006381333931' });
    expect(completeGs1('4006381333932', 13)).toEqual({ error: 'The check digit should be 1, not 2.' });
    expect('error' in completeGs1('12ab', 13)).toBe(true);
    expect('error' in completeGs1('123', 13)).toBe(true);
  });
});

describe('scientific calculator', () => {
  const ev = (s: string, angle: 'deg' | 'rad' = 'deg', ans?: number) => evaluate(s, { angle, ans });
  it('follows operator precedence', () => {
    expect(ev('2+3*4')).toBe(14);
    expect(ev('(2+3)*4')).toBe(20);
    expect(ev('2^3^2')).toBe(512);
    expect(ev('-2^2')).toBe(-4);
    expect(ev('2^-1')).toBe(0.5);
    expect(ev('10 ÷ 4 × 2')).toBe(5);
    expect(ev('7 mod 3')).toBe(1);
    expect(ev('-7 mod 3')).toBe(2);
  });
  it('supports functions, constants, factorial, percent and implicit multiplication', () => {
    expect(ev('sin(30)')).toBeCloseTo(0.5, 12);
    expect(ev('sin(180)')).toBe(0);
    expect(ev('cos(pi)', 'rad')).toBe(-1);
    expect(ev('asin(1)')).toBeCloseTo(90, 10);
    expect(ev('log(1000) + ln(e)')).toBeCloseTo(4, 12);
    expect(ev('sqrt(16) + √9')).toBe(7);
    expect(ev('5!')).toBe(120);
    expect(ev('nCr(5, 2) + nPr(5, 2)')).toBe(30);
    expect(ev('50%')).toBe(0.5);
    expect(ev('2π')).toBeCloseTo(2 * Math.PI, 12);
    expect(ev('3(4+1)')).toBe(15);
    expect(ev('root(-27, 3)')).toBeCloseTo(-3, 12);
    expect(ev('ans * 2', 'deg', 21)).toBe(42);
    expect(ev('1.5e3')).toBe(1500);
  });
  it('reports errors clearly', () => {
    expect(() => ev('1/0')).toThrow('divide by zero');
    expect(() => ev('tan(90)')).toThrow(CalcError);
    expect(() => ev('(1+2')).toThrow('Missing closing bracket');
    expect(() => ev('2.5!')).toThrow('whole number');
    expect(() => ev('foo(2)')).toThrow('Unknown name');
    expect(() => ev('sqrt(-1)')).toThrow('not a real number');
    expect(() => ev('ans')).toThrow('previous answer');
  });
  it('formats results without floating-point noise', () => {
    expect(formatResult(ev('0.1+0.2'))).toBe('0.3');
    expect(formatResult(1e20)).toBe('1e+20');
    expect(formatResult(Infinity)).toBe('∞');
  });
});

describe('date calculations', () => {
  const d = (s: string) => parseDate(s)!;
  it('validates dates', () => {
    expect(parseDate('2025-02-29')).toBeNull();
    expect(parseDate('2024-02-29')).not.toBeNull();
  });
  it('computes exact age and the next birthday', () => {
    const a = age(d('1995-08-15'), d('2026-09-30'))!;
    expect([a.years, a.months, a.days]).toEqual([31, 1, 15]);
    expect(formatYmd(a.nextBirthday)).toBe('2027-08-15');
    expect(a.bornOn).toBe('Tuesday');
    const leap = age(d('2004-02-29'), d('2027-02-01'))!;
    expect(formatYmd(leap.nextBirthday)).toBe('2027-02-28');
    expect(age(d('2030-01-01'), d('2026-01-01'))).toBeNull();
  });
  it('differences, working days and month-end arithmetic', () => {
    expect(daysBetween(d('2026-01-01'), d('2026-12-31'))).toBe(364);
    expect(ymdDiff(d('2026-01-31'), d('2026-03-01'))).toEqual({ years: 0, months: 1, days: 1 });
    expect(workingDays(d('2026-09-28'), d('2026-10-04'))).toBe(5); // Mon → Sun
    expect(workingDays(d('2026-09-28'), d('2026-10-05'), false)).toBe(5);
    expect(formatYmd(addToDate(d('2026-01-31'), { months: 1 }))).toBe('2026-02-28');
    expect(formatYmd(addToDate(d('2024-02-29'), { years: 1 }))).toBe('2025-02-28');
    expect(formatYmd(addToDate(d('2026-03-28'), { days: 7 }))).toBe('2026-04-04');
    expect(formatYmd(addToDate(d('2026-03-10'), { months: -3 }))).toBe('2025-12-10');
  });
});

describe('interest and BMI', () => {
  it('matches the standard compound interest formula', () => {
    const r = interest(100000, 7, 5, 4);
    expect(r.maturity).toBeCloseTo(100000 * (1 + 0.07 / 4) ** 20, 6);
    expect(r.simpleInterest).toBeCloseTo(35000, 6);
    expect(r.ear).toBeCloseTo(((1 + 0.07 / 4) ** 4 - 1) * 100, 9);
    expect(r.rows).toHaveLength(5);
  });
  it('adds monthly deposits (recurring deposit)', () => {
    const r = interest(0, 12, 1, 12, 1000);
    expect(r.deposited).toBe(12000);
    expect(r.maturity).toBeCloseTo(1000 * ((1.01 ** 12 - 1) / 0.01), 6);
    expect(interest(1000, 0, 2, 1).maturity).toBe(1000);
    expect(() => interest(0, 5, 1, 1, 0)).toThrow();
  });
  it('classifies BMI on both scales', () => {
    const v = bmi(70, 175);
    expect(v).toBeCloseTo(22.857, 3);
    expect(bmiBand(v, 'who').label).toBe('Healthy weight');
    expect(bmiBand(24, 'asian').label).toBe('Overweight');
    expect(bmiBand(24, 'who').label).toBe('Healthy weight');
    expect(bmiBand(41, 'who').label).toBe('Obesity class III');
    const [lo, hi] = healthyRange(170, 'asian');
    expect(lo).toBeCloseTo(53.465, 2);
    expect(hi).toBeCloseTo(66.18, 2);
  });
});

describe('productivity helpers', () => {
  const t = (id: string, p: Partial<Task>): Task => ({ id, text: id, done: false, priority: 'normal', created: 0, ...p });
  it('orders tasks: open by due date and priority, done last', () => {
    const list = [t('done', { done: true, doneAt: 5 }), t('undated-high', { priority: 'high' }), t('later', { due: '2026-10-10' }), t('overdue', { due: '2026-09-01' }), t('undated-low', { priority: 'low' })];
    expect(sortTasks(list).map((x) => x.id)).toEqual(['overdue', 'later', 'undated-high', 'undated-low', 'done']);
    expect(isOverdue(t('a', { due: '2026-09-01' }), '2026-09-30')).toBe(true);
    expect(isOverdue(t('a', { due: '2026-09-30' }), '2026-09-30')).toBe(false);
  });
  it('formats clocks and cycles Pomodoro phases', () => {
    expect(formatClock(65_432)).toBe('01:05.43');
    expect(formatClock(3_725_000, 'hms')).toBe('1:02:05');
    expect(formatClock(59_001, 's')).toBe('01:00');
    expect(nextPomodoroPhase('focus', 1, 4)).toBe('short');
    expect(nextPomodoroPhase('focus', 4, 4)).toBe('long');
    expect(nextPomodoroPhase('long', 4, 4)).toBe('focus');
  });
});
