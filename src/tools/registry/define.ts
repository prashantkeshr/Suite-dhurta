import type { ToolDefinition } from '@/types/tool';

type ToolInput = Omit<ToolDefinition, 'processing' | 'offline' | 'batch' | 'inputTypes' | 'outputTypes' | 'intents' | 'keywords'> &
  Partial<Pick<ToolDefinition, 'processing' | 'offline' | 'batch' | 'inputTypes' | 'outputTypes' | 'intents' | 'keywords'>>;

/** Fill registry defaults so entries stay short. */
export function defineTool(input: ToolInput): ToolDefinition {
  return {
    processing: 'client',
    offline: 'yes',
    batch: false,
    inputTypes: [],
    outputTypes: [],
    intents: [],
    keywords: [],
    ...input,
  };
}

/** Shorthand for a planned tool that is not shipped yet. */
export function planned(
  input: Pick<ToolDefinition, 'id' | 'name' | 'description' | 'category' | 'icon'> &
    Partial<ToolDefinition> & { reason: string },
): ToolDefinition {
  return defineTool({ status: 'coming-soon', offline: 'no', ...input });
}

export const IMAGE_IN = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp', 'image/avif'];
export const RASTER_OUT = ['image/jpeg', 'image/png', 'image/webp'];
export const PDF = ['application/pdf'];

export const PHASE = {
  pdf: 'Scheduled for the PDF core phase. It will ship once it has been tested against real-world documents.',
  data: 'Scheduled for the text & data phase.',
  productivity: 'Scheduled for the productivity phase.',
  office:
    'This conversion requires advanced document rendering that is not currently reliable in a browser-only environment.',
  ai: 'Needs a machine-learning model that is too large or unreliable to run well in every browser today.',
};
