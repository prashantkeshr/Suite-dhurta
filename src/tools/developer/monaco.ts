/**
 * Monaco — the editor component of Visual Studio Code (MIT licence), bundled
 * with the site so it works offline and code never leaves the browser.
 * Language services run in Web Workers that Vite emits as separate files.
 */
import * as monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import CssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import HtmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import TsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';

(self as unknown as { MonacoEnvironment: monaco.Environment }).MonacoEnvironment = {
  getWorker(_id: string, label: string) {
    if (label === 'json') return new JsonWorker();
    if (label === 'css' || label === 'scss' || label === 'less') return new CssWorker();
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new HtmlWorker();
    if (label === 'typescript' || label === 'javascript') return new TsWorker();
    return new EditorWorker();
  },
};

/** Language id for a file name, using Monaco's own extension table. */
export function languageFor(name: string): string {
  const lower = name.toLowerCase();
  const ext = lower.includes('.') ? lower.slice(lower.lastIndexOf('.')) : '';
  for (const lang of monaco.languages.getLanguages()) {
    if (lang.filenames?.some((f) => f.toLowerCase() === lower)) return lang.id;
    if (ext && lang.extensions?.includes(ext)) return lang.id;
  }
  return 'plaintext';
}

export const languages = () =>
  monaco.languages
    .getLanguages()
    .map((l) => ({ id: l.id, label: l.aliases?.[0] ?? l.id }))
    .sort((a, b) => a.label.localeCompare(b.label));

export { monaco };
