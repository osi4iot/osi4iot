# MCP计算服务器

[![smithery徽章](https://smithery.ai/badge/@611711Dark/mcp_calculate_server)](https://smithery.ai/server/@611711Dark/mcp_calculate_server)

基于MCP协议和SymPy库的数学计算服务，提供强大的符号计算能力。

## 核心功能

- **基础运算**：加减乘除、幂运算
- **代数运算**：表达式展开、因式分解、化简
- **微积分**：求导、积分（定积分/不定积分）、极限计算
- **方程求解**：代数方程、方程组
- **矩阵运算**：矩阵求逆、特征值/特征向量计算
- **级数展开**：泰勒级数展开
- **特殊函数**：三角函数、对数函数、指数函数

## 使用示例

```python
# 基础运算
"2 + 3*5" → 17

# 代数运算
"expand((x + 1)**2)" → x² + 2x + 1
"factor(x**2 - 2*x - 15)" → (x - 5)(x + 3)

# 微积分
"diff(sin(x), x)" → cos(x)
"integrate(exp(x), (x, 0, 1))" → E - 1
"limit(tan(x)/x, x, 0)" → 1

# 方程求解
"solve(x**2 - 4, x)" → [-2, 2]
"solve([x**2 + y**2 - 1, x + y - 1], [x, y])" → [(0, 1), (1, 0)]

# 矩阵运算
"Matrix([[1, 2], [3, 4]]).inv()" → [[-2, 1], [3/2, -1/2]]
"Matrix([[1, 2, 3], [4, 5, 6]]).eigenvals()" → {9/2 - sqrt(33)/2: 1, 9/2 + sqrt(33)/2: 1}
```

## 安装指南

### 通过Smithery安装

通过[Smithery](https://smithery.ai/server/@611711Dark/mcp_calculate_server)为Claude Desktop自动安装计算服务器：

```bash
npx -y @smithery/cli install @611711Dark/mcp_sympy_calculate_server --client claude
```

### 本地安装

1. 克隆仓库：
   ```bash
   git clone https://github.com/611711Dark/mcp-calculate-server.git
   cd mcp-calculate-server
   ```

2. 创建虚拟环境并安装依赖：
   ```bash
   uv venv
   source .venv/bin/activate
   uv pip install -e .
   ```

3. 配置：
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

## API使用

通过MCP协议调用`calculate_expression`工具，传入数学表达式字符串，返回计算结果。

## 依赖项

- mcp>=1.5.0
- sympy>=1.13.3
- fastapi>=0.95.0
- uvicorn>=0.21.0

## 许可证

本项目采用MIT许可证，详见[LICENSE](LICENSE)文件。

[English Version](README.md)
