/**
 * Printing HTML through the browser's own print engine ("Save as PDF").
 * This gives accurate text rendering for every script the device has fonts
 * for — including Hindi and other Indic scripts — and selectable text.
 */

export interface PageOptions {
  size: 'A4' | 'Letter' | 'Legal';
  orientation: 'portrait' | 'landscape';
  marginMm: number;
  fontSizePt: number;
  font: 'sans' | 'serif' | 'mono';
}

export const DEFAULT_PAGE: PageOptions = { size: 'A4', orientation: 'portrait', marginMm: 18, fontSizePt: 11, font: 'sans' };

const FONTS: Record<PageOptions['font'], string> = {
  sans: 'system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", "Noto Sans Devanagari", "Nirmala UI", Mangal, sans-serif',
  serif: 'Georgia, "Times New Roman", "Noto Serif", "Noto Serif Devanagari", "Nirmala UI", Mangal, serif',
  mono: 'ui-monospace, "SF Mono", Consolas, "Noto Sans Mono", "Nirmala UI", monospace',
};

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** A standalone, print-ready HTML document. `bodyHtml` must already be sanitised. */
export function documentHtml(bodyHtml: string, title: string, o: PageOptions = DEFAULT_PAGE, extraCss = ''): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob: https: http:; style-src 'unsafe-inline'">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
@page { size: ${o.size} ${o.orientation}; margin: ${o.marginMm}mm; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { font-family: ${FONTS[o.font]}; font-size: ${o.fontSizePt}pt; line-height: 1.55; color: #111; max-width: 820px; margin: 24px auto; padding: 0 16px; }
@media print { body { max-width: none; margin: 0; padding: 0; } }
h1, h2, h3, h4 { line-height: 1.25; page-break-after: avoid; break-after: avoid; }
h1 { font-size: 1.9em; } h2 { font-size: 1.5em; border-bottom: 1px solid #ddd; padding-bottom: .2em; } h3 { font-size: 1.2em; }
pre, code { font-family: ${FONTS.mono}; font-size: .92em; }
code { background: #f3f4f6; padding: .1em .3em; border-radius: 3px; }
pre { background: #f6f8fa; padding: 10px 12px; border-radius: 6px; white-space: pre-wrap; word-break: break-word; }
pre code { background: none; padding: 0; }
blockquote { margin: 0; padding: 0 1em; color: #555; border-left: 4px solid #ddd; }
table { border-collapse: collapse; width: 100%; margin: 1em 0; } th, td { border: 1px solid #ccc; padding: 5px 8px; text-align: left; vertical-align: top; } th { background: #f3f4f6; }
tr, img, pre, blockquote, table { break-inside: avoid; }
img { max-width: 100%; height: auto; }
a { color: #1d4ed8; }
hr { border: none; border-top: 1px solid #ddd; margin: 1.5em 0; }
ul.contains-task-list, li.task-list-item { list-style: none; }
.plain { white-space: pre-wrap; word-break: break-word; margin: 0; font-family: inherit; }
${extraCss}
</style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}

export const plainTextHtml = (text: string) => `<pre class="plain">${escapeHtml(text)}</pre>`;

/**
 * Open the browser print dialog for an HTML document via a hidden iframe.
 * Resolves when the dialog has been shown (the user may still cancel it).
 */
export function printHtml(html: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    const cleanup = () => setTimeout(() => frame.remove(), 1000);
    frame.onload = () => {
      const w = frame.contentWindow;
      if (!w) {
        cleanup();
        reject(new Error('Printing is not available in this browser.'));
        return;
      }
      w.addEventListener('afterprint', cleanup);
      // Give fonts a moment to load before printing.
      setTimeout(() => {
        try {
          w.focus();
          w.print();
          resolve();
        } catch (err) {
          reject(err);
        } finally {
          setTimeout(() => frame.remove(), 60_000);
        }
      }, 250);
    };
    frame.srcdoc = html;
    document.body.appendChild(frame);
  });
}
