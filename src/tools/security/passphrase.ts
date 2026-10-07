/** Diceware-style passphrases from the EFF long word list (pure, unit-tested). */

export interface PassphraseOptions {
  words: number;
  separator: string;
  capitalize: boolean;
  /** Append one random digit to a random word (helps sites that demand a number). */
  digit: boolean;
}

/** Uniform random integer in [0, max) from a crypto source, without modulo bias. */
export function randomIndex(max: number, rand: (buf: Uint32Array) => Uint32Array = (b) => crypto.getRandomValues(b)): number {
  const limit = Math.floor(0x1_0000_0000 / max) * max;
  const buf = new Uint32Array(1);
  for (;;) {
    rand(buf);
    if (buf[0] < limit) return buf[0] % max;
  }
}

export function passphrase(list: readonly string[], o: PassphraseOptions, rand?: (buf: Uint32Array) => Uint32Array): string {
  const picked = Array.from({ length: o.words }, () => list[randomIndex(list.length, rand)]);
  const words = o.capitalize ? picked.map((w) => w[0].toUpperCase() + w.slice(1)) : picked;
  if (o.digit) {
    const at = randomIndex(words.length, rand);
    words[at] += String(randomIndex(10, rand));
  }
  return words.join(o.separator);
}

/** Entropy in bits, assuming the attacker knows the list and the method. */
export function entropyBits(listSize: number, o: Pick<PassphraseOptions, 'words' | 'digit'>): number {
  return o.words * Math.log2(listSize) + (o.digit ? Math.log2(10 * o.words) : 0);
}

/** Rough time to guess half the possibilities at a given rate (default: a large offline attack). */
export function crackTime(bits: number, guessesPerSecond = 1e12): string {
  const seconds = 2 ** (bits - 1) / guessesPerSecond;
  const YEAR = 31_557_600;
  if (seconds < 1) return 'instantly';
  if (seconds < 3600) return `${Math.round(seconds / 60) || 1} minute${Math.round(seconds / 60) > 1 ? 's' : ''}`;
  if (seconds < 86_400) return `${Math.round(seconds / 3600)} hours`;
  if (seconds < YEAR) return `${Math.round(seconds / 86_400)} days`;
  const years = seconds / YEAR;
  if (years < 1e3) return `${Math.round(years)} years`;
  if (years < 1e6) return `${Math.round(years / 1e3)} thousand years`;
  if (years < 1e9) return `${Math.round(years / 1e6)} million years`;
  return `${(years / 1e9).toLocaleString('en', { maximumFractionDigits: 0 })} billion years`;
}
