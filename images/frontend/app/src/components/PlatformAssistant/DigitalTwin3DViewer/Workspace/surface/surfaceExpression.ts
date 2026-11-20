// The formulas of the 3D Surface panels: z = f(x, y) written as on a calculator, A*sin(k*x)*cos(k*y).
//
// They are read by this interpreter and never run as code (no eval, no new Function): a layout is shared by a
// group and loaded from files, so a formula is data. It knows only
//   numbers (2, 0.5, 1e-3), the variables x and y, the parameters of the panel, the constants pi and e;
//   + - * / ^ (power, right to left: 2^3^2 = 2^9), parentheses, and a product without its sign: 2x, 3(x+1), (x+1)(x-1), 2pi;
//   the functions below (log is the natural logarithm, as in mathematics and SymPy).
// Where a formula has no value (log of a negative number, a division by zero) it gives NaN: the surface has a hole.

export const SURFACE_EXPRESSION_MAX_LENGTH = 500;
const MAX_TOKENS = 400;
const MAX_DEPTH = 60;

type Fn = (...args: number[]) => number;

// name: [the function, its number of arguments (-1: one or more)]
export const SURFACE_FUNCTIONS: Record<string, [Fn, number]> = {
    sin: [Math.sin, 1],
    cos: [Math.cos, 1],
    tan: [Math.tan, 1],
    asin: [Math.asin, 1],
    acos: [Math.acos, 1],
    atan: [Math.atan, 1],
    atan2: [Math.atan2, 2],
    sinh: [Math.sinh, 1],
    cosh: [Math.cosh, 1],
    tanh: [Math.tanh, 1],
    exp: [Math.exp, 1],
    log: [Math.log, 1],
    ln: [Math.log, 1],
    log10: [Math.log10, 1],
    log2: [Math.log2, 1],
    sqrt: [Math.sqrt, 1],
    cbrt: [Math.cbrt, 1],
    abs: [Math.abs, 1],
    floor: [Math.floor, 1],
    ceil: [Math.ceil, 1],
    round: [Math.round, 1],
    sign: [Math.sign, 1],
    pow: [Math.pow, 2],
    mod: [(a, b) => a - b * Math.floor(a / b), 2],
    hypot: [Math.hypot, -1],
    min: [Math.min, -1],
    max: [Math.max, -1],
};

export const SURFACE_CONSTANTS: Record<string, number> = { pi: Math.PI, e: Math.E };

// only the tables' own names: never what every object inherits (constructor, toString, __proto__...)
const own = <T>(table: Record<string, T>, name: string): T | undefined =>
    Object.prototype.hasOwnProperty.call(table, name) ? table[name] : undefined;

// names a parameter cannot have (admin_api checks the same)
export const isReservedSurfaceName = (name: string) => {
    const lower = name.toLowerCase();
    return lower === "x" || lower === "y" || own(SURFACE_CONSTANTS, lower) !== undefined || own(SURFACE_FUNCTIONS, lower) !== undefined;
};

type Token =
    | { kind: "num"; value: number; at: number }
    | { kind: "id"; name: string; at: number }
    | { kind: "op"; op: string; at: number };

export interface SurfaceExpressionError {
    error: string;
    at?: number; // where in the text (0-based)
}

export interface CompiledSurfaceExpression {
    evaluate: (vars: Record<string, number>) => number;
    // the parameters it uses (not x, y or constants)
    params: string[];
}

const tokenize = (text: string): Token[] | SurfaceExpressionError => {
    const tokens: Token[] = [];
    let i = 0;
    while (i < text.length) {
        const ch = text[i];
        if (/\s/.test(ch)) {
            i++;
            continue;
        }
        const number = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(text.slice(i));
        if (number) {
            // 2e is 2·e, not an exponent: only e followed by digits
            tokens.push({ kind: "num", value: Number(number[0]), at: i });
            i += number[0].length;
            continue;
        }
        const id = /^[A-Za-z_][A-Za-z0-9_]*/.exec(text.slice(i));
        if (id) {
            tokens.push({ kind: "id", name: id[0], at: i });
            i += id[0].length;
            continue;
        }
        if ("+-*/^(),".includes(ch)) {
            tokens.push({ kind: "op", op: ch, at: i });
            i++;
            continue;
        }
        return { error: `"${ch}" cannot be in a formula`, at: i };
    }
    if (tokens.length > MAX_TOKENS) return { error: "The formula is too long" };
    return tokens;
};

type Node = (vars: Record<string, number>) => number;

class ParseError extends Error {
    constructor(
        message: string,
        public at?: number,
    ) {
        super(message);
    }
}

// Compiles a formula: the parameters it may use besides x and y (params), or why it is not valid
export const compileSurfaceExpression = (text: string, params: string[] = []): CompiledSurfaceExpression | SurfaceExpressionError => {
    if (!text.trim()) return { error: "Write a formula: z = f(x, y)" };
    if (text.length > SURFACE_EXPRESSION_MAX_LENGTH) return { error: `The formula must have at most ${SURFACE_EXPRESSION_MAX_LENGTH} characters` };
    const tokens = tokenize(text);
    if ("error" in tokens) return tokens;
    const known = new Set(params);
    const used = new Set<string>();
    let pos = 0;
    let depth = 0;
    const peek = () => tokens[pos];
    const isOp = (op: string) => {
        const t = tokens[pos];
        return t?.kind === "op" && t.op === op;
    };
    const expect = (op: string) => {
        if (!isOp(op)) throw new ParseError(peek() ? `"${op}" expected` : `"${op}" expected at the end`, peek()?.at ?? text.length);
        pos++;
    };
    const deeper = () => {
        if (++depth > MAX_DEPTH) throw new ParseError("The formula has too many nested parts");
    };

    // a value that can start a product without its sign: a number, a name, (
    const startsFactor = () => {
        const t = peek();
        return t !== undefined && (t.kind === "num" || t.kind === "id" || (t.kind === "op" && t.op === "("));
    };

    const additive = (): Node => {
        deeper();
        let left = multiplicative();
        while (isOp("+") || isOp("-")) {
            const op = (peek() as { op: string }).op;
            pos++;
            const a = left;
            const b = multiplicative();
            left = op === "+" ? (v) => a(v) + b(v) : (v) => a(v) - b(v);
        }
        depth--;
        return left;
    };

    const multiplicative = (): Node => {
        let left = unary();
        for (;;) {
            if (isOp("*") || isOp("/")) {
                const op = (peek() as { op: string }).op;
                pos++;
                const a = left;
                const b = unary();
                left = op === "*" ? (v) => a(v) * b(v) : (v) => a(v) / b(v);
            } else if (startsFactor()) {
                // 2x, 3(x+1), (x+1)(x-1), x y
                const a = left;
                const b = power();
                left = (v) => a(v) * b(v);
            } else return left;
        }
    };

    const unary = (): Node => {
        if (isOp("-")) {
            pos++;
            deeper();
            const a = unary();
            depth--;
            return (v) => -a(v);
        }
        if (isOp("+")) {
            pos++;
            return unary();
        }
        return power();
    };

    // right to left; -x^2 is -(x^2), 2^-1 is 2^(-1)
    const power = (): Node => {
        const base = primary();
        if (!isOp("^")) return base;
        pos++;
        deeper();
        const exponent = unary();
        depth--;
        return (v) => Math.pow(base(v), exponent(v));
    };

    const primary = (): Node => {
        const t = peek();
        if (!t) throw new ParseError("The formula ends too soon", text.length);
        if (t.kind === "num") {
            pos++;
            const value = t.value;
            return () => value;
        }
        if (t.kind === "op" && t.op === "(") {
            pos++;
            const inner = additive();
            expect(")");
            return inner;
        }
        if (t.kind === "id") {
            pos++;
            const fn = own(SURFACE_FUNCTIONS, t.name.toLowerCase());
            if (fn && isOp("(")) {
                pos++;
                const args: Node[] = [];
                if (!isOp(")")) {
                    args.push(additive());
                    while (isOp(",")) {
                        pos++;
                        args.push(additive());
                    }
                }
                expect(")");
                const [f, arity] = fn;
                if (arity === -1 ? args.length === 0 : args.length !== arity) {
                    const want = arity === -1 ? "one or more values" : arity === 1 ? "one value" : `${arity} values`;
                    throw new ParseError(`${t.name}() takes ${want}`, t.at);
                }
                if (args.length === 1) {
                    const a = args[0];
                    return (v) => f(a(v));
                }
                if (args.length === 2) {
                    const [a, b] = args;
                    return (v) => f(a(v), b(v));
                }
                return (v) => f(...args.map((a) => a(v)));
            }
            if (fn) throw new ParseError(`${t.name} needs its value in parentheses: ${t.name}(x)`, t.at);
            if (t.name === "x" || t.name === "y") {
                const name = t.name;
                return (v) => v[name];
            }
            const constant = own(SURFACE_CONSTANTS, t.name.toLowerCase());
            if (constant !== undefined && !known.has(t.name)) return () => constant;
            if (known.has(t.name)) {
                used.add(t.name);
                const name = t.name;
                return (v) => v[name];
            }
            throw new ParseError(`Unknown name "${t.name}": add it as a parameter`, t.at);
        }
        throw new ParseError(`"${t.op}" is not expected here`, t.at);
    };

    try {
        const root = additive();
        if (pos < tokens.length) {
            const t = tokens[pos];
            throw new ParseError(t.kind === "op" && t.op === ")" ? 'A ")" without its "("' : "Something is missing between two parts of the formula", t.at);
        }
        return {
            evaluate: (vars) => {
                const z = root(vars);
                return Number.isFinite(z) ? z : NaN;
            },
            params: Array.from(used),
        };
    } catch (error) {
        if (error instanceof ParseError) return { error: error.message, at: error.at };
        return { error: "The formula is not valid" };
    }
};
