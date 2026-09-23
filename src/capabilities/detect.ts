import type { CapabilityKey } from '@/types/tool';

/**
 * Browser capability detection. Feature detection only — never user-agent
 * sniffing. Results are cached; async checks (image encoders) are resolved once.
 */

export interface CapabilityInfo {
  key: CapabilityKey;
  label: string;
  supported: boolean;
  note?: string;
}

const LABELS: Record<CapabilityKey, string> = {
  workers: 'Web Workers',
  offscreenCanvas: 'OffscreenCanvas (image processing off the main thread)',
  wasm: 'WebAssembly',
  fileSystemAccess: 'File System Access (native save dialog)',
  directoryPicker: 'Folder access',
  indexedDB: 'IndexedDB (local storage)',
  webCrypto: 'Web Crypto',
  serviceWorker: 'Service Worker (offline support)',
  webShare: 'Web Share',
  clipboardWrite: 'Clipboard write',
  clipboardRead: 'Clipboard read',
  barcodeDetector: 'Barcode / QR detection',
  camera: 'Camera access',
  webpEncode: 'WebP encoding',
  avifEncode: 'AVIF encoding',
  compressionStreams: 'Compression Streams',
};

const g = globalThis as unknown as Record<string, unknown>;

function syncChecks(): Omit<Record<CapabilityKey, boolean>, 'webpEncode' | 'avifEncode'> {
  const nav = (typeof navigator !== 'undefined' ? navigator : {}) as Navigator & Record<string, unknown>;
  return {
    workers: typeof Worker !== 'undefined',
    offscreenCanvas: typeof g.OffscreenCanvas === 'function',
    wasm: typeof WebAssembly === 'object' && typeof WebAssembly.instantiate === 'function',
    fileSystemAccess: typeof g.showSaveFilePicker === 'function',
    directoryPicker: typeof g.showDirectoryPicker === 'function',
    indexedDB: typeof indexedDB !== 'undefined',
    webCrypto: typeof crypto !== 'undefined' && !!crypto.subtle && typeof crypto.getRandomValues === 'function',
    serviceWorker: 'serviceWorker' in nav,
    webShare: typeof nav.share === 'function',
    clipboardWrite: !!nav.clipboard && typeof nav.clipboard.writeText === 'function',
    clipboardRead: !!nav.clipboard && typeof nav.clipboard.readText === 'function',
    barcodeDetector: typeof g.BarcodeDetector === 'function',
    camera: !!nav.mediaDevices && typeof nav.mediaDevices.getUserMedia === 'function',
    compressionStreams: typeof g.CompressionStream === 'function',
  };
}

let cachedSync: ReturnType<typeof syncChecks> | null = null;
export function capabilities() {
  if (!cachedSync) cachedSync = syncChecks();
  return cachedSync;
}

export function supports(key: CapabilityKey): boolean {
  if (key === 'webpEncode' || key === 'avifEncode') return encoderCache[key === 'webpEncode' ? 'image/webp' : 'image/avif'] ?? true;
  return capabilities()[key];
}

const encoderCache: Record<string, boolean | undefined> = {};

/**
 * Can the canvas encode this image type? Browsers silently fall back to PNG
 * when they cannot, so we check the resulting blob type.
 */
export async function canEncode(mime: string): Promise<boolean> {
  if (encoderCache[mime] !== undefined) return encoderCache[mime]!;
  if (typeof document === 'undefined') return false;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 2;
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, mime, 0.8));
  encoderCache[mime] = !!blob && blob.type === mime;
  return encoderCache[mime]!;
}

export async function allCapabilities(): Promise<CapabilityInfo[]> {
  const sync = capabilities();
  const [webp, avif] = await Promise.all([canEncode('image/webp'), canEncode('image/avif')]);
  const all: Record<CapabilityKey, boolean> = { ...sync, webpEncode: webp, avifEncode: avif };
  return (Object.keys(LABELS) as CapabilityKey[]).map((key) => ({ key, label: LABELS[key], supported: all[key] }));
}

export function missingCapabilities(required: CapabilityKey[] = []): CapabilityKey[] {
  return required.filter((k) => !supports(k));
}

export const capabilityLabel = (k: CapabilityKey) => LABELS[k];

/** Device memory in GB, when the browser exposes it (Chromium only). */
export const deviceMemory = (): number | undefined => (navigator as unknown as { deviceMemory?: number }).deviceMemory;
