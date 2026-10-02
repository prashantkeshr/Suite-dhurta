import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, AlertTriangle, Loader2, Download, ImagePlus, X, Save, RotateCcw, Copy } from 'lucide-react';
import { clsx } from 'clsx';
import type { ToolDefinition, ToolPreset } from '@/types/tool';
import { Button, Card, Select, TextInput, Toggle } from '@/components/ui/primitives';
import { useSaver } from '@/components/tools/common';
import { toast } from '@/components/ui/Toast';
import { kvGet, kvSet } from '@/storage/kv';
import { useStore } from '@/storage/store';
import { ChoiceRow, ColorField, PickFileButton, RangeField } from './ui';
import { renderQrSvg, designWarnings, DEFAULT_DESIGN, type QrDesign, type DotStyle, type EyeStyle, type Ecc } from './qrRender';
import { svgToCanvas, canvasToBlob, decodeCanvas } from './raster';
import { wifiPayload, upiPayload, vcardPayload, emailPayload, smsPayload, phonePayload, normalizeUrl, isValidVpa, type QrKind, type WifiInput, type UpiInput, type VcardInput } from './payload';

const KINDS: { value: QrKind; label: string }[] = [
  { value: 'url', label: 'Link' },
  { value: 'text', label: 'Text' },
  { value: 'wifi', label: 'Wi-Fi' },
  { value: 'upi', label: 'UPI' },
  { value: 'vcard', label: 'Contact' },
  { value: 'email', label: 'Email' },
  { value: 'sms', label: 'SMS' },
  { value: 'phone', label: 'Phone' },
];

const PRESETS: { name: string; d: Partial<QrDesign> }[] = [
  { name: 'Classic', d: { dotStyle: 'square', eyeStyle: 'square', fg: '#000000', bg: '#ffffff', gradient: false, eyeColor: '' } },
  { name: 'Navy', d: { dotStyle: 'rounded', eyeStyle: 'rounded', fg: '#030c25', bg: '#ffffff', gradient: false, eyeColor: '#4f46e5' } },
  { name: 'Violet glow', d: { dotStyle: 'fluid', eyeStyle: 'rounded', fg: '#4338ca', fg2: '#0891b2', bg: '#ffffff', gradient: true, eyeColor: '' } },
  { name: 'Dots', d: { dotStyle: 'dots', eyeStyle: 'circle', fg: '#0f766e', bg: '#ffffff', gradient: false, eyeColor: '#134e4a' } },
  { name: 'Leaf', d: { dotStyle: 'rounded', eyeStyle: 'leaf', fg: '#166534', fg2: '#15803d', bg: '#f7fee7', gradient: false, eyeColor: '#14532d' } },
];

const BRAND_KEY = 'qr-brand-style';
const SCAN_SIZES = [300, 420, 600];
const MAX_LOGO_BYTES = 3 * 1024 * 1024;

/** Read a logo file as a data URL; raster images are downscaled to keep exports small. */
async function readLogo(file: File): Promise<string> {
  if (file.size > MAX_LOGO_BYTES) throw new Error('Choose a logo smaller than 3 MB.');
  if (file.type === 'image/svg+xml' || /\.svg$/i.test(file.name)) {
    const text = await file.text();
    return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(text)))}`;
  }
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 512 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return c.toDataURL('image/png');
}

type ScanState = 'idle' | 'checking' | 'ok' | 'fail';

export default function QrGeneratorTool({ preset }: { tool: ToolDefinition; preset?: ToolPreset }) {
  const save = useSaver();
  const addHistory = useStore((s) => s.addHistory);
  const [kind, setKind] = useState<QrKind>(() => (KINDS.some((k) => k.value === preset?.kind) ? (preset!.kind as QrKind) : 'url'));
  const [url, setUrl] = useState('https://suite.dhurta.org');
  const [text, setText] = useState('');
  const [wifi, setWifi] = useState<WifiInput>({ ssid: '', password: '', security: 'WPA', hidden: false });
  const [upi, setUpi] = useState<UpiInput>({ vpa: '', name: '', amount: '', note: '' });
  const [vc, setVc] = useState<VcardInput>({ firstName: '', lastName: '', org: '', title: '', phone: '', email: '', website: '', address: '' });
  const [mail, setMail] = useState({ to: '', subject: '', body: '' });
  const [sms, setSms] = useState({ phone: '', message: '' });
  const [phone, setPhone] = useState('');
  const [d, setD] = useState<QrDesign>(DEFAULT_DESIGN);
  const [brand, setBrand] = useState<QrDesign | null>(null);
  const [pngSize, setPngSize] = useState('1024');
  const [scan, setScan] = useState<ScanState>('idle');
  const set = (p: Partial<QrDesign>) => setD((x) => ({ ...x, ...p }));

  useEffect(() => {
    void kvGet<QrDesign>(BRAND_KEY).then((b) => {
      if (b) {
        setBrand(b);
        setD({ ...DEFAULT_DESIGN, ...b });
      }
    });
  }, []);

  const { payload, problem } = useMemo((): { payload: string; problem?: string } => {
    switch (kind) {
      case 'url':
        return { payload: normalizeUrl(url) };
      case 'text':
        return { payload: text };
      case 'wifi':
        return wifi.ssid.trim() ? { payload: wifiPayload(wifi) } : { payload: '', problem: 'Enter the network name (SSID).' };
      case 'upi':
        if (!upi.vpa.trim()) return { payload: '', problem: 'Enter a UPI ID, e.g. name@okbank.' };
        return { payload: upiPayload(upi), problem: isValidVpa(upi.vpa) ? undefined : 'That UPI ID does not look valid (expected name@bank).' };
      case 'vcard':
        return [vc.firstName, vc.lastName, vc.org].some((s) => s.trim()) ? { payload: vcardPayload(vc) } : { payload: '', problem: 'Enter a name or organisation.' };
      case 'email':
        return mail.to.trim() ? { payload: emailPayload(mail.to, mail.subject, mail.body) } : { payload: '', problem: 'Enter an email address.' };
      case 'sms':
        return sms.phone.trim() ? { payload: smsPayload(sms.phone, sms.message) } : { payload: '', problem: 'Enter a phone number.' };
      case 'phone':
        return phone.trim() ? { payload: phonePayload(phone) } : { payload: '', problem: 'Enter a phone number.' };
    }
  }, [kind, url, text, wifi, upi, vc, mail, sms, phone]);

  const render = useMemo(() => {
    if (!payload) return null;
    try {
      return renderQrSvg(payload, d, 512);
    } catch (err) {
      return { error: /too big/i.test((err as Error).message) ? 'Too much content for one QR code. Shorten the text or link.' : (err as Error).message };
    }
  }, [payload, d]);
  const ok = render && !('error' in render) ? render : null;
  const warnings = ok ? designWarnings(d, ok) : [];

  // Scan check: rasterise the exact design and decode it again.
  useEffect(() => {
    if (!ok) return setScan('idle');
    setScan('checking');
    let cancelled = false;
    const h = setTimeout(async () => {
      try {
        // Try the sizes a phone camera typically captures; styled dots read best slightly soft.
        let pass = false;
        for (const w of SCAN_SIZES) {
          if (cancelled) return;
          if (decodeCanvas(await svgToCanvas(ok.svg, w), '#ffffff') === payload) {
            pass = true;
            break;
          }
        }
        if (!cancelled) setScan(pass ? 'ok' : 'fail');
      } catch {
        if (!cancelled) setScan('fail');
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(h);
    };
  }, [ok?.svg, payload]); // eslint-disable-line react-hooks/exhaustive-deps

  const previewUrl = useMemo(() => (ok ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(ok.svg)}` : ''), [ok]);
  const baseName = `qr-${kind}`;

  const downloadPng = async () => {
    if (!ok) return;
    const canvas = await svgToCanvas(ok.svg, Number(pngSize));
    await save(await canvasToBlob(canvas), `${baseName}.png`);
    addHistory('qr-generator', `QR code (${KINDS.find((k) => k.value === kind)?.label}) → PNG`);
  };
  const downloadSvg = async () => {
    if (!ok) return;
    await save(new Blob([ok.svg], { type: 'image/svg+xml' }), `${baseName}.svg`);
    addHistory('qr-generator', `QR code (${KINDS.find((k) => k.value === kind)?.label}) → SVG`);
  };
  const copyPng = async () => {
    if (!ok) return;
    try {
      const canvas = await svgToCanvas(ok.svg, 1024);
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': await canvasToBlob(canvas) })]);
      toast.success('QR code copied as an image');
    } catch {
      toast.error('This browser cannot copy images. Download the PNG instead.');
    }
  };
  const canCopyImage = typeof ClipboardItem !== 'undefined' && !!navigator.clipboard?.write;

  const onLogo = async (file: File) => {
    try {
      set({ logo: await readLogo(file) });
    } catch (err) {
      toast.error((err as Error).message || 'Could not read that image.');
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
      {/* Content */}
      <Card className="min-w-0 space-y-4 p-4 lg:col-start-1">
          <ChoiceRow label="QR code for" value={kind} onChange={setKind} options={KINDS} />
          {kind === 'url' && <TextInput label="Website link" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com" inputMode="url" />}
          {kind === 'text' && (
            <div>
              <label htmlFor="qr-text" className="label">
                Text
              </label>
              <textarea id="qr-text" className="input min-h-[96px] py-2" value={text} onChange={(e) => setText(e.target.value)} placeholder="Any text — Hindi and emoji work too" />
            </div>
          )}
          {kind === 'wifi' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <TextInput label="Network name (SSID)" value={wifi.ssid} onChange={(e) => setWifi({ ...wifi, ssid: e.target.value })} />
              <Select label="Security" value={wifi.security} onChange={(e) => setWifi({ ...wifi, security: e.target.value as WifiInput['security'] })} options={[{ value: 'WPA', label: 'WPA / WPA2 / WPA3' }, { value: 'WEP', label: 'WEP (old)' }, { value: 'nopass', label: 'None (open)' }]} />
              {wifi.security !== 'nopass' && <TextInput label="Password" value={wifi.password} onChange={(e) => setWifi({ ...wifi, password: e.target.value })} autoComplete="off" />}
              <Toggle checked={wifi.hidden} onChange={(v) => setWifi({ ...wifi, hidden: v })} label="Hidden network" />
              <p className="text-xs text-muted sm:col-span-2">Anyone who scans this code can join the network and read the password. It is generated on your device and never sent anywhere.</p>
            </div>
          )}
          {kind === 'upi' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <TextInput label="UPI ID (VPA)" value={upi.vpa} onChange={(e) => setUpi({ ...upi, vpa: e.target.value })} placeholder="shopname@okaxis" autoComplete="off" />
              <TextInput label="Payee name" value={upi.name} onChange={(e) => setUpi({ ...upi, name: e.target.value })} />
              <TextInput label="Amount (₹, optional)" value={upi.amount} onChange={(e) => setUpi({ ...upi, amount: e.target.value.replace(/[^\d.]/g, '') })} inputMode="decimal" hint="Leave empty to let the payer enter the amount." />
              <TextInput label="Note (optional)" value={upi.note} onChange={(e) => setUpi({ ...upi, note: e.target.value })} maxLength={50} />
              <p className="text-xs text-muted sm:col-span-2">Works with any UPI app (Google Pay, PhonePe, Paytm, BHIM…). Scan it once yourself to confirm the payee name before printing.</p>
            </div>
          )}
          {kind === 'vcard' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <TextInput label="First name" value={vc.firstName} onChange={(e) => setVc({ ...vc, firstName: e.target.value })} />
              <TextInput label="Last name" value={vc.lastName} onChange={(e) => setVc({ ...vc, lastName: e.target.value })} />
              <TextInput label="Organisation" value={vc.org} onChange={(e) => setVc({ ...vc, org: e.target.value })} />
              <TextInput label="Job title" value={vc.title} onChange={(e) => setVc({ ...vc, title: e.target.value })} />
              <TextInput label="Phone" value={vc.phone} onChange={(e) => setVc({ ...vc, phone: e.target.value })} inputMode="tel" />
              <TextInput label="Email" value={vc.email} onChange={(e) => setVc({ ...vc, email: e.target.value })} inputMode="email" />
              <TextInput label="Website" value={vc.website} onChange={(e) => setVc({ ...vc, website: e.target.value })} inputMode="url" />
              <TextInput label="Address" value={vc.address} onChange={(e) => setVc({ ...vc, address: e.target.value })} />
            </div>
          )}
          {kind === 'email' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <TextInput label="To" value={mail.to} onChange={(e) => setMail({ ...mail, to: e.target.value })} inputMode="email" />
              <TextInput label="Subject" value={mail.subject} onChange={(e) => setMail({ ...mail, subject: e.target.value })} />
              <div className="sm:col-span-2">
                <label htmlFor="qr-mail" className="label">
                  Message
                </label>
                <textarea id="qr-mail" className="input min-h-[80px] py-2" value={mail.body} onChange={(e) => setMail({ ...mail, body: e.target.value })} />
              </div>
            </div>
          )}
          {kind === 'sms' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <TextInput label="Phone number" value={sms.phone} onChange={(e) => setSms({ ...sms, phone: e.target.value })} inputMode="tel" placeholder="+91 98xxxxxxxx" />
              <TextInput label="Message" value={sms.message} onChange={(e) => setSms({ ...sms, message: e.target.value })} />
            </div>
          )}
          {kind === 'phone' && <TextInput label="Phone number" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="+91 98xxxxxxxx" />}
      </Card>

      {/* Design — after the preview on phones so changes are visible, left column on desktop */}
      <Card className="order-last min-w-0 space-y-4 p-4 lg:order-none lg:col-start-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Design</h2>
            <div className="flex flex-wrap gap-1">
              <Button
                size="sm"
                icon={<Save size={14} />}
                onClick={async () => {
                  await kvSet(BRAND_KEY, d);
                  setBrand(d);
                  toast.success('Saved as your brand style on this device');
                }}
              >
                Save as my brand style
              </Button>
              <Button size="sm" variant="ghost" icon={<RotateCcw size={14} />} onClick={() => setD(DEFAULT_DESIGN)}>
                Reset
              </Button>
            </div>
          </div>
          <div>
            <span className="label">Presets</span>
            <div className="flex flex-wrap gap-1.5">
              {brand && (
                <Button size="sm" variant="primary" onClick={() => setD({ ...DEFAULT_DESIGN, ...brand })}>
                  My brand
                </Button>
              )}
              {PRESETS.map((p) => (
                <Button key={p.name} size="sm" onClick={() => set(p.d)}>
                  {p.name}
                </Button>
              ))}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <ChoiceRow<DotStyle> label="Dots" value={d.dotStyle} onChange={(v) => set({ dotStyle: v })} options={[{ value: 'square', label: 'Square' }, { value: 'rounded', label: 'Rounded' }, { value: 'dots', label: 'Dots' }, { value: 'fluid', label: 'Fluid' }]} />
            <ChoiceRow<EyeStyle> label="Corners (eyes)" value={d.eyeStyle} onChange={(v) => set({ eyeStyle: v })} options={[{ value: 'square', label: 'Square' }, { value: 'rounded', label: 'Rounded' }, { value: 'circle', label: 'Circle' }, { value: 'leaf', label: 'Leaf' }]} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <ColorField label={d.gradient ? 'Code colour (start)' : 'Code colour'} value={d.fg} onChange={(v) => set({ fg: v })} />
            {d.gradient ? <ColorField label="Code colour (end)" value={d.fg2} onChange={(v) => set({ fg2: v })} /> : <div className="hidden sm:block" />}
            <ColorField label="Corner colour" value={d.eyeColor || d.fg} onChange={(v) => set({ eyeColor: v })} />
            <ColorField label="Background" value={d.bg} onChange={(v) => set({ bg: v })} disabled={d.transparent} />
          </div>
          <div className="grid gap-x-6 sm:grid-cols-2">
            <Toggle checked={d.gradient} onChange={(v) => set({ gradient: v })} label="Gradient" />
            <Toggle checked={!d.eyeColor} onChange={(v) => set({ eyeColor: v ? '' : d.fg })} label="Corners match code colour" />
            <Toggle checked={d.transparent} onChange={(v) => set({ transparent: v })} label="Transparent background" />
          </div>

          <div className="space-y-3 border-t border-line pt-4">
            <span className="label">Logo</span>
            <div className="flex flex-wrap items-center gap-2">
              {d.logo && <img src={d.logo} alt="Your logo" className="h-10 w-10 rounded border border-line bg-white object-contain p-0.5" />}
              <PickFileButton accept="image/png,image/jpeg,image/webp,image/svg+xml" onFile={onLogo}>
                <ImagePlus size={16} aria-hidden /> {d.logo ? 'Change logo' : 'Add your logo'}
              </PickFileButton>
              {d.logo && (
                <Button size="md" variant="ghost" icon={<X size={16} />} onClick={() => set({ logo: undefined })}>
                  Remove
                </Button>
              )}
              <Button
                size="md"
                variant="ghost"
                onClick={async () => {
                  const res = await fetch(`${import.meta.env.BASE_URL}brand/mark-light.png`);
                  const blob = await res.blob();
                  void onLogo(new File([blob], 'dhurta.png', { type: 'image/png' }));
                }}
              >
                Try with sample logo
              </Button>
            </div>
            {d.logo && (
              <div className="grid gap-x-6 sm:grid-cols-2">
                <RangeField label="Logo size" value={d.logoSize} min={0.12} max={0.3} step={0.01} onChange={(v) => set({ logoSize: v })} format={(v) => `${Math.round(v * 100)}%`} />
                <Toggle checked={d.logoPlate} onChange={(v) => set({ logoPlate: v })} label="Clear space behind logo" description="Recommended: keeps the logo readable." />
                <p className="text-xs text-muted sm:col-span-2">With a logo, error correction is set to High (H) so the code can still be read with part of it covered. PNG, JPG, WebP or SVG; the logo stays on your device.</p>
              </div>
            )}
          </div>

          <div className="grid gap-4 border-t border-line pt-4 sm:grid-cols-2">
            <ChoiceRow label="Frame" value={d.frame} onChange={(v) => set({ frame: v })} options={[{ value: 'none', label: 'None' }, { value: 'caption', label: 'Caption' }]} />
            {d.frame === 'caption' && <TextInput label="Caption" value={d.caption} maxLength={40} onChange={(e) => set({ caption: e.target.value })} />}
          </div>

          <div className="grid gap-4 border-t border-line pt-4 sm:grid-cols-2">
            <Select
              label="Error correction"
              value={d.logo ? 'H' : d.ecc}
              disabled={!!d.logo}
              onChange={(e) => set({ ecc: e.target.value as Ecc })}
              options={[
                { value: 'L', label: 'Low (7%) — smallest code' },
                { value: 'M', label: 'Medium (15%) — recommended' },
                { value: 'Q', label: 'Quartile (25%)' },
                { value: 'H', label: 'High (30%) — for logos, rough surfaces' },
              ]}
            />
            <RangeField label="Quiet zone (margin)" value={d.margin} min={0} max={8} step={1} onChange={(v) => set({ margin: v })} format={(v) => `${v} modules`} />
          </div>
      </Card>

      {/* Preview */}
      <div className="lg:sticky lg:top-20 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:h-fit">
        <Card className="space-y-3 p-4">
          <div className="checker flex aspect-square items-center justify-center overflow-hidden rounded-lg border border-line p-3">
            {ok ? <img src={previewUrl} alt="QR code preview" className="max-h-full max-w-full" /> : <p className="px-6 text-center text-sm text-muted">{render && 'error' in render ? render.error : problem ?? 'Enter content to create a QR code.'}</p>}
          </div>
          {ok && problem && <p className="text-sm text-warning">{problem}</p>}
          {ok && (
            <div
              role="status"
              className={clsx(
                'flex items-start gap-2 rounded-md border px-3 py-2 text-sm',
                scan === 'ok' && 'border-success/30 bg-success/10 text-success',
                scan === 'fail' && 'border-warning/30 bg-warning/10 text-warning',
                (scan === 'checking' || scan === 'idle') && 'border-line text-muted',
              )}
            >
              {scan === 'ok' ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> : scan === 'fail' ? <AlertTriangle size={16} className="mt-0.5 shrink-0" /> : <Loader2 size={16} className="mt-0.5 shrink-0 animate-spin" />}
              <span>
                {scan === 'ok' && 'Scan check passed: this design decodes to exactly your content.'}
                {scan === 'fail' && 'Our scan check could not read this design. Increase contrast, make the logo smaller, or pick a simpler style — then test with your phone.'}
                {(scan === 'checking' || scan === 'idle') && 'Checking that the design scans…'}
              </span>
            </div>
          )}
          {warnings.map((w) => (
            <p key={w} className="flex gap-2 text-xs text-warning">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {w}
            </p>
          ))}
          {ok && (
            <>
              <div className="grid grid-cols-[1fr_auto] items-end gap-2">
                <Select label="PNG size" value={pngSize} onChange={(e) => setPngSize(e.target.value)} options={['512', '1024', '2048', '4096'].map((v) => ({ value: v, label: `${v} px` }))} />
                <Button variant="primary" icon={<Download size={16} />} onClick={downloadPng}>
                  PNG
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button icon={<Download size={16} />} onClick={downloadSvg}>
                  SVG (print)
                </Button>
                {canCopyImage && (
                  <Button icon={<Copy size={16} />} onClick={copyPng}>
                    Copy image
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted">
                Version {ok.version} · {ok.modules}×{ok.modules} modules · error correction {d.logo ? 'H' : d.ecc}. Print at least 2 × 2 cm; scanning distance is roughly 10× the printed width.
              </p>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
