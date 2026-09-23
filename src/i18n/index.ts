import { en, type MessageKey } from './en';

const dictionaries: Record<string, Partial<Record<MessageKey, string>>> = { en };
let locale = 'en';

export function setLocale(next: string) {
  if (dictionaries[next]) locale = next;
}

/** Translate a UI string. `{name}` placeholders are replaced from `vars`. */
export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  const raw = dictionaries[locale]?.[key] ?? en[key] ?? key;
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{${k}}`));
}

export type { MessageKey };
