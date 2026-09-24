import type { ToolModule } from '@/types/tool';

/**
 * Lazy loaders for tool implementations. Each tool's code (and any heavy
 * library it uses) is only downloaded when its page is opened.
 *
 * Rule enforced by tests: every usable registry tool has a loader here, and no
 * coming-soon tool does.
 */
type Loader = () => Promise<ToolModule>;

const imageBatch: Loader = () => import('./image/ImageBatchTool');
const pdfPages: Loader = () => import('./pdf/PdfPagesTool');
const codec: Loader = () => import('./developer/CodecTool');
const csvJson: Loader = () => import('./data/CsvJsonTool');

export const TOOL_LOADERS: Record<string, Loader> = {
  // Images
  'image-resizer': imageBatch,
  'image-converter': imageBatch,
  'image-compressor': imageBatch,
  'image-rotator': imageBatch,
  'image-flipper': imageBatch,
  'jpg-to-png': imageBatch,
  'png-to-jpg': imageBatch,
  'jpg-to-webp': imageBatch,
  'png-to-webp': imageBatch,
  'webp-to-jpg': imageBatch,
  'webp-to-png': imageBatch,
  'svg-to-png': imageBatch,
  'image-cropper': () => import('./image/ImageCropTool'),
  'image-watermark': () => import('./image/ImageWatermarkTool'),
  'favicon-generator': () => import('./image/FaviconTool'),
  'image-info': () => import('./image/ImageInfoTool'),
  'image-to-base64': () => import('./image/ImageBase64Tool'),
  'base64-to-image': () => import('./image/ImageBase64Tool'),

  // PDF
  'pdf-merge': () => import('./pdf/PdfMergeTool'),
  'pdf-split': pdfPages,
  'pdf-rotate': pdfPages,
  'pdf-delete-pages': pdfPages,
  'pdf-metadata': () => import('./pdf/PdfMetadataTool'),
  'image-to-pdf': () => import('./pdf/ImageToPdfTool'),
  'pdf-to-image': () => import('./pdf/PdfToImageTool'),
  'pdf-to-text': () => import('./pdf/PdfToTextTool'),
  'pdf-organize': () => import('./pdf/PdfOrganizeTool'),
  'pdf-watermark': () => import('./pdf/PdfWatermarkTool'),
  'pdf-page-numbers': () => import('./pdf/PdfPageNumbersTool'),
  'pdf-sign': () => import('./pdf/PdfSignTool'),

  // Text
  'word-counter': () => import('./text/WordCounterTool'),
  'case-converter': () => import('./text/CaseConverterTool'),
  'text-cleaner': () => import('./text/TextCleanerTool'),
  'find-replace': () => import('./text/FindReplaceTool'),
  'slug-generator': () => import('./text/SlugTool'),
  'lorem-ipsum': () => import('./text/LoremTool'),

  // Developer
  'json-formatter': () => import('./developer/JsonFormatterTool'),
  'base64-text': codec,
  'url-encoder': codec,
  'html-entities': codec,
  'url-parser': () => import('./developer/UrlParserTool'),
  'jwt-decoder': () => import('./developer/JwtDecoderTool'),
  'regex-tester': () => import('./developer/RegexTesterTool'),
  'color-converter': () => import('./developer/ColorTool'),

  // Security
  'password-generator': () => import('./security/PasswordTool'),
  'uuid-generator': () => import('./security/RandomIdTool'),
  'random-token': () => import('./security/RandomIdTool'),
  'hash-generator': () => import('./security/HashTool'),

  // Data
  'csv-to-json': csvJson,
  'json-to-csv': csvJson,

  // Calculators & converters
  'percentage-calculator': () => import('./calculators/PercentageTool'),
  'gst-calculator': () => import('./calculators/GstTool'),
  'emi-calculator': () => import('./calculators/EmiTool'),
  'unit-converter': () => import('./calculators/UnitConverterTool'),

  // Files
  'file-info': () => import('./files/FileInfoTool'),
  'zip-creator': () => import('./files/ZipCreatorTool'),
  'zip-extractor': () => import('./files/ZipExtractorTool'),
};
