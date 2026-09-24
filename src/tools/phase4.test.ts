import { describe, expect, it } from 'vitest';
import { fromRows, sortRows, filterRows, removeDuplicateRows, removeEmptyRows, splitColumn, mergeColumns, deleteColumn, trimCells, caseColumn, columnStats, tableToObjects } from './data/table';
import { formatXml, minifyXml, tokenizeXml } from './developer/xml';
import { parseHeaders, canonicalName, parseUserAgent } from './developer/http';
import { gradientCss, shadowCss, hexToRgba } from './developer/css';

describe('table operations', () => {
  const t = fromRows(
    [
      ['Name', 'City', 'Score'],
      ['Asha Rao', 'Pune', '10'],
      ['Ravi Kumar', 'Delhi', '9'],
      ['asha rao', 'pune', '10'],
      ['', '', ''],
      ['Meera', 'मुंबई'],
    ],
    true,
  );

  it('builds a padded table with a header', () => {
    expect(t.header).toEqual(['Name', 'City', 'Score']);
    expect(t.rows[4]).toEqual(['Meera', 'मुंबई', '']);
    expect(fromRows([['a', 'b']], false).header).toEqual(['Column 1', 'Column 2']);
  });

  it('sorts numerically and keeps empty cells last', () => {
    const rows = [['10'], ['9'], [''], ['100'], ['1,000']];
    expect(sortRows(rows, 0, 'asc').map((r) => r[0])).toEqual(['9', '10', '100', '1,000', '']);
    expect(sortRows(rows, 0, 'desc').map((r) => r[0])).toEqual(['1,000', '100', '10', '9', '']);
    expect(sortRows([['item10'], ['item2']], 0, 'asc').map((r) => r[0])).toEqual(['item2', 'item10']);
  });

  it('filters across all cells, including Hindi', () => {
    expect(filterRows(t.rows, 'PUNE')).toEqual([0, 2]);
    expect(filterRows(t.rows, 'मुंबई')).toEqual([4]);
    expect(filterRows(t.rows, '')).toHaveLength(5);
  });

  it('removes duplicate and empty rows', () => {
    expect(removeDuplicateRows(t.rows).removed).toBe(0);
    expect(removeDuplicateRows(t.rows, { ignoreCase: true }).removed).toBe(1);
    expect(removeDuplicateRows(t.rows, { columns: [2] }).rows.map((r) => r[2])).toEqual(['10', '9', '']);
    expect(removeEmptyRows(t.rows).removed).toBe(1);
  });

  it('splits and merges columns', () => {
    const split = splitColumn(t, 0, ' ');
    expect(split.header).toEqual(['Name 1', 'Name 2', 'City', 'Score']);
    expect(split.rows[0]).toEqual(['Asha', 'Rao', 'Pune', '10']);
    const limited = splitColumn({ header: ['x'], rows: [['a-b-c']] }, 0, '-', 2);
    expect(limited.rows[0]).toEqual(['a', 'b-c']);
    const merged = mergeColumns(t, [1, 0], ', ', 'Who');
    expect(merged.header).toEqual(['Who', 'Score']);
    expect(merged.rows[0]).toEqual(['Pune, Asha Rao', '10']); // joined in the order given
    expect(merged.rows[3]).toEqual(['', '']);
  });

  it('deletes, trims, changes case and summarises columns', () => {
    expect(deleteColumn(t, 1).header).toEqual(['Name', 'Score']);
    expect(trimCells({ header: [' a '], rows: [['  x   y ']] })).toEqual({ header: ['a'], rows: [['x y']] });
    expect(caseColumn(t, 0, 'title').rows[2][0]).toBe('Asha Rao');
    expect(caseColumn(t, null, 'upper').rows[0]).toEqual(['ASHA RAO', 'PUNE', '10']);
    expect(columnStats(t.rows, 2)).toMatchObject({ filled: 3, empty: 2, numeric: true, min: 9, max: 10, sum: 29 });
    expect(tableToObjects(t)[1]).toEqual({ Name: 'Ravi Kumar', City: 'Delhi', Score: '9' });
  });
});

describe('XML formatting', () => {
  const xml = '<?xml version="1.0"?><root a="1"><!-- note --><item id="x">Hello  world</item><empty/><list><li>1</li><li><![CDATA[<b>]]></li></list><e></e></root>';
  it('tokenizes all node kinds', () => {
    const types = tokenizeXml(xml).map((t) => t.type);
    expect(types).toEqual(expect.arrayContaining(['pi', 'open', 'comment', 'text', 'close', 'selfclose', 'cdata']));
  });
  it('pretty-prints with indentation and inline short text', () => {
    expect(formatXml(xml)).toBe(
      [
        '<?xml version="1.0"?>',
        '<root a="1">',
        '  <!-- note -->',
        '  <item id="x">Hello  world</item>',
        '  <empty/>',
        '  <list>',
        '    <li>1</li>',
        '    <li>',
        '      <![CDATA[<b>]]>',
        '    </li>',
        '  </list>',
        '  <e></e>',
        '</root>',
      ].join('\n'),
    );
  });
  it('minifies and drops comments', () => {
    expect(minifyXml(formatXml(xml))).toBe('<?xml version="1.0"?><root a="1"><item id="x">Hello world</item><empty/><list><li>1</li><li><![CDATA[<b>]]></li></list><e></e></root>');
  });
});

describe('HTTP headers and user agents', () => {
  it('parses a response with folded headers and invalid lines', () => {
    const p = parseHeaders('HTTP/1.1 200 OK\r\ncontent-type: text/html\r\nX-Long: a\r\n  b\r\nnot a header\r\n\r\n');
    expect(p.startLine).toMatchObject({ kind: 'response', status: 200, reason: 'OK' });
    expect(p.headers).toEqual([
      { name: 'content-type', value: 'text/html' },
      { name: 'X-Long', value: 'a b' },
    ]);
    expect(p.invalid).toEqual(['not a header']);
  });
  it('parses a request line', () => {
    expect(parseHeaders('GET /api?q=1 HTTP/2\nHost: example.com').startLine).toMatchObject({ kind: 'request', method: 'GET', path: '/api?q=1' });
  });
  it('canonicalises header names', () => {
    expect(canonicalName('x-content-type-options')).toBe('X-Content-Type-Options');
  });
  it('recognises common browsers and platforms', () => {
    const chromeWin = parseUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36');
    expect(chromeWin).toMatchObject({ browser: 'Chrome', browserVersion: '130.0.0.0', engine: 'Blink', os: 'Windows', device: 'desktop' });
    const edge = parseUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0');
    expect(edge.browser).toBe('Edge');
    const iphone = parseUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1');
    expect(iphone).toMatchObject({ browser: 'Safari', os: 'iOS', osVersion: '17.4', device: 'mobile', engine: 'WebKit' });
    const android = parseUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36');
    expect(android).toMatchObject({ os: 'Android', osVersion: '14', device: 'mobile' });
    const ff = parseUserAgent('Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0');
    expect(ff).toMatchObject({ browser: 'Firefox', engine: 'Gecko', os: 'Linux' });
    expect(parseUserAgent('Googlebot/2.1 (+http://www.google.com/bot.html)').device).toBe('bot');
    expect(parseUserAgent('').device).toBe('unknown');
  });
});

describe('CSS generators', () => {
  it('builds gradients with sorted stops', () => {
    const stops = [
      { color: '#ff0000', at: 100 },
      { color: '#0000ff', at: 0 },
    ];
    expect(gradientCss({ type: 'linear', angle: 90, shape: 'circle', stops })).toBe('linear-gradient(90deg, #0000ff 0%, #ff0000 100%)');
    expect(gradientCss({ type: 'radial', angle: 0, shape: 'ellipse', stops })).toBe('radial-gradient(ellipse, #0000ff 0%, #ff0000 100%)');
    expect(gradientCss({ type: 'conic', angle: 45, shape: 'circle', stops })).toBe('conic-gradient(from 45deg, #0000ff 0%, #ff0000 100%)');
  });
  it('builds box shadows', () => {
    expect(hexToRgba('#102030', 50)).toBe('rgba(16, 32, 48, 0.5)');
    expect(shadowCss([{ x: 0, y: 4, blur: 12, spread: 0, color: '#000000', opacity: 20, inset: false }, { x: 1, y: 1, blur: 0, spread: 1, color: '#ffffff', opacity: 100, inset: true }])).toBe(
      '0px 4px 12px 0px rgba(0, 0, 0, 0.2), inset 1px 1px 0px 1px rgba(255, 255, 255, 1)',
    );
    expect(shadowCss([])).toBe('none');
  });
});
