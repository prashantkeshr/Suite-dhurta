import { describe, expect, it } from 'vitest';
import { parsePageRanges, formatPageList, chunkPages } from './pdf/ranges';
import { countText, convertCase, cleanText, DEFAULT_CLEAN, findReplace, slugify, lorem, splitWords } from './text/logic';
import { parseCsv, detectDelimiter, csvToJson, jsonToCsv } from './data/csv';
import { formatJson, findJsonErrorOffset, base64Encode, base64Decode, decodeEntities, encodeEntities, decodeJwt, parseColor, contrastRatio, toHex, urlDecode } from './developer/logic';
import { emi, gst, percentChange, UNIT_CATEGORIES, convertUnit } from './calculators/logic';
import { computeSize, resolveOutputMime, rotatedSize } from './image/ops';
import { jpegOrientation } from './image/exif';
import { generatePassword, randomInt, uuidV4, randomToken, digestHex } from './security/logic';

describe('PDF page ranges', () => {
  it('parses ranges, open ends and "all"', () => {
    expect(parsePageRanges('1-3, 5', 10)).toEqual([0, 1, 2, 4]);
    expect(parsePageRanges('8-', 10)).toEqual([7, 8, 9]);
    expect(parsePageRanges('-2', 10)).toEqual([0, 1]);
    expect(parsePageRanges('all', 3)).toEqual([0, 1, 2]);
    expect(parsePageRanges('3-1', 5)).toEqual([2, 1, 0]);
    expect(parsePageRanges('2,2,2', 5)).toEqual([1]);
  });
  it('rejects invalid input with a clear message', () => {
    expect(() => parsePageRanges('0', 5)).toThrow(/start at 1/);
    expect(() => parsePageRanges('7', 5)).toThrow(/5 pages/);
    expect(() => parsePageRanges('abc', 5)).toThrow(/not a valid/);
    expect(() => parsePageRanges(', ,', 5)).toThrow(/No pages/);
  });
  it('formats and chunks page lists', () => {
    expect(formatPageList([0, 1, 2, 4, 6, 7])).toBe('1–3, 5, 7–8');
    expect(chunkPages(5, 2)).toEqual([[0, 1], [2, 3], [4]]);
  });
});

describe('text logic', () => {
  it('counts English text', () => {
    const s = countText('Hello world. This is a test.\n\nSecond paragraph!');
    expect(s.words).toBe(8);
    expect(s.sentences).toBe(3);
    expect(s.paragraphs).toBe(2);
    expect(s.lines).toBe(3);
  });
  it('counts Hindi words and grapheme clusters correctly', () => {
    const s = countText('नमस्ते दुनिया');
    expect(s.words).toBe(2);
    // "नमस्ते" is 6 code points but 3 user-perceived characters (न, म, स्ते).
    expect(s.characters).toBeLessThan(Array.from('नमस्ते दुनिया').length);
    expect(s.bytes).toBe(new TextEncoder().encode('नमस्ते दुनिया').length);
  });
  it('counts emoji as one character', () => {
    expect(countText('👍🏽').characters).toBe(1);
  });
  it('converts case', () => {
    expect(convertCase('the lord of the rings', 'title')).toBe('The Lord of the Rings');
    expect(convertCase('helloWorld foo_bar', 'snake')).toBe('hello_world_foo_bar');
    expect(convertCase('XMLHttpRequest', 'kebab')).toBe('xml-http-request');
    expect(convertCase('user id', 'camel')).toBe('userId');
    expect(convertCase('HELLO. WORLD', 'sentence')).toBe('Hello. World');
    expect(splitWords('parseHTTPResponse2')).toEqual(['parse', 'HTTP', 'Response2']);
  });
  it('cleans lines', () => {
    const r = cleanText(' b \na\n\nb\nA\n', { ...DEFAULT_CLEAN, removeEmpty: true, dedupe: true, dedupeIgnoreCase: true, sort: 'asc' });
    expect(r.output).toBe('a\nb');
    expect(cleanText('item10\nitem2', { ...DEFAULT_CLEAN, sort: 'natural' }).output).toBe('item2\nitem10');
    expect(cleanText('line one\nline two\n\nnext', { ...DEFAULT_CLEAN, removeLineBreaksInParagraphs: true }).output).toBe('line one line two\n\nnext');
  });
  it('finds and replaces literally and with regex groups', () => {
    expect(findReplace('a.b.c', '.', '-', { caseSensitive: true, regex: false, wholeWord: false })).toEqual({ output: 'a-b-c', count: 2 });
    expect(findReplace('John Smith', '(\\w+) (\\w+)', '$2, $1', { caseSensitive: true, regex: true, wholeWord: false }).output).toBe('Smith, John');
    expect(findReplace('cat catalog', 'cat', 'dog', { caseSensitive: true, regex: false, wholeWord: true }).output).toBe('dog catalog');
    expect(findReplace('राम और श्याम', 'और', 'and', { caseSensitive: true, regex: false, wholeWord: true }).output).toBe('राम and श्याम');
  });
  it('makes slugs, keeping Hindi unless ASCII-only', () => {
    expect(slugify('Héllo, World! 2026')).toBe('hello-world-2026');
    expect(slugify('भारत की यात्रा')).toBe('भारत-की-यात्रा');
    expect(slugify('भारत Travel', { asciiOnly: true })).toBe('travel');
    expect(slugify('Tom & Jerry')).toBe('tom-and-jerry');
    expect(slugify('one two three four', { maxLength: 9 })).toBe('one-two');
  });
  it('generates the requested amount of lorem ipsum', () => {
    expect(lorem(5, 'words').split(' ')).toHaveLength(5);
    expect(lorem(3, 'paragraphs').split('\n\n')).toHaveLength(3);
    expect(lorem(2, 'sentences').startsWith('Lorem ipsum dolor sit amet')).toBe(true);
    expect(lorem(4, 'sentences').match(/\./g)).toHaveLength(4);
  });
});

describe('CSV', () => {
  it('parses quoted fields, escaped quotes, CRLF and embedded newlines', () => {
    expect(parseCsv('a,b\r\n"x, y","say ""hi"""\n"multi\nline",z\n')).toEqual([
      ['a', 'b'],
      ['x, y', 'say "hi"'],
      ['multi\nline', 'z'],
    ]);
  });
  it('strips a UTF-8 BOM and keeps Hindi', () => {
    expect(parseCsv('﻿नाम,शहर\nआशा,पुणे')).toEqual([
      ['नाम', 'शहर'],
      ['आशा', 'पुणे'],
    ]);
  });
  it('detects unusual delimiters', () => {
    expect(detectDelimiter('a;b;c\n1;2;3\n4;5;6')).toBe(';');
    expect(detectDelimiter('a\tb\n1\t2')).toBe('\t');
    expect(detectDelimiter('a|b|c\n"1|x"|2|3')).toBe('|');
  });
  it('converts CSV to JSON with type inference that keeps IDs as text', () => {
    const r = csvToJson('id,name,active,zip\n007,Asha,true,411001\n2,Ravi,false,', { header: true, inferTypes: true, skipEmpty: true });
    expect(r.data).toEqual([
      { id: '007', name: 'Asha', active: true, zip: 411001 },
      { id: 2, name: 'Ravi', active: false, zip: '' },
    ]);
  });
  it('de-duplicates headers and warns about ragged rows', () => {
    const r = csvToJson('a,a,\n1,2,3,4', { header: true, inferTypes: false, skipEmpty: true });
    expect(Object.keys(r.data[0] as object)).toEqual(['a', 'a_2', 'column_3', 'column_4']);
    expect(r.warnings.length).toBe(1);
  });
  it('converts JSON to CSV with escaping and a union of columns', () => {
    const r = jsonToCsv([{ a: 1, b: 'x,y' }, { b: 'say "hi"', c: { n: 1 } }]);
    expect(r.csv).toBe('a,b,c\r\n1,"x,y",\r\n,"say ""hi""","{""n"":1}"');
    expect(jsonToCsv({ items: [{ a: 1 }] }).rows).toBe(1);
    expect(() => jsonToCsv(42)).toThrow();
  });
});

describe('developer logic', () => {
  it('formats JSON and locates errors', () => {
    expect(formatJson('{"b":1,"a":[1,2]}', 0, true).output).toBe('{"a":[1,2],"b":1}');
    const bad = formatJson('{\n  "a": 1,\n  "b": \n}', 2);
    expect(bad.error).toMatchObject({ line: 4, column: 1 });
    expect(formatJson('{"a": 1,}', 2).error).toMatchObject({ line: 1, column: 9 });
    expect(formatJson('[1, 2', 2).error).toMatchObject({ line: 1, column: 6 });
    expect(formatJson("{'a': 1}", 2).error).toMatchObject({ line: 1, column: 2 });
    expect(findJsonErrorOffset('{"ok": [true, null, -1.5e3, "\\u0041"]}')).toBe(-1);
  });
  it('encodes Base64 as UTF-8, both ways', () => {
    expect(base64Encode('नमस्ते')).toBe('4KSo4KSu4KS44KWN4KSk4KWH');
    expect(base64Decode('4KSo4KSu4KS44KWN4KSk4KWH')).toBe('नमस्ते');
    expect(base64Encode('??>', true)).toBe('Pz8-');
    expect(base64Decode('Pz8-')).toBe('??>');
    expect(() => base64Decode('###')).toThrow();
  });
  it('handles HTML entities and URL decoding', () => {
    expect(encodeEntities('<a href="x">&</a>', 'minimal')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;');
    expect(decodeEntities('&lt;p&gt; &amp; &#8377; &#x1F600; &copy; &bogus;')).toBe('<p> & ₹ 😀 © &bogus;');
    expect(urlDecode('a+b%20c', true)).toBe('a b c');
    expect(() => urlDecode('%E0%A4', false)).toThrow();
  });
  it('decodes JWTs and rejects malformed ones', () => {
    const token = `${base64Encode('{"alg":"HS256"}', true)}.${base64Encode('{"sub":"42","exp":1}', true)}.sig`;
    expect(decodeJwt(`Bearer ${token}`).payload).toEqual({ sub: '42', exp: 1 });
    expect(() => decodeJwt('a.b')).toThrow(/3 parts/);
  });
  it('parses colours and computes WCAG contrast', () => {
    expect(parseColor('#fff')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(toHex(parseColor('hsl(0, 100%, 50%)')!)).toBe('#ff0000');
    expect(parseColor('rgb(0 128 255 / 50%)')?.a).toBe(0.5);
    expect(parseColor('nope')).toBeNull();
    expect(contrastRatio(parseColor('#000')!, parseColor('#fff')!)).toBeCloseTo(21, 5);
  });
});

describe('calculators', () => {
  it('computes EMI matching the standard formula', () => {
    const r = emi(100000, 12, 12);
    expect(r.emi).toBeCloseTo(8884.88, 2);
    expect(r.schedule).toHaveLength(12);
    expect(r.schedule[11].balance).toBeCloseTo(0, 6);
    expect(emi(1200, 0, 12).emi).toBe(100);
    expect(() => emi(0, 10, 12)).toThrow();
  });
  it('adds and removes GST', () => {
    expect(gst(1000, 18, 'add')).toMatchObject({ gst: 180, gross: 1180, cgst: 90 });
    const r = gst(1180, 18, 'remove');
    expect(r.net).toBeCloseTo(1000, 8);
  });
  it('computes percentage change', () => {
    expect(percentChange(200, 250)).toBe(25);
    expect(percentChange(-100, -50)).toBe(50);
    expect(percentChange(0, 5)).toBeNaN();
  });
  it('converts units, including temperature offsets', () => {
    const find = (c: string, u: string) => UNIT_CATEGORIES.find((x) => x.id === c)!.units.find((x) => x.id === u)!;
    expect(convertUnit(1, find('length', 'mi'), find('length', 'km'))).toBeCloseTo(1.609344, 9);
    expect(convertUnit(100, find('temperature', 'c'), find('temperature', 'f'))).toBeCloseTo(212, 9);
    expect(convertUnit(0, find('temperature', 'k'), find('temperature', 'c'))).toBeCloseTo(-273.15, 9);
    expect(convertUnit(1, find('data', 'GiB'), find('data', 'MB'))).toBeCloseTo(1073.741824, 6);
    expect(convertUnit(180, find('angle', 'deg'), find('angle', 'rad'))).toBeCloseTo(Math.PI, 12);
  });
});

describe('image operations', () => {
  it('computes resize targets', () => {
    expect(computeSize(4000, 3000, { mode: 'percent', percent: 50 })).toEqual({ width: 2000, height: 1500 });
    expect(computeSize(4000, 3000, { mode: 'dimensions', width: 800, keepAspect: true })).toEqual({ width: 800, height: 600 });
    expect(computeSize(4000, 3000, { mode: 'dimensions', width: 800, height: 800, keepAspect: true })).toEqual({ width: 800, height: 600 });
    expect(computeSize(4000, 3000, { mode: 'dimensions', width: 800, height: 800, keepAspect: false })).toEqual({ width: 800, height: 800 });
    expect(computeSize(1000, 500, { mode: 'maxSide', max: 2000 })).toEqual({ width: 1000, height: 500 });
    expect(computeSize(3, 3, { mode: 'percent', percent: 1 })).toEqual({ width: 1, height: 1 });
  });
  it('swaps dimensions for quarter turns', () => {
    expect(rotatedSize(100, 50, 90)).toEqual({ width: 50, height: 100 });
    expect(rotatedSize(100, 50, 180)).toEqual({ width: 100, height: 50 });
  });
  it('resolves "same as original" to an encodable format', () => {
    expect(resolveOutputMime('image/webp', 'original')).toBe('image/webp');
    expect(resolveOutputMime('image/gif', 'original')).toBe('image/png');
    expect(resolveOutputMime('image/png', 'image/jpeg')).toBe('image/jpeg');
  });
  it('reads EXIF orientation from JPEG headers', () => {
    // SOI, APP1 "Exif\0\0", big-endian TIFF, 1 IFD entry: tag 0x0112 = 6
    const jpeg = new Uint8Array([
      0xff, 0xd8, 0xff, 0xe1, 0x00, 0x22, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00, 0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, 0x00, 0x01, 0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, 0x06, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    ]);
    expect(jpegOrientation(jpeg)).toBe(6);
    expect(jpegOrientation(new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0, 4, 0, 0]))).toBe(1);
    expect(jpegOrientation(new Uint8Array([1, 2, 3]))).toBe(1);
  });
});

describe('security generators', () => {
  it('draws unbiased integers in range', () => {
    for (let i = 0; i < 500; i++) {
      const n = randomInt(7);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(7);
    }
  });
  it('includes every selected character class', () => {
    for (let i = 0; i < 50; i++) {
      const p = generatePassword({ length: 8, lower: true, upper: true, digits: true, symbols: true, excludeAmbiguous: true });
      expect(p).toHaveLength(8);
      expect(p).toMatch(/[a-z]/);
      expect(p).toMatch(/[A-Z]/);
      expect(p).toMatch(/[0-9]/);
      expect(p).not.toMatch(/[Il1O0o]/);
    }
    expect(() => generatePassword({ length: 8, lower: false, upper: false, digits: false, symbols: false, excludeAmbiguous: false })).toThrow();
  });
  it('generates v4 UUIDs and tokens', () => {
    expect(uuidV4()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(randomToken(16, 'hex')).toMatch(/^[0-9a-f]{32}$/);
    expect(randomToken(16, 'base64url')).not.toMatch(/[+/=]/);
  });
  it('computes SHA-256 correctly', async () => {
    expect(await digestHex('SHA-256', new TextEncoder().encode('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});
