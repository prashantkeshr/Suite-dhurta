import type { ComponentType } from 'react';

export type ToolStatus = 'available' | 'beta' | 'limited' | 'coming-soon' | 'unavailable';

/** Where the work happens. `external` tools must never be labelled local. */
export type ProcessingMode = 'client' | 'external';

export type OfflineSupport = 'yes' | 'no' | 'limited';

export type CategoryId =
  | 'image'
  | 'pdf'
  | 'documents'
  | 'spreadsheets'
  | 'presentations'
  | 'text'
  | 'developer'
  | 'security'
  | 'generators'
  | 'calculators'
  | 'converters'
  | 'files';

export type Intent = 'convert' | 'compress' | 'edit' | 'create' | 'analyze';

export interface ToolHelp {
  problems?: string[];
  fileSize?: string;
  browsers?: string;
  troubleshooting?: string[];
}

export interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  category: CategoryId;
  /** lucide-react icon name */
  icon: string;
  status: ToolStatus;
  processing: ProcessingMode;
  offline: OfflineSupport;
  batch: boolean;
  /** Accepted MIME types or extensions (".csv"). Empty = no file input. */
  inputTypes: string[];
  outputTypes: string[];
  intents: Intent[];
  keywords: string[];
  aliases?: string[];
  limitations?: string[];
  /** Browser APIs required; checked against capability detection. */
  requires?: CapabilityKey[];
  /** Why a coming-soon tool is not shipped yet. */
  reason?: string;
  /** Short verb label shown in file-action suggestions ("Resize"). */
  actionLabel?: string;
  related?: string[];
  help?: ToolHelp;
  popular?: boolean;
  maxRecommendedBytes?: number;
  /** Name of the external service, required when processing === 'external'. */
  externalService?: { name: string; url: string };
}

export interface ToolModule {
  default: ComponentType<{ tool: ToolDefinition; initialFiles?: File[] }>;
}

export type CapabilityKey =
  | 'workers'
  | 'offscreenCanvas'
  | 'wasm'
  | 'fileSystemAccess'
  | 'directoryPicker'
  | 'indexedDB'
  | 'webCrypto'
  | 'serviceWorker'
  | 'webShare'
  | 'clipboardWrite'
  | 'clipboardRead'
  | 'barcodeDetector'
  | 'camera'
  | 'webpEncode'
  | 'avifEncode'
  | 'compressionStreams';
