/** Calculator formulas. Kept pure so they can be unit-tested. */

export interface EmiResult {
  emi: number;
  totalPayment: number;
  totalInterest: number;
  schedule: { month: number; payment: number; principal: number; interest: number; balance: number }[];
}

/** EMI = P·r·(1+r)^n / ((1+r)^n − 1), r = annual rate / 12 / 100. */
export function emi(principal: number, annualRatePct: number, months: number): EmiResult {
  if (!(principal > 0) || !(months > 0) || annualRatePct < 0) throw new Error('Enter a positive loan amount and tenure.');
  const n = Math.round(months);
  const r = annualRatePct / 12 / 100;
  const payment = r === 0 ? principal / n : (principal * r * (1 + r) ** n) / ((1 + r) ** n - 1);
  const schedule: EmiResult['schedule'] = [];
  let balance = principal;
  for (let m = 1; m <= n; m++) {
    const interest = balance * r;
    let princ = payment - interest;
    if (m === n) princ = balance; // absorb rounding in the last instalment
    balance = Math.max(0, balance - princ);
    schedule.push({ month: m, payment: princ + interest, principal: princ, interest, balance });
  }
  const totalPayment = schedule.reduce((a, s) => a + s.payment, 0);
  return { emi: payment, totalPayment, totalInterest: totalPayment - principal, schedule };
}

export interface GstResult {
  net: number;
  gst: number;
  gross: number;
  cgst: number;
  sgst: number;
}

/** Add GST to a net amount, or extract it from a GST-inclusive gross amount. */
export function gst(amount: number, ratePct: number, mode: 'add' | 'remove'): GstResult {
  const rate = ratePct / 100;
  const net = mode === 'add' ? amount : amount / (1 + rate);
  const tax = net * rate;
  return { net, gst: tax, gross: net + tax, cgst: tax / 2, sgst: tax / 2 };
}

export const percentOf = (pct: number, of: number) => (pct / 100) * of;
export const whatPercent = (part: number, whole: number) => (whole === 0 ? NaN : (part / whole) * 100);
export const percentChange = (from: number, to: number) => (from === 0 ? NaN : ((to - from) / Math.abs(from)) * 100);

/* ---------- Units ---------- */

export interface Unit {
  id: string;
  label: string;
  /** Multiply by this to get the base unit. Ignored when `to`/`from` exist. */
  factor?: number;
  toBase?: (v: number) => number;
  fromBase?: (v: number) => number;
}

export interface UnitCategory {
  id: string;
  label: string;
  units: Unit[];
}

const u = (id: string, label: string, factor: number): Unit => ({ id, label, factor });

export const UNIT_CATEGORIES: UnitCategory[] = [
  {
    id: 'length',
    label: 'Length',
    units: [u('mm', 'Millimetre (mm)', 0.001), u('cm', 'Centimetre (cm)', 0.01), u('m', 'Metre (m)', 1), u('km', 'Kilometre (km)', 1000), u('in', 'Inch (in)', 0.0254), u('ft', 'Foot (ft)', 0.3048), u('yd', 'Yard (yd)', 0.9144), u('mi', 'Mile (mi)', 1609.344), u('nmi', 'Nautical mile', 1852), u('um', 'Micrometre (µm)', 1e-6)],
  },
  {
    id: 'area',
    label: 'Area',
    units: [u('mm2', 'mm²', 1e-6), u('cm2', 'cm²', 1e-4), u('m2', 'm²', 1), u('ha', 'Hectare', 1e4), u('km2', 'km²', 1e6), u('in2', 'in²', 0.00064516), u('ft2', 'ft²', 0.09290304), u('yd2', 'yd²', 0.83612736), u('acre', 'Acre', 4046.8564224), u('mi2', 'mi²', 2589988.110336)],
  },
  {
    id: 'volume',
    label: 'Volume',
    units: [u('ml', 'Millilitre (ml)', 1e-3), u('l', 'Litre (l)', 1), u('m3', 'Cubic metre (m³)', 1000), u('cm3', 'cm³', 1e-3), u('tsp', 'Teaspoon (US)', 0.00492892159375), u('tbsp', 'Tablespoon (US)', 0.01478676478125), u('cup', 'Cup (US)', 0.2365882365), u('floz', 'Fluid ounce (US)', 0.0295735295625), u('gal', 'Gallon (US)', 3.785411784), u('galuk', 'Gallon (UK)', 4.54609), u('ft3', 'ft³', 28.316846592)],
  },
  {
    id: 'weight',
    label: 'Weight',
    units: [u('mg', 'Milligram (mg)', 1e-6), u('g', 'Gram (g)', 1e-3), u('kg', 'Kilogram (kg)', 1), u('t', 'Tonne (t)', 1000), u('oz', 'Ounce (oz)', 0.028349523125), u('lb', 'Pound (lb)', 0.45359237), u('st', 'Stone', 6.35029318), u('ct', 'Carat', 0.0002), u('quintal', 'Quintal', 100), u('tola', 'Tola', 0.0116638125)],
  },
  {
    id: 'temperature',
    label: 'Temperature',
    units: [
      { id: 'c', label: 'Celsius (°C)', toBase: (v) => v, fromBase: (v) => v },
      { id: 'f', label: 'Fahrenheit (°F)', toBase: (v) => ((v - 32) * 5) / 9, fromBase: (v) => (v * 9) / 5 + 32 },
      { id: 'k', label: 'Kelvin (K)', toBase: (v) => v - 273.15, fromBase: (v) => v + 273.15 },
    ],
  },
  {
    id: 'speed',
    label: 'Speed',
    units: [u('mps', 'Metre/second', 1), u('kmh', 'Kilometre/hour', 1 / 3.6), u('mph', 'Mile/hour', 0.44704), u('kn', 'Knot', 1852 / 3600), u('fps', 'Foot/second', 0.3048)],
  },
  {
    id: 'time',
    label: 'Time',
    units: [u('ms', 'Millisecond', 0.001), u('s', 'Second', 1), u('min', 'Minute', 60), u('h', 'Hour', 3600), u('d', 'Day', 86400), u('wk', 'Week', 604800), u('mo', 'Month (avg)', 2629746), u('yr', 'Year (365.2425 d)', 31556952)],
  },
  {
    id: 'data',
    label: 'Data storage',
    units: [u('b', 'Bit', 1 / 8), u('B', 'Byte', 1), u('KB', 'Kilobyte (1000)', 1e3), u('MB', 'Megabyte (1000²)', 1e6), u('GB', 'Gigabyte (1000³)', 1e9), u('TB', 'Terabyte (1000⁴)', 1e12), u('KiB', 'Kibibyte (1024)', 1024), u('MiB', 'Mebibyte (1024²)', 1024 ** 2), u('GiB', 'Gibibyte (1024³)', 1024 ** 3), u('TiB', 'Tebibyte (1024⁴)', 1024 ** 4)],
  },
  {
    id: 'pressure',
    label: 'Pressure',
    units: [u('pa', 'Pascal (Pa)', 1), u('kpa', 'Kilopascal (kPa)', 1000), u('mpa', 'Megapascal (MPa)', 1e6), u('bar', 'Bar', 1e5), u('psi', 'PSI', 6894.757293168), u('atm', 'Atmosphere', 101325), u('mmhg', 'mmHg', 133.322387415), u('kgcm2', 'kgf/cm²', 98066.5)],
  },
  {
    id: 'energy',
    label: 'Energy',
    units: [u('j', 'Joule (J)', 1), u('kj', 'Kilojoule (kJ)', 1000), u('cal', 'Calorie (cal)', 4.184), u('kcal', 'Kilocalorie (kcal)', 4184), u('wh', 'Watt-hour (Wh)', 3600), u('kwh', 'Kilowatt-hour (kWh)', 3.6e6), u('btu', 'BTU', 1055.05585262), u('ev', 'Electronvolt (eV)', 1.602176634e-19)],
  },
  {
    id: 'power',
    label: 'Power',
    units: [u('w', 'Watt (W)', 1), u('kw', 'Kilowatt (kW)', 1000), u('mw', 'Megawatt (MW)', 1e6), u('hp', 'Horsepower (mechanical)', 745.69987158227022), u('ps', 'Metric horsepower (PS)', 735.49875), u('btuh', 'BTU/hour', 0.29307107017)],
  },
  {
    id: 'frequency',
    label: 'Frequency',
    units: [u('hz', 'Hertz (Hz)', 1), u('khz', 'Kilohertz (kHz)', 1e3), u('mhz', 'Megahertz (MHz)', 1e6), u('ghz', 'Gigahertz (GHz)', 1e9), u('rpm', 'Revolutions/minute', 1 / 60)],
  },
  {
    id: 'angle',
    label: 'Angle',
    units: [u('deg', 'Degree (°)', Math.PI / 180), u('rad', 'Radian', 1), u('grad', 'Gradian', Math.PI / 200), u('arcmin', 'Arcminute', Math.PI / 10800), u('arcsec', 'Arcsecond', Math.PI / 648000), u('turn', 'Turn', 2 * Math.PI)],
  },
];

export function convertUnit(value: number, from: Unit, to: Unit): number {
  const base = from.toBase ? from.toBase(value) : value * (from.factor ?? 1);
  return to.fromBase ? to.fromBase(base) : base / (to.factor ?? 1);
}

/** Format with sensible precision: up to 10 significant digits, scientific for extremes. */
export function formatValue(v: number): string {
  if (!Number.isFinite(v)) return '—';
  if (v === 0) return '0';
  const abs = Math.abs(v);
  if (abs >= 1e15 || abs < 1e-6) return v.toExponential(6).replace(/\.?0+e/, 'e');
  return Number(v.toPrecision(10)).toLocaleString(undefined, { maximumFractionDigits: 10 });
}

/* ---------- Interest ---------- */

/** Compounding periods per year; 0 = continuous. */
export type Compounding = 1 | 2 | 4 | 12 | 365 | 0;

export interface InterestRow {
  year: number;
  deposited: number;
  interest: number;
  balance: number;
}

export interface InterestResult {
  simpleInterest: number;
  simpleTotal: number;
  maturity: number;
  deposited: number;
  interest: number;
  /** Effective annual rate (%). */
  ear: number;
  rows: InterestRow[];
}

/**
 * Compound growth of a lump sum plus optional deposits at the end of every
 * month. Monthly deposits grow at the monthly rate equivalent to the chosen
 * compounding, so the maths stays exact for any compounding frequency.
 */
export function interest(principal: number, annualRatePct: number, years: number, compounding: Compounding, monthly = 0): InterestResult {
  if (!(principal >= 0) || !(years > 0) || !(annualRatePct >= 0) || !(monthly >= 0)) throw new Error('Enter a positive amount, rate and period.');
  if (principal === 0 && monthly === 0) throw new Error('Enter a starting amount or a monthly deposit.');
  const r = annualRatePct / 100;
  const growth = (t: number) => (compounding === 0 ? Math.exp(r * t) : (1 + r / compounding) ** (compounding * t));
  const i = growth(1 / 12) - 1; // equivalent monthly rate
  const fvDeposits = (months: number) => (i === 0 ? monthly * months : monthly * (((1 + i) ** months - 1) / i));
  const at = (t: number) => {
    const months = Math.floor(t * 12 + 1e-9);
    const balance = principal * growth(t) + fvDeposits(months);
    const deposited = principal + monthly * months;
    return { deposited, balance, interest: balance - deposited };
  };
  const rows: InterestRow[] = [];
  for (let y = 1; y <= Math.floor(years); y++) rows.push({ year: y, ...at(y) });
  if (years % 1 > 1e-9) rows.push({ year: +years.toFixed(2), ...at(years) });
  const end = at(years);
  const simpleInterest = principal * r * years;
  return {
    simpleInterest,
    simpleTotal: principal + simpleInterest,
    maturity: end.balance,
    deposited: end.deposited,
    interest: end.interest,
    ear: (growth(1) - 1) * 100,
    rows,
  };
}

/* ---------- BMI ---------- */

export type BmiScale = 'who' | 'asian';

export interface BmiBand {
  label: string;
  min: number;
  tone: 'info' | 'success' | 'warning' | 'error';
}

/** WHO adult classes, and the lower cut-offs recommended for Asian Indians (Misra et al., 2009; WHO expert consultation, 2004). */
export const BMI_BANDS: Record<BmiScale, BmiBand[]> = {
  who: [
    { label: 'Underweight', min: 0, tone: 'info' },
    { label: 'Healthy weight', min: 18.5, tone: 'success' },
    { label: 'Overweight', min: 25, tone: 'warning' },
    { label: 'Obesity class I', min: 30, tone: 'error' },
    { label: 'Obesity class II', min: 35, tone: 'error' },
    { label: 'Obesity class III', min: 40, tone: 'error' },
  ],
  asian: [
    { label: 'Underweight', min: 0, tone: 'info' },
    { label: 'Healthy weight', min: 18.5, tone: 'success' },
    { label: 'Overweight', min: 23, tone: 'warning' },
    { label: 'Obesity', min: 25, tone: 'error' },
  ],
};

export function bmi(weightKg: number, heightCm: number) {
  if (!(weightKg > 0) || !(heightCm > 0)) throw new Error('Enter your weight and height.');
  const m = heightCm / 100;
  return weightKg / (m * m);
}

export function bmiBand(value: number, scale: BmiScale): BmiBand {
  const bands = BMI_BANDS[scale];
  return [...bands].reverse().find((b) => value >= b.min) ?? bands[0];
}

/** Weight range (kg) for a healthy BMI at this height. */
export function healthyRange(heightCm: number, scale: BmiScale): [number, number] {
  const m2 = (heightCm / 100) ** 2;
  const upper = scale === 'asian' ? 22.9 : 24.9;
  return [18.5 * m2, upper * m2];
}
