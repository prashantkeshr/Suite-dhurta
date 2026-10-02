import { lazy } from 'react';
import { TOOL_LOADERS } from './loaders';

/** One lazy component per tool, so its code downloads only when first shown. */
const cache = new Map<string, ReturnType<typeof lazy>>();
export function lazyTool(id: string) {
  if (!cache.has(id)) cache.set(id, lazy(TOOL_LOADERS[id]));
  return cache.get(id)!;
}
