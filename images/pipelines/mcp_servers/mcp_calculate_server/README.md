# MCP Calculate Server

[![smithery badge](https://smithery.ai/badge/@611711Dark/mcp_calculate_server)](https://smithery.ai/server/@611711Dark/mcp_calculate_server)

A mathematical calculation service based on MCP protocol and SymPy library, providing powerful symbolic computation capabilities.

## Key Features

- **Basic Operations**: Addition, subtraction, multiplication, division, exponentiation
- **Algebraic Operations**: Expression expansion, factorization, simplification
- **Calculus**: Differentiation, integration (definite/indefinite), limit calculation
- **Equation Solving**: Algebraic equations, systems of equations
- **Matrix Operations**: Matrix inversion, eigenvalues/eigenvectors calculation
- **Series Expansion**: Taylor series expansion
- **Special Functions**: Trigonometric, logarithmic, exponential functions

## Usage Examples

```python
# Basic operations
"2 + 3*5" → 17

# Algebraic operations
"expand((x + 1)**2)" → x² + 2x + 1
"factor(x**2 - 2*x - 15)" → (x - 5)(x + 3)

# Calculus
"diff(sin(x), x)" → cos(x)
"integrate(exp(x), (x, 0, 1))" → E - 1
"limit(tan(x)/x, x, 0)" → 1

# Equation solving
"solve(x**2 - 4, x)" → [-2, 2]
"solve([x**2 + y**2 - 1, x + y - 1], [x, y])" → [(0, 1), (1, 0)]

# Matrix operations
"Matrix([[1, 2], [3, 4]]).inv()" → [[-2, 1], [3/2, -1/2]]
"Matrix([[1, 2, 3], [4, 5, 6]]).eigenvals()" → {9/2 - sqrt(33)/2: 1, 9/2 + sqrt(33)/2: 1}
```

## Installation

### Installing via Smithery

To install Calculate Server for Claude Desktop automatically via [Smithery](https://smithery.ai/server/@611711Dark/mcp_calculate_server):

```bash
npx -y @smithery/cli install @611711Dark/mcp_sympy_calculate_server --client claude
```

### Local Installation

1. Clone repository:
   ```bash
   git clone https://github.com/611711Dark/mcp-calculate-server.git
   cd mcp-calculate-server
   ```

2. Create virtual environment and install dependencies:
   ```bash
   uv venv
   source .venv/bin/activate
   uv pip install -e .
   ```

3. Configuration:
   ```json
   "calculate_expression1": {
      "isActive": false,
      "command": "uv",
      "args": [
        "run",
        "--directory",
        "/path/to/mcp_calculate_server",
        "server.py"
      ],
    }
   ```

## API Usage

Call `calculate_expression` tool via MCP protocol by passing mathematical expression string, returns computation result.

## Dependencies

- mcp>=1.5.0
- sympy>=1.13.3
- fastapi>=0.95.0
- uvicorn>=0.21.0

## License

This project is licensed under MIT License. See [LICENSE](LICENSE) file.

[中文版本](README_CN.md)
