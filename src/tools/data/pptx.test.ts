import { describe, expect, it } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { readPptx, outline } from './pptx';

const sp = (body: string, ph = '') => `<p:sp><p:nvSpPr>${ph ? `<p:nvPr><p:ph type="${ph}"/></p:nvPr>` : ''}</p:nvSpPr><p:txBody>${body}</p:txBody></p:sp>`;
const para = (...runs: string[]) => `<a:p>${runs.map((r) => `<a:r><a:t>${r}</a:t></a:r>`).join('')}</a:p>`;

function deck() {
  return zipSync({
    'ppt/presentation.xml': strToU8('<p:presentation><p:sldIdLst><p:sldId id="257" r:id="rId3"/><p:sldId id="256" r:id="rId2"/></p:sldIdLst></p:presentation>'),
    'ppt/_rels/presentation.xml.rels': strToU8('<Relationships><Relationship Id="rId2" Type="x/slide" Target="slides/slide1.xml"/><Relationship Id="rId3" Type="x/slide" Target="slides/slide2.xml"/></Relationships>'),
    'ppt/slides/slide1.xml': strToU8(`<p:sld show="0"><p:cSld><p:spTree>${sp(para('Second'), 'title')}${sp(para('Q3 &amp; Q4 ', 'revenue'))}</p:spTree></p:cSld></p:sld>`),
    'ppt/slides/slide2.xml': strToU8(`<p:sld><p:cSld><p:spTree>${sp(para('नमस्ते Dhurta'), 'ctrTitle')}${sp(para('Point one') + para('Point two'))}</p:spTree></p:cSld></p:sld>`),
    'ppt/slides/_rels/slide2.xml.rels': strToU8('<Relationships><Relationship Id="rId1" Type="x/notesSlide" Target="../notesSlides/notesSlide1.xml"/><Relationship Id="rId2" Type="x/image" Target="../media/image1.png"/></Relationships>'),
    'ppt/notesSlides/notesSlide1.xml': strToU8(`<p:notes>${sp(para('2'), 'sldNum')}${sp(para('Say hello first'), 'body')}</p:notes>`),
    'ppt/media/image1.png': new Uint8Array([137, 80, 78, 71]),
    'docProps/core.xml': strToU8('<cp:coreProperties><dc:title>Launch deck</dc:title><dc:creator>Prashant</dc:creator><dcterms:created>2026-10-01T10:00:00Z</dcterms:created></cp:coreProperties>'),
    'docProps/app.xml': strToU8('<Properties><Application>Microsoft Office PowerPoint</Application></Properties>'),
  });
}

describe('pptx reader', () => {
  it('reads slides in presentation order with titles, text and notes', () => {
    const p = readPptx(deck());
    expect(p.slides.map((s) => s.title)).toEqual(['नमस्ते Dhurta', 'Second']);
    expect(p.slides[0].text).toEqual(['Point one', 'Point two']);
    expect(p.slides[0].notes).toBe('Say hello first');
    expect(p.slides[1].text).toEqual(['Q3 & Q4 revenue']);
    expect(p.slides[1].hidden).toBe(true);
  });
  it('lists media and document properties', () => {
    const p = readPptx(deck());
    expect(p.media.map((m) => m.name)).toEqual(['image1.png']);
    expect(p.props).toContainEqual(['Title', 'Launch deck']);
    expect(p.props).toContainEqual(['Author', 'Prashant']);
    expect(p.props).toContainEqual(['Made with', 'Microsoft Office PowerPoint']);
  });
  it('builds a text outline', () => {
    const text = outline(readPptx(deck()));
    expect(text).toContain('Slide 1: नमस्ते Dhurta');
    expect(text).toContain('  Notes: Say hello first');
    expect(text).toContain('Slide 2 (hidden): Second');
  });
  it('rejects non-presentations clearly', () => {
    expect(() => readPptx(new Uint8Array([1, 2, 3]))).toThrow(/valid \.pptx/);
    expect(() => readPptx(zipSync({ 'word/document.xml': strToU8('<w/>') }))).toThrow(/not a PowerPoint/);
  });
});
