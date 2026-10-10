import { describe, expect, it } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { readMp4Dates, setMp4Dates, dateToMp4Seconds } from './mp4meta';
import { readOfficeMeta, setOfficeMeta } from './officeMeta';
import { readMp3Tags, setMp3Tags, audioStart } from './mp3meta';

function minimalMp4(): Uint8Array {
  const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  const str = (s: string) => [...s].map((c) => c.charCodeAt(0));
  // mvhd: version0, flags0, creation, modification, timescale, duration
  const mvhdBody = [0, 0, 0, 0, ...u32(1000), ...u32(2000), ...u32(600), ...u32(0)];
  const mvhd = [...u32(8 + mvhdBody.length), ...str('mvhd'), ...mvhdBody];
  const moov = [...u32(8 + mvhd.length), ...str('moov'), ...mvhd];
  const ftyp = [...u32(16), ...str('ftyp'), ...str('isom'), 0, 0, 0, 0];
  return new Uint8Array([...ftyp, ...moov]);
}

describe('MP4/MOV dates', () => {
  it('reads and writes the internal media dates', () => {
    const mp4 = minimalMp4();
    const before = readMp4Dates(mp4);
    expect(before.editable).toBe(true);
    const newDate = new Date('2022-07-15T08:30:00Z');
    const out = setMp4Dates(mp4, { created: newDate, modified: newDate });
    expect(out.length).toBe(mp4.length); // in-place, same size
    const after = readMp4Dates(out);
    expect(Math.round(after.created!.getTime() / 1000)).toBe(Math.round(newDate.getTime() / 1000));
    expect(dateToMp4Seconds(newDate)).toBe(Math.floor(newDate.getTime() / 1000) + 2082844800);
  });
  it('reports non-MP4 as not editable', () => {
    expect(readMp4Dates(new Uint8Array([1, 2, 3, 4])).editable).toBe(false);
  });
});

describe('Office core properties', () => {
  const makeDocx = (core: string) =>
    zipSync({
      '[Content_Types].xml': strToU8('<Types/>'),
      'docProps/core.xml': strToU8(core),
      'word/document.xml': strToU8('<w/>'),
    });
  it('reads and edits title, author and dates', () => {
    const docx = makeDocx('<cp:coreProperties><dc:title>Old</dc:title><dc:creator>Asha</dc:creator><dcterms:created>2020-01-01T00:00:00Z</dcterms:created></cp:coreProperties>');
    const { meta, editable } = readOfficeMeta(docx);
    expect(editable).toBe(true);
    expect(meta.title).toBe('Old');
    expect(meta.author).toBe('Asha');
    const out = setOfficeMeta(docx, { ...meta, title: 'New & Improved', created: '2019-05-05T09:00:00Z', modified: '2026-10-10T10:00:00Z' });
    const back = readOfficeMeta(out).meta;
    expect(back.title).toBe('New & Improved');
    expect(back.created).toBe('2019-05-05T09:00:00Z');
    expect(back.modified).toBe('2026-10-10T10:00:00Z');
    expect(back.author).toBe('Asha');
  });
  it('rejects a non-Office zip', () => {
    expect(readOfficeMeta(zipSync({ 'random.txt': strToU8('hi') })).editable).toBe(false);
    expect(readOfficeMeta(new Uint8Array([1, 2, 3])).editable).toBe(false);
  });
});

describe('MP3 ID3 tags', () => {
  it('writes and reads back tags, replacing any existing tag', () => {
    const audio = new Uint8Array([0xff, 0xfb, 0x90, 0x00, 1, 2, 3, 4]);
    const out = setMp3Tags(audio, { title: 'नमस्ते Song', artist: 'Artist X', album: 'Album Y', year: '2024', track: '3', genre: 'Pop', comment: 'nice' });
    expect(out[0]).toBe(0x49); // "I"
    expect(audioStart(out)).toBeGreaterThan(10);
    // audio preserved at the end
    expect([...out.subarray(audioStart(out))]).toEqual([...audio]);
    const { tags, hasTag } = readMp3Tags(out);
    expect(hasTag).toBe(true);
    expect(tags.title).toBe('नमस्ते Song');
    expect(tags.artist).toBe('Artist X');
    expect(tags.year).toBe('2024');
    expect(tags.comment).toBe('nice');
    // re-tagging replaces, not stacks
    const out2 = setMp3Tags(out, { ...tags, title: 'Renamed' });
    expect(readMp3Tags(out2).tags.title).toBe('Renamed');
    expect([...out2.subarray(audioStart(out2))]).toEqual([...audio]);
  });
});
