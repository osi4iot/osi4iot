from mcp.server.fastmcp import FastMCP
import ast
import multiprocessing
import os
import sympy as sp
import re
import threading

# ---------------------------------------------------------------------------
# Safe evaluation
#
# The expression comes from the AI agent, so from whatever reached it: a user
# of the chat, a document of the knowledge base, a sensor message. It used to
# be run with eval(expression, globals(), ...), which runs any Python:
# __import__('os').popen(...) read the pipelines' environment and secrets and
# ran commands in its container. Now it is parsed with ast and only a
# mathematical subset is run, without builtins:
#
#   - numbers, + - * / // % ** @, comparisons, (lists and tuples of) them;
#   - names of SymPy functions and objects (SAFE_NAMES), x, y, z and a few
#     safe builtins (abs, min, max, round, int, float); any other plain name
#     (k, t, E_mod) is a SymPy symbol;
#   - calls of those, with keyword arguments;
#   - methods of the results from a fixed list (SAFE_METHODS): .evalf(),
#     .inv(), .eigenvals()...; indexing (M[0, 1]);
#   - strings only as the names given to Symbol, symbols and Function.
#
# No name or attribute starting with "_", no attribute outside the list, and
# none of the SymPy functions that evaluate text themselves (sympify, S,
# parse_expr, lambdify...), which would bring eval back.
# ---------------------------------------------------------------------------

MAX_EXPRESSION_LENGTH = 2000

# SymPy names that would evaluate or execute text, print, or change state.
UNSAFE_SYMPY_NAMES = {
    "sympify", "S", "parse_expr", "lambdify", "evaluate", "var", "init_printing",
    "init_session", "preview", "pprint", "pprint_use_unicode", "pprint_try_use_unicode",
    "print_python", "print_ccode", "print_fcode", "print_glsl", "print_jscode",
    "print_latex", "print_maple_code", "print_mathml", "print_rcode", "print_tree",
    "pager_print", "python", "test", "doctest", "interactive", "utilities",
    "rcode", "ccode", "fcode", "cxxcode", "jscode", "julia_code", "mathematica_code",
    "octave_code", "rust_code", "glsl_code", "maple_code", "pycode", "srepr", "dotprint",
    "plot", "plot_implicit", "plot_parametric", "plot_backends", "textplot", "plotting",
}

# Names whose string arguments are names of symbols, not code.
SYMBOL_FACTORIES = {"Symbol", "symbols", "Function", "Dummy", "Wild", "IndexedBase", "Idx", "MatrixSymbol"}

SAFE_METHODS = {
    "evalf", "n", "doit", "simplify", "expand", "factor", "subs", "xreplace", "cancel", "apart",
    "together", "collect", "coeff", "as_numer_denom", "as_real_imag", "conjugate", "rewrite",
    "diff", "integrate", "limit", "series", "removeO", "round", "is_zero",
    "inv", "det", "T", "H", "transpose", "adjugate", "trace", "rank", "rref", "nullspace",
    "columnspace", "rowspace", "eigenvals", "eigenvects", "charpoly", "diagonalize",
    "jordan_form", "is_symmetric", "norm", "normalized", "dot", "cross", "LUsolve", "solve",
    "applyfunc", "tolist", "shape", "rows", "cols", "row", "col", "free_symbols", "args",
    "lhs", "rhs", "real", "imag", "exp", "log", "sqrt",
}

SAFE_BUILTINS = {"abs": abs, "min": min, "max": max, "round": round, "int": int, "float": float}

_BIN_OPS = (ast.Add, ast.Sub, ast.Mult, ast.Div, ast.FloorDiv, ast.Mod, ast.Pow, ast.MatMult)
_UNARY_OPS = (ast.UAdd, ast.USub)
_CMP_OPS = (ast.Eq, ast.NotEq, ast.Lt, ast.LtE, ast.Gt, ast.GtE)


def _safe_namespace():
    x, y, z = sp.symbols("x y z")
    names = {
        name: value
        for name, value in vars(sp).items()
        if not name.startswith("_") and name not in UNSAFE_SYMPY_NAMES and not isinstance(value, type(sp))
    }
    names.update(SAFE_BUILTINS)
    names.update({"x": x, "y": y, "z": z})
    return names


SAFE_NAMES = _safe_namespace()


class UnsafeExpression(ValueError):
    pass


_SYMBOL_NAME_RE = re.compile(r"^[A-Za-z][A-Za-z0-9_]{0,30}$")


def _check(node, strings_allowed=False, new_symbols=None):
    """Raise UnsafeExpression for anything outside the subset; collect the
    names that are not defined (they become symbols) in new_symbols."""
    if new_symbols is None:
        new_symbols = set()

    def check(child, strings=False):
        _check(child, strings, new_symbols)

    if isinstance(node, ast.Expression):
        check(node.body)
    elif isinstance(node, ast.Constant):
        if isinstance(node.value, str):
            if not strings_allowed:
                raise UnsafeExpression("text is only allowed as the name of a symbol")
        elif not isinstance(node.value, (int, float, complex, bool)) and node.value is not None:
            raise UnsafeExpression("unsupported constant")
    elif isinstance(node, ast.Name):
        if node.id not in SAFE_NAMES:
            if not _SYMBOL_NAME_RE.match(node.id):
                raise UnsafeExpression(f"invalid name '{node.id}'")
            new_symbols.add(node.id)
    elif isinstance(node, ast.BinOp):
        if not isinstance(node.op, _BIN_OPS):
            raise UnsafeExpression("unsupported operator")
        check(node.left)
        check(node.right)
    elif isinstance(node, ast.UnaryOp):
        if not isinstance(node.op, _UNARY_OPS):
            raise UnsafeExpression("unsupported operator")
        check(node.operand)
    elif isinstance(node, ast.Compare):
        if not all(isinstance(op, _CMP_OPS) for op in node.ops):
            raise UnsafeExpression("unsupported comparison")
        check(node.left)
        for c in node.comparators:
            check(c)
    elif isinstance(node, (ast.List, ast.Tuple)):
        for e in node.elts:
            check(e, strings_allowed)
    elif isinstance(node, ast.Attribute):
        if node.attr.startswith("_") or node.attr not in SAFE_METHODS:
            raise UnsafeExpression(f"unsupported attribute '.{node.attr}'")
        check(node.value)
    elif isinstance(node, ast.Call):
        check(node.func)
        names_symbols = isinstance(node.func, ast.Name) and node.func.id in SYMBOL_FACTORIES
        for a in node.args:
            check(a, names_symbols)
        for kw in node.keywords:
            if kw.arg is None or kw.arg.startswith("_"):
                raise UnsafeExpression("unsupported argument")
            check(kw.value, names_symbols)
    elif isinstance(node, ast.Subscript):
        check(node.value)
        check(node.slice)
    elif isinstance(node, ast.Slice):
        for part in (node.lower, node.upper, node.step):
            if part is not None:
                check(part)
    else:
        raise UnsafeExpression(f"unsupported syntax ({type(node).__name__})")


def safe_eval(expression, names=None):
    """Evaluate a mathematical expression with the SymPy subset above."""
    if not isinstance(expression, str):
        raise UnsafeExpression("the expression must be text")
    if len(expression) > MAX_EXPRESSION_LENGTH:
        raise UnsafeExpression(f"the expression is longer than {MAX_EXPRESSION_LENGTH} characters")
    tree = ast.parse(expression.strip(), mode="eval")
    new_symbols = set()
    _check(tree, new_symbols=new_symbols)
    namespace = dict(names or SAFE_NAMES)
    for name in new_symbols:
        namespace.setdefault(name, sp.Symbol(name))
    return eval(compile(tree, "<expression>", "eval"), {"__builtins__": {}}, namespace)


def validate_expression(expression):
    """Refuse an unsafe expression before choosing how to compute it."""
    if not isinstance(expression, str) or len(expression) > MAX_EXPRESSION_LENGTH:
        raise UnsafeExpression(f"the expression must be text of at most {MAX_EXPRESSION_LENGTH} characters")
    _check(ast.parse(expression.strip(), mode="eval"))

# Create MCP server
mcp = FastMCP("MathTool")

def _compute(expression):
    """Compute an expression (in the worker process: see _Worker)."""
    try:
        # The SymPy functions and x, y, z (see safe_eval). The whole
        # expression is checked first: the handlers below evaluate parts of it.
        validate_expression(expression)
        locals_dict = SAFE_NAMES

        # Special handling for various types of expressions

        # 1. Handle complex integral expressions
        if "integrate" in expression and ("oo" in expression or "-oo" in expression):
            return handle_complex_integration(expression, locals_dict)

        # 2. Handle system of equations solving expressions
        elif "solve(" in expression and "[" in expression and "]" in expression:
            return handle_equation_solving(expression, locals_dict)

        # 3. Handle matrix eigenvalue calculation expressions
        elif "eigenvals" in expression or "eigenvects" in expression:
            return handle_matrix_eigenvalues(expression, locals_dict)

        # 4. General expression calculation
        else:
            # First try to evaluate the expression directly
            result = safe_eval(expression, locals_dict)

            # Process based on result type
            return format_result(result)

    except MemoryError:  # to the worker, which says so
        raise
    except Exception as e:
        return f"Error: {e}"

def handle_complex_integration(expression, locals_dict):
    """Handle complex integral expressions"""
    try:
        # Check if it's an infinite integral
        if "-oo" in expression or "oo" in expression:
            # Try symbolic computation
            expr = safe_eval(expression, locals_dict)

            # If it's an integral object but not computed
            if isinstance(expr, sp.Integral):
                try:
                    # Try to perform the integral
                    result = expr.doit()

                    # Try to compute numerical result
                    try:
                        numerical = result.evalf()
                        return str(numerical)
                    except:
                        return str(result)
                except MemoryError:  # to the worker, which says so
                    raise
                except Exception as e:
                    # If symbolic integration fails, try alternative methods
                    try:
                        # Extract integral expression information
                        match = re.search(r"integrate\((.*?), \((.*?), (.*?), (.*?)\)\)", expression)
                        if match:
                            integrand, var, lower, upper = match.groups()

                            # For infinite integrals, use finite approximation
                            if (lower == "-oo" or lower == "oo") or (upper == "oo" or upper == "-oo"):
                                # Replace infinity with a large value
                                if lower == "-oo":
                                    lower = "-100"
                                elif lower == "oo":
                                    lower = "100"

                                if upper == "-oo":
                                    upper = "-100"
                                elif upper == "oo":
                                    upper = "100"

                                # Build finite range integral expression
                                finite_expr = f"integrate({integrand}, ({var}, {lower}, {upper}))"
                                result = safe_eval(finite_expr, locals_dict)

                                try:
                                    numerical = result.evalf()
                                    return f"Approximate numerical result: {numerical} (using finite range integral)"
                                except:
                                    return f"Approximate result: {result} (using finite range integral)"
                    except MemoryError:  # to the worker, which says so
                        raise
                    except Exception as e2:
                        return f"Integration error: {e}, finite approximation failed: {e2}"

            # Try to compute result directly
            try:
                numerical = expr.evalf()
                return str(numerical)
            except:
                return str(expr)

        # Regular integral
        result = safe_eval(expression, locals_dict)
        return format_result(result)

    except MemoryError:  # to the worker, which says so
        raise
    except Exception as e:
        return f"Integration error: {e}"

def handle_equation_solving(expression, locals_dict):
    """Handle system of equations solving expressions"""
    try:
        # Compute result
        result = safe_eval(expression, locals_dict)

        # Format result
        return format_result(result)

    except MemoryError:  # to the worker, which says so
        raise
    except Exception as e:
        return f"Equation solving error: {e}"

def handle_matrix_eigenvalues(expression, locals_dict):
    """Handle matrix eigenvalue calculation expressions"""
    try:
        # Extract matrix expression
        matrix_expr = expression.split(".eigen")[0]
        operation = "eigenvals" if "eigenvals" in expression else "eigenvects"

        # Compute matrix
        matrix = safe_eval(matrix_expr, locals_dict)

        # A numeric matrix gets a numerical answer. The exact one of a 3x3 or
        # larger matrix is a page of nested radicals with spurious imaginary
        # parts (0.e-20*I), which the AI agents could not use and kept
        # retrying with other expressions.
        if isinstance(matrix, sp.MatrixBase) and not matrix.free_symbols:
            return numeric_eigen(matrix, vectors=(operation == "eigenvects"))

        # Compute eigenvalues or eigenvectors
        if operation == "eigenvals":
            result = matrix.eigenvals()
        else:
            result = matrix.eigenvects()

        # Format result
        return format_result(result)

    except MemoryError:  # to the worker, which says so
        raise
    except Exception as e:
        return f"Matrix eigenvalue calculation error: {e}"


# Significant digits of the numerical results
DIGITS = 10
# Longest result returned as is: longer ones are evaluated numerically or cut
MAX_RESULT_LENGTH = 4000


def _clean_number(value):
    """A sympy number with DIGITS significant digits, without spurious imaginary parts"""
    value = sp.N(value, DIGITS + 5, chop=True)
    real, imag = value.as_real_imag()
    scale = max(abs(real), abs(imag), 1)
    if abs(imag) < 1e-10 * scale:
        return sp.Float(real, DIGITS)
    return sp.Float(real, DIGITS) + sp.Float(imag, DIGITS) * sp.I


def numeric_eigen(matrix, vectors=True):
    """Eigenvalues (and unit eigenvectors) of a numeric matrix, sorted by eigenvalue"""
    m = sp.Matrix(matrix).evalf(DIGITS + 5)
    if m.rows != m.cols:
        return f"Error: the matrix is {m.rows}x{m.cols}, it must be square"

    pairs = []
    for value, multiplicity, basis in m.eigenvects():
        value = _clean_number(value)
        for vector in basis:
            norm = sp.sqrt(sum(abs(c) ** 2 for c in vector))
            unit = [_clean_number(c / norm) for c in vector]
            # sign convention: the largest component is positive
            largest = max(unit, key=lambda c: abs(complex(c)))
            if complex(largest).real < 0:
                unit = [-c for c in unit]
            pairs.append((value, multiplicity, unit))
    pairs.sort(key=lambda p: (complex(p[0]).real, complex(p[0]).imag))

    symmetric = m.is_symmetric()
    lines = []
    if vectors:
        lines.append("Eigenvalues and unit eigenvectors (numerical, sorted by eigenvalue):")
        for i, (value, multiplicity, unit) in enumerate(pairs, 1):
            mult = f" (multiplicity {multiplicity})" if multiplicity > 1 else ""
            lines.append(f"lambda_{i} = {value}{mult}; v_{i} = [{', '.join(str(c) for c in unit)}]")
        if all(complex(v).imag == 0 and all(complex(c).imag == 0 for c in u) for v, _, u in pairs):
            lines.append("Each eigenvector is defined up to its sign (here its largest component is positive).")
    else:
        values = []
        for value, multiplicity, _ in pairs:
            if not values or values[-1][0] != value:
                values.append((value, multiplicity))
        lines.append("Eigenvalues (numerical, sorted): " + ", ".join(
            f"{v}" + (f" (multiplicity {m_})" if m_ > 1 else "") for v, m_ in values))
    if symmetric:
        lines.append("The matrix is symmetric: its eigenvalues are real and its eigenvectors orthogonal.")
    return "\n".join(lines)


def format_result(result):
    """Format output based on result type (cut to MAX_RESULT_LENGTH)"""
    text = _format_result(result)
    if len(text) <= MAX_RESULT_LENGTH:
        return text
    # too long (usually exact radicals): the numerical value, if it has one
    try:
        numeric = _format_result(sp.N(result, DIGITS, chop=True))
        if len(numeric) <= MAX_RESULT_LENGTH:
            return "Numerical result (the exact one is too long): " + numeric
    except MemoryError:  # to the worker, which says so
        raise
    except Exception:
        pass
    return (text[:MAX_RESULT_LENGTH] + f"... [cut: the result has {len(text)} characters; "
            "evaluate it numerically with .evalf() or simplify the expression]")


def _format_result(result):
    """Format output based on result type"""
    try:
        # Handle dictionary type results (e.g., eigenvalues)
        if isinstance(result, dict):
            formatted = "{"
            for key, value in result.items():
                # Try numerical computation
                try:
                    key_eval = key.evalf(chop=True)
                except:
                    key_eval = key

                formatted += f"{key_eval}: {value}, "

            if formatted.endswith(", "):
                formatted = formatted[:-2]

            formatted += "}"
            return formatted

        # Handle list type results (e.g., solutions to equations)
        elif isinstance(result, list):
            formatted = "["
            for item in result:
                # Check if it's a tuple (e.g., coordinate points)
                if isinstance(item, tuple):
                    coords = []
                    for val in item:
                        # Try numerical computation
                        try:
                            val_eval = val.evalf(chop=True)
                            coords.append(str(val_eval))
                        except:
                            coords.append(str(val))

                    formatted += "(" + ", ".join(coords) + "), "
                else:
                    # Try numerical computation
                    try:
                        item_eval = item.evalf(chop=True)
                        formatted += f"{item_eval}, "
                    except:
                        formatted += f"{item}, "

            if formatted.endswith(", "):
                formatted = formatted[:-2]

            formatted += "]"
            return formatted

        # Other types of results
        else:
            # Try numerical computation
            try:
                return str(result.evalf(chop=True))
            except:
                return str(result)

    except MemoryError:  # to the worker, which says so
        raise
    except Exception as e:
        return f"Result formatting error: {e}, original result: {result}"

# ---------------------------------------------------------------------------
# Time and memory limits
#
# A valid expression can still be enormous: 9**9**9, factorint of a huge
# number, Matrix of 10^8 zeros, solve or integrate that runs for hours. Run
# in the server, it froze the agent's calculator (the tool calls are run one
# after another) and could take the container's memory, and with it the
# pipelines. Now each expression is computed in a worker process with a
# memory limit (RLIMIT_AS); if it does not answer within the time limit it is
# killed and a new worker is started for the next expression.
#
#   CALC_TIMEOUT_SECONDS  time limit of an expression (default 10)
#   CALC_MEMORY_MB        memory of the worker process (default 768)
# ---------------------------------------------------------------------------

def _env_number(name, default, minimum):
    try:
        return max(minimum, float(os.environ.get(name, default)))
    except ValueError:
        return default


TIMEOUT_SECONDS = _env_number("CALC_TIMEOUT_SECONDS", 10, 1)
MEMORY_MB = int(_env_number("CALC_MEMORY_MB", 768, 256))


class CalculationLimitExceeded(Exception):
    pass


def _limit_memory(megabytes):
    try:
        import resource
        limit = megabytes * 1024 * 1024
        resource.setrlimit(resource.RLIMIT_AS, (limit, limit))
    except (ImportError, ValueError, OSError):
        pass  # not on this system: the time limit still applies


def _worker_loop(conn, megabytes):
    """The worker: computes the expressions it receives until the pipe closes."""
    _limit_memory(megabytes)
    conn.send("ready")
    while True:
        try:
            expression = conn.recv()
        except (EOFError, OSError):
            return
        try:
            answer = _compute(expression)
        except MemoryError:
            answer = (f"Error: the calculation needs more than {megabytes} MB of memory; "
                      "simplify it or compute it numerically")
        except BaseException as e:  # never let the worker die on a result
            answer = f"Error: {e}"
        try:
            conn.send(answer)
        except MemoryError:
            conn.send("Error: the result is too large")


class _Worker:
    """One worker process, replaced when it is killed or dies."""

    def __init__(self, timeout, megabytes):
        self.timeout = timeout
        self.megabytes = megabytes
        # spawn: the server has threads (stdio), and forking them is unsafe.
        self._ctx = multiprocessing.get_context("spawn")
        self._process = None
        self._conn = None
        self._lock = threading.Lock()

    def _start(self):
        parent, child = self._ctx.Pipe()
        process = self._ctx.Process(target=_worker_loop, args=(child, self.megabytes), daemon=True)
        process.start()
        child.close()
        self._process, self._conn = process, parent
        # Wait for it to import SymPy, outside an expression's time limit.
        if not parent.poll(120) or parent.recv() != "ready":
            self._stop()
            raise CalculationLimitExceeded("the calculator's worker process did not start")

    def start(self):
        with self._lock:
            if self._process is None:
                self._start()

    def _stop(self):
        if self._process is not None:
            self._process.kill()
            self._process.join(5)
        if self._conn is not None:
            self._conn.close()
        self._process = self._conn = None

    def run(self, expression):
        with self._lock:
            if self._process is None or not self._process.is_alive():
                self._stop()
                self._start()
            try:
                self._conn.send(expression)
                if self._conn.poll(self.timeout):
                    return self._conn.recv()
                timed_out = True
            except (EOFError, OSError):
                timed_out = False
            code = self._process.exitcode
            self._stop()
            if timed_out:
                raise CalculationLimitExceeded(
                    f"the calculation took longer than {self.timeout:g} s and was stopped; "
                    "simplify it, use smaller numbers or compute it numerically (.evalf(), N())")
            raise CalculationLimitExceeded(
                f"the calculation stopped (code {code}), most likely for exceeding "
                f"{self.megabytes} MB of memory; simplify it or compute it numerically")


_worker = _Worker(TIMEOUT_SECONDS, MEMORY_MB)


# Add tool for calculating expressions
@mcp.tool()
def calculate_expression(expression: str) -> str:
    """
calculate mathematical expressions using the `sympify` function from `sympy`, parse and compute the input mathematical expression string, supports direct calls to SymPy functions (automatically recognizes x, y, z as symbolic variables)
Parameters:
    expression (str): Mathematical expression, e.g., "223 - 344 * 6" or "sin(pi/2) + log(10)".Replace special symbols with approximate values, e.g., pi → 3.1415"
Example expressions:
    "2 + 3*5"                          # Basic arithmetic → 17
    "expand((x + 1)**2)"               # Expand → x² + 2x + 1
    "diff(sin(x), x)"                  # Derivative → cos(x)
    "integrate(exp(x), (x, 0, 1))"      # Definite integral → E - 1
    "solve(x**2 - 4, x)"               # Solve equation → [-2, 2]
    "limit(tan(x)/x, x, 0)"            # Limit → 1
    "Sum(k, (k, 1, 10)).doit()"        # Summation → 55
    "Matrix([[1, 2], [3, 4]]).inv()"   # Matrix inverse → [[-2, 1], [3/2, -1/2]]
    "simplify((x**2 - 1)/(x + 1))"     # Simplify → x - 1
    "factor(x**2 - 2*x - 15)"          # Factorize → (x - 5)(x + 3)
    "series(cos(x), x, 0, 4)"          # Taylor series → 1 - x²/2 + x⁴/24 + O(x⁴)
    "integrate(exp(-x**2)*sin(x), (x, -oo, oo))"  # Complex integral
    "solve([x**2 + y**2 - 1, x + y - 1], [x, y])"  # Solve system of equations
    "Matrix([[1, 2, 3], [4, 5, 6], [7, 8, 9]]).eigenvals()"  # Matrix eigenvalues
    "Matrix([[10, 2], [2, 5]]).eigenvects()"  # Eigenvalues and unit eigenvectors: numerical, in one call, for a numeric matrix
Limits:
    Each calculation has a time and memory limit (CALC_TIMEOUT_SECONDS, CALC_MEMORY_MB); a calculation that exceeds them is stopped with an error: simplify it or compute it numerically (.evalf(), N()).
Returns:
    str: Calculation result. If the expression cannot be parsed or computed, returns an error message (str).
"""
    try:
        # Unsafe expressions are refused here, before reaching the worker.
        validate_expression(expression)
        return _worker.run(expression)
    except Exception as e:
        return f"Error: {e}"


if __name__ == "__main__":
    try:
        _worker.start()  # SymPy imported before the first question
    except Exception:
        pass  # started again with the first expression
    mcp.run()