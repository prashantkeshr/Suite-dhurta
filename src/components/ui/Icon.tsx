import {
  Activity, AppWindow, Barcode, Binary, Blend, Braces, Calculator, CalendarDays, CaseSensitive, Code, Combine, Crop, Dices,
  Eraser, ExternalLink, FileArchive, FileCode, FileImage, FileJson, FileMinus, FilePen, FileSearch, FileText, FileType,
  Fingerprint, FlipHorizontal2, Folder, GitCompare, Globe, Hash, Image, Info, KeyRound, KeySquare, Landmark, LayoutGrid,
  LetterText, Link, Link2, ListFilter, ListOrdered, Lock, Minimize2, PackageOpen, Palette, PenTool, Percent, Pilcrow,
  Presentation, QrCode, Receipt, Regex, Repeat, Replace, RotateCw, Ruler, Scaling, ScanLine, ScanText, Scissors,
  ShieldCheck, Sheet, Sparkles, Stamp, Table, TrendingUp, Type, Wrench, type LucideIcon,
} from 'lucide-react';

/**
 * Registry icons are referenced by name. Only icons listed here are bundled,
 * which keeps lucide tree-shaken.
 */
const ICONS: Record<string, LucideIcon> = {
  Activity, AppWindow, Barcode, Binary, Blend, Braces, Calculator, CalendarDays, CaseSensitive, Code, Combine, Crop, Dices,
  Eraser, ExternalLink, FileArchive, FileCode, FileImage, FileJson, FileMinus, FilePen, FileSearch, FileText, FileType,
  Fingerprint, FlipHorizontal2, Folder, GitCompare, Globe, Hash, Image, Info, KeyRound, KeySquare, Landmark, LayoutGrid,
  LetterText, Link, Link2, ListFilter, ListOrdered, Lock, Minimize2, PackageOpen, Palette, PenTool, Percent, Pilcrow,
  Presentation, QrCode, Receipt, Regex, Repeat, Replace, RotateCw, Ruler, Scaling, ScanLine, ScanText, Scissors,
  ShieldCheck, Sheet, Sparkles, Stamp, Table, TrendingUp, Type,
};

export const hasIcon = (name: string) => name in ICONS;

export function Icon({ name, size = 18, className, label }: { name: string; size?: number; className?: string; label?: string }) {
  const C = ICONS[name] ?? Wrench;
  return <C size={size} className={className} aria-hidden={label ? undefined : true} aria-label={label} strokeWidth={1.75} />;
}
