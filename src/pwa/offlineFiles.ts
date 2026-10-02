/** Pure helpers for the build's offline manifest (dist/offline.json). Unit-tested. */

export interface OfflineManifest {
  version: string;
  shell: string[];
  tools: Record<string, { files: string[]; bytes: number }>;
  all: string[];
  totalBytes: number;
}

/** Files a tool still needs before it can open with no connection. */
export function missingFiles(m: OfflineManifest, toolId: string, cached: Set<string>, base = '/'): string[] {
  const needed = [...m.shell.filter((f) => f.startsWith('assets/')), ...(m.tools[toolId]?.files ?? [])];
  return needed.filter((f) => !cached.has(base + f));
}

export const isToolReady = (m: OfflineManifest, toolId: string, cached: Set<string>, base = '/') => toolId in m.tools && missingFiles(m, toolId, cached, base).length === 0;

/** Distinct files (and their combined size, when known) needed for a set of tools. */
export function filesFor(m: OfflineManifest, toolIds: string[]): string[] {
  return [...new Set([...m.shell, ...toolIds.flatMap((id) => m.tools[id]?.files ?? [])])];
}
