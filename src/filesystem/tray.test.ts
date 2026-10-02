import { describe, expect, it } from 'vitest';
import { useTray, trim, asFile, type TrayItem } from './tray';

const f = (name: string, size = 10, lastModified = 1) => new File([new Uint8Array(size)], name, { type: 'image/png', lastModified });

describe('file tray', () => {
  it('adds originals and results, skipping empty files and duplicates', () => {
    useTray.getState().clear();
    const a = f('a.png');
    const [idA] = useTray.getState().add([a, f('empty.png', 0)], 'input');
    const [again] = useTray.getState().add([a], 'input');
    expect(again).toBe(idA);
    useTray.getState().add([f('a-small.webp', 5, 2)], 'result', 'image-compressor');
    const items = useTray.getState().items;
    expect(items).toHaveLength(2);
    expect(items.find((i) => i.origin === 'result')?.toolId).toBe('image-compressor');
  });

  it('keeps the newest items within count and memory limits', () => {
    const mk = (i: number, size: number): TrayItem => ({ id: String(i), file: f(`${i}.png`, size, i), origin: 'result', at: i });
    const list = [mk(1, 50), mk(2, 50), mk(3, 50), mk(4, 50)];
    expect(trim(list, 2).map((i) => i.id)).toEqual(['4', '3']);
    expect(trim(list, 10, 120).map((i) => i.id)).toEqual(['4', '3']);
  });

  it('wraps blobs as named files', () => {
    const file = asFile(new Blob(['x'], { type: 'text/plain' }), 'out.txt');
    expect(file.name).toBe('out.txt');
    expect(file.type).toBe('text/plain');
  });

  it('opens focused on given items', () => {
    useTray.getState().show(['x']);
    expect(useTray.getState().open).toBe(true);
    expect(useTray.getState().focus).toEqual(['x']);
    useTray.getState().hide();
  });
});
