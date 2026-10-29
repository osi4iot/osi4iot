from mcp.server.fastmcp import FastMCP
import sympy as sp
from sympy import symbols, Matrix, sympify
import re

# Create MCP server
mcp = FastMCP("MathTool")

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
Returns:
    str: Calculation result. If the expression cannot be parsed or computed, returns an error message (str).
"""
    try:
        # Define common symbolic variables
        x, y, z = sp.symbols('x y z')

        # Create local namespace containing all sympy functions and symbolic variables
        locals_dict = {**sp.__dict__, 'x': x, 'y': y, 'z': z}

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
            result = eval(expression, globals(), locals_dict)

            # Process based on result type
            return format_result(result)

    except Exception as e:
        return f"Error: {e}"

def handle_complex_integration(expression, locals_dict):
    """Handle complex integral expressions"""
    try:
        # Check if it's an infinite integral
        if "-oo" in expression or "oo" in expression:
            # Try symbolic computation
            expr = eval(expression, globals(), locals_dict)

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
                                result = eval(finite_expr, globals(), locals_dict)

                                try:
                                    numerical = result.evalf()
                                    return f"Approximate numerical result: {numerical} (using finite range integral)"
                                except:
                                    return f"Approximate result: {result} (using finite range integral)"
                    except Exception as e2:
                        return f"Integration error: {e}, finite approximation failed: {e2}"

            # Try to compute result directly
            try:
                numerical = expr.evalf()
                return str(numerical)
            except:
                return str(expr)

        # Regular integral
        result = eval(expression, globals(), locals_dict)
        return format_result(result)

    except Exception as e:
        return f"Integration error: {e}"

def handle_equation_solving(expression, locals_dict):
    """Handle system of equations solving expressions"""
    try:
        # Compute result
        result = eval(expression, globals(), locals_dict)

        # Format result
        return format_result(result)

    except Exception as e:
        return f"Equation solving error: {e}"

def handle_matrix_eigenvalues(expression, locals_dict):
    """Handle matrix eigenvalue calculation expressions"""
    try:
        # Extract matrix expression
        matrix_expr = expression.split(".eigen")[0]
        operation = "eigenvals" if "eigenvals" in expression else "eigenvects"

        # Compute matrix
        matrix = eval(matrix_expr, globals(), locals_dict)

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

    except Exception as e:
        return f"Result formatting error: {e}, original result: {result}"

if __name__ == "__main__":
    mcp.run()