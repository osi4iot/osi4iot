import unittest
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from server import calculate_expression

class TestCalculateExpression(unittest.TestCase):
    def test_basic_operations(self):
        """测试基础运算"""
        self.assertEqual(calculate_expression("2 + 3*5"), "17")
        self.assertEqual(calculate_expression("10 / 2"), "5.0")
        self.assertEqual(calculate_expression("2**8"), "256")

    def test_algebraic_operations(self):
        """测试代数运算"""
        self.assertEqual(calculate_expression("expand((x + 1)**2)"), "x**2 + 2.0*x + 1.0")
        self.assertEqual(calculate_expression("factor(x**2 - 2*x - 15)"), "(x - 5.0)*(x + 3.0)")
        self.assertEqual(calculate_expression("simplify((x**2 - 1)/(x + 1))"), "x - 1.0")

    def test_calculus(self):
        """测试微积分"""
        self.assertEqual(calculate_expression("diff(sin(x), x)"), "cos(x)")
        self.assertEqual(calculate_expression("integrate(exp(x), x)"), "exp(x)")
        self.assertEqual(calculate_expression("limit(tan(x)/x, x, 0)"), "1.00000000000000")

    def test_equation_solving(self):
        """测试方程求解"""
        self.assertEqual(calculate_expression("solve(x**2 - 4, x)"), "[-2.00000000000000, 2.00000000000000]")
        self.assertEqual(calculate_expression("solve([x + y - 1, x - y - 1], [x, y])"), "{x: 1, y: 0}")

    def test_matrix_operations(self):
        """测试矩阵运算"""
        self.assertEqual(calculate_expression("Matrix([[1, 2], [3, 4]]).inv()"), 
                         "Matrix([[-2.00000000000000, 1.00000000000000], [1.50000000000000, -0.500000000000000]])")
        self.assertEqual(calculate_expression("Matrix([[1, 2], [3, 4]]).det()"), "-2.00000000000000")

    def test_error_handling(self):
        """测试错误处理"""
        self.assertTrue(calculate_expression("1 / 0").startswith("Error:"))
        self.assertTrue(calculate_expression("invalid expression").startswith("Error:"))

if __name__ == "__main__":
    unittest.main()
