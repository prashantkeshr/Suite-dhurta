/**
 * Safe expression evaluator for the scientific calculator — a small
 * recursive-descent parser (no eval / Function).
 *
 *   expr    := term (("+" | "-") term)*
 *   term    := unary (("*" | "/" | "mod" | implicit) unary)*
 *   unary   := ("-" | "+") unary | power
 *   power   := postfix ("^" unary)?          (right-associative, -2^2 = -4)
 *   postfix := primary ("!" | "%")*
 *   primary := number | constant | func "(" args ")" | "(" expr ")" | "√" unary
 */

export class CalcError extends Error {}

export type AngleMode = 'deg' | 'rad';

type Tok = { t: 'num'; v: number } | { t: 'id'; v: string } | { t: 'op'; v: string };

const OPS = new Set(['+', '-', '*', '/', '^', '(', ')', ',', '!', '%', '√']);

export function tokenize(src: string): Tok[] {
  const s = src.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/π/g, 'pi').replace(/\*\*/g, '^');
  const out: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (/\s/.test(ch)) {
      i++;
    } else if (/[\d.]/.test(ch)) {
      const m = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(s.slice(i));
      if (!m) throw new CalcError(`Unexpected “${ch}”.`);
      out.push({ t: 'num', v: parseFloat(m[0]) });
      i += m[0].length;
    } else if (/[a-z]/i.test(ch)) {
      const m = /^[a-z][a-z0-9]*/i.exec(s.slice(i))!;
      out.push({ t: 'id', v: m[0].toLowerCase() });
      i += m[0].length;
    } else if (OPS.has(ch)) {
      out.push({ t: 'op', v: ch });
      i++;
    } else throw new CalcError(`Unexpected “${ch}”.`);
  }
  return out;
}

function factorial(n: number): number {
  if (!Number.isInteger(n) || n < 0) throw new CalcError('Factorial needs a whole number ≥ 0.');
  if (n > 170) return Infinity;
  let r = 1;
  for (let k = 2; k <= n; k++) r *= k;
  return r;
}

function combinations(n: number, r: number): number {
  if (![n, r].every(Number.isInteger) || r < 0 || n < 0 || r > n) throw new CalcError('nCr needs whole numbers with 0 ≤ r ≤ n.');
  r = Math.min(r, n - r);
  let x = 1;
  for (let k = 1; k <= r; k++) x = (x * (n - r + k)) / k;
  return Math.round(x);
}

function permutations(n: number, r: number): number {
  if (![n, r].every(Number.isInteger) || r < 0 || n < 0 || r > n) throw new CalcError('nPr needs whole numbers with 0 ≤ r ≤ n.');
  let x = 1;
  for (let k = 0; k < r; k++) x *= n - k;
  return x;
}

/** Tiny results of trig on exact angles (sin 180°) are rounding noise. */
const clean = (x: number) => (Math.abs(x) < 1e-12 ? 0 : x);

export function evaluate(src: string, opts: { angle: AngleMode; ans?: number } = { angle: 'deg' }): number {
  const toks = tokenize(src);
  if (!toks.length) throw new CalcError('Enter an expression.');
  let pos = 0;
  const peek = () => toks[pos];
  const isOp = (v: string) => peek()?.t === 'op' && peek()!.v === v;
  const expect = (v: string) => {
    if (!isOp(v)) throw new CalcError(v === ')' ? 'Missing closing bracket.' : `Expected “${v}”.`);
    pos++;
  };
  const toRad = (x: number) => (opts.angle === 'deg' ? (x * Math.PI) / 180 : x);
  const fromRad = (x: number) => (opts.angle === 'deg' ? (x * 180) / Math.PI : x);

  const trig = (fn: (x: number) => number, x: number) => clean(fn(toRad(x)));
  const FUNCS: Record<string, (...a: number[]) => number> = {
    sin: (x) => trig(Math.sin, x),
    cos: (x) => trig(Math.cos, x),
    tan: (x) => {
      if (opts.angle === 'deg' && Math.abs(((x % 180) + 180) % 180 - 90) < 1e-9) throw new CalcError(`tan(${x}°) is undefined.`);
      return trig(Math.tan, x);
    },
    asin: (x) => fromRad(Math.asin(x)),
    acos: (x) => fromRad(Math.acos(x)),
    atan: (x) => fromRad(Math.atan(x)),
    sinh: Math.sinh,
    cosh: Math.cosh,
    tanh: Math.tanh,
    asinh: Math.asinh,
    acosh: Math.acosh,
    atanh: Math.atanh,
    ln: Math.log,
    log: Math.log10,
    log2: Math.log2,
    exp: Math.exp,
    sqrt: Math.sqrt,
    cbrt: Math.cbrt,
    abs: Math.abs,
    floor: Math.floor,
    ceil: Math.ceil,
    round: Math.round,
    sign: Math.sign,
    fact: factorial,
    ncr: combinations,
    npr: permutations,
    min: Math.min,
    max: Math.max,
    root: (x, n) => (n % 2 === 1 && x < 0 ? -Math.pow(-x, 1 / n) : Math.pow(x, 1 / n)),
  };
  const CONSTS: Record<string, () => number> = {
    pi: () => Math.PI,
    e: () => Math.E,
    tau: () => 2 * Math.PI,
    phi: () => (1 + Math.sqrt(5)) / 2,
    ans: () => {
      if (opts.ans === undefined) throw new CalcError('There is no previous answer yet.');
      return opts.ans;
    },
  };

  function primary(): number {
    const tk = peek();
    if (!tk) throw new CalcError('The expression ends too early.');
    if (tk.t === 'num') {
      pos++;
      return tk.v;
    }
    if (tk.t === 'op' && tk.v === '(') {
      pos++;
      const v = expr();
      expect(')');
      return v;
    }
    if (tk.t === 'op' && tk.v === '√') {
      pos++;
      return Math.sqrt(unary());
    }
    if (tk.t === 'id') {
      pos++;
      if (tk.v in FUNCS) {
        if (!isOp('(')) throw new CalcError(`Use brackets after ${tk.v}, e.g. ${tk.v}(30).`);
        pos++;
        const args = [expr()];
        while (isOp(',')) {
          pos++;
          args.push(expr());
        }
        expect(')');
        const fn = FUNCS[tk.v];
        const need = ['ncr', 'npr', 'root'].includes(tk.v) ? 2 : ['min', 'max'].includes(tk.v) ? -1 : 1;
        if (need > 0 && args.length !== need) throw new CalcError(`${tk.v} takes ${need} value${need > 1 ? 's' : ''}.`);
        return fn(...args);
      }
      if (tk.v in CONSTS) return CONSTS[tk.v]();
      throw new CalcError(`Unknown name “${tk.v}”.`);
    }
    throw new CalcError(`Unexpected “${tk.v}”.`);
  }

  function postfix(): number {
    let v = primary();
    for (;;) {
      if (isOp('!')) {
        pos++;
        v = factorial(v);
      } else if (isOp('%')) {
        pos++;
        v = v / 100;
      } else return v;
    }
  }

  function power(): number {
    const base = postfix();
    if (isOp('^')) {
      pos++;
      return Math.pow(base, unary());
    }
    return base;
  }

  function unary(): number {
    if (isOp('-')) {
      pos++;
      return -unary();
    }
    if (isOp('+')) {
      pos++;
      return unary();
    }
    return power();
  }

  const startsPrimary = () => {
    const tk = peek();
    return !!tk && (tk.t === 'num' || tk.t === 'id' || (tk.t === 'op' && (tk.v === '(' || tk.v === '√')));
  };

  function term(): number {
    let v = unary();
    for (;;) {
      const tk = peek();
      if (tk?.t === 'op' && (tk.v === '*' || tk.v === '/')) {
        pos++;
        const r = unary();
        if (tk.v === '/' && r === 0) throw new CalcError('Cannot divide by zero.');
        v = tk.v === '*' ? v * r : v / r;
      } else if (tk?.t === 'id' && tk.v === 'mod') {
        pos++;
        const r = unary();
        v = ((v % r) + r) % r;
      } else if (startsPrimary()) {
        v *= unary(); // implicit multiplication: 2pi, 3(4+1), 2sin(30)
      } else return v;
    }
  }

  function expr(): number {
    let v = term();
    while (isOp('+') || isOp('-')) {
      const op = toks[pos++].v;
      const r = term();
      v = op === '+' ? v + r : v - r;
    }
    return v;
  }

  const result = expr();
  if (pos < toks.length) throw new CalcError(isOp(')') ? 'Unmatched closing bracket.' : 'Unexpected input after the expression.');
  if (Number.isNaN(result)) throw new CalcError('The result is not a real number.');
  return result;
}

/** Display a result without floating-point noise (0.1 + 0.2 → 0.3). */
export function formatResult(x: number): string {
  if (!Number.isFinite(x)) return x > 0 ? '∞' : x < 0 ? '−∞' : 'Error';
  if (x === 0) return '0';
  const abs = Math.abs(x);
  if (abs >= 1e15 || abs < 1e-9) return x.toExponential(10).replace(/\.?0+e/, 'e');
  return String(Number(x.toPrecision(14)));
}
