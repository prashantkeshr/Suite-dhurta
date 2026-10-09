/**
 * Offline password-strength estimate. Everything is computed locally — the
 * password is never sent anywhere. The estimate is a transparent entropy model
 * with penalties for predictable patterns, not a guarantee; it is deliberately
 * conservative so it never overstates safety. Pure, so it is unit-tested.
 */

export interface StrengthResult {
  /** Estimated guessing entropy in bits. */
  bits: number;
  /** 0 very weak … 4 very strong. */
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  crackTime: string;
  warnings: string[];
  suggestions: string[];
}

// A small set of the most-used passwords; a real attacker tries these first.
const COMMON = new Set([
  'password', 'passw0rd', '123456', '12345678', '123456789', 'qwerty', 'qwertyuiop', 'abc123', '111111', '123123', 'admin', 'letmein', 'welcome', 'monkey', 'dragon', 'iloveyou',
  'sunshine', 'princess', 'football', 'master', 'login', 'password1', 'india', 'cricket', 'bharat', 'om', 'ganesh', 'krishna', 'shiva', 'india123', 'qwerty123', 'p@ssw0rd', 'aA123456',
]);
const KEYBOARD = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm', '1234567890', 'qwerty', 'asdfgh'];

function charsetSize(pw: string): number {
  let size = 0;
  if (/[a-z]/.test(pw)) size += 26;
  if (/[A-Z]/.test(pw)) size += 26;
  if (/[0-9]/.test(pw)) size += 10;
  if (/[^a-zA-Z0-9]/.test(pw)) size += 33;
  if (/[^\x00-\x7f]/.test(pw)) size += 100; // non-ASCII (Unicode) adds a lot
  return size || 1;
}

/** Number of distinct character classes used. */
const classes = (pw: string) => [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter((re) => re.test(pw)).length;

function hasSequence(pw: string): boolean {
  const low = pw.toLowerCase();
  for (const row of KEYBOARD) for (let i = 0; i + 4 <= row.length; i++) if (low.includes(row.slice(i, i + 4))) return true;
  // Ascending/descending runs like "abcd" or "4321".
  let asc = 1;
  let desc = 1;
  for (let i = 1; i < low.length; i++) {
    const d = low.charCodeAt(i) - low.charCodeAt(i - 1);
    asc = d === 1 ? asc + 1 : 1;
    desc = d === -1 ? desc + 1 : 1;
    if (asc >= 4 || desc >= 4) return true;
  }
  return false;
}

const hasRepeat = (pw: string) => /(.)\1{2,}/.test(pw) || /^(.{1,3})\1+$/.test(pw);

export function crackTimeText(bits: number, guessesPerSecond = 1e10): string {
  const seconds = 2 ** (bits - 1) / guessesPerSecond;
  const MIN = 60, HOUR = 3600, DAY = 86_400, YEAR = 31_557_600;
  if (seconds < 0.001) return 'instantly';
  if (seconds < 1) return 'less than a second';
  if (seconds < MIN) return `${Math.round(seconds)} seconds`;
  if (seconds < HOUR) return `${Math.round(seconds / MIN)} minutes`;
  if (seconds < DAY) return `${Math.round(seconds / HOUR)} hours`;
  if (seconds < YEAR) return `${Math.round(seconds / DAY)} days`;
  const years = seconds / YEAR;
  if (years < 1e3) return `${Math.round(years)} years`;
  if (years < 1e6) return `${Math.round(years / 1e3)} thousand years`;
  if (years < 1e9) return `${Math.round(years / 1e6)} million years`;
  if (years < 1e12) return `${Math.round(years / 1e9)} billion years`;
  return 'effectively forever';
}

export function estimateStrength(pw: string): StrengthResult {
  if (!pw) return { bits: 0, score: 0, label: 'Empty', crackTime: 'instantly', warnings: [], suggestions: ['Enter a password to check it.'] };
  const warnings: string[] = [];
  const suggestions: string[] = [];

  const lower = pw.toLowerCase();
  const stripped = lower.replace(/[^a-z]/g, '');
  const common = COMMON.has(lower) || (stripped.length >= 4 && COMMON.has(stripped));

  let bits = pw.length * Math.log2(charsetSize(pw));

  if (common) {
    bits = Math.min(bits, 8);
    warnings.push('This is one of the most common passwords and would be guessed almost immediately.');
  }
  if (hasSequence(pw)) {
    bits *= 0.6;
    warnings.push('It contains a keyboard or number sequence (like “qwerty” or “1234”).');
  }
  if (hasRepeat(pw)) {
    bits *= 0.6;
    warnings.push('It repeats characters or a short pattern.');
  }
  if (/^\d+$/.test(pw)) {
    bits = Math.min(bits, pw.length * Math.log2(10));
    warnings.push('Digits only are quick to guess.');
    if (/^(19|20)\d\d$/.test(pw) || /^\d{6,8}$/.test(pw)) warnings.push('It looks like a date or PIN, which attackers try first.');
  }
  if (classes(pw) === 1 && !/[^\x00-\x7f]/.test(pw)) suggestions.push('Mix upper and lower case, digits and symbols.');
  if (pw.length < 12) suggestions.push('Use at least 12 characters — length matters more than anything else.');

  bits = Math.max(0, Math.round(bits));
  const score: StrengthResult['score'] = bits >= 70 ? 4 : bits >= 55 ? 3 : bits >= 40 ? 2 : bits >= 25 ? 1 : 0;
  const label = ['Very weak', 'Weak', 'Fair', 'Strong', 'Very strong'][score];
  if (score >= 3 && warnings.length === 0) suggestions.length = 0;
  if (suggestions.length === 0 && score < 3) suggestions.push('A short random passphrase of 4–5 words is both strong and easy to remember.');

  return { bits, score, label, crackTime: crackTimeText(bits), warnings, suggestions };
}
