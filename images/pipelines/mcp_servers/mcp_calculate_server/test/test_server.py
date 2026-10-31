import unittest
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from server import calculate_expression, safe_eval

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

class TestSafety(unittest.TestCase):
    """The expression comes from the AI agent: nothing but mathematics may run."""

    ATTACKS = [
        "__import__('os').system('id')",
        "__import__('os').popen('id').read()",
        "open('/proc/self/environ').read()",
        "().__class__.__base__.__subclasses__()",
        "x.__class__.__mro__",
        "Matrix.__init__.__globals__",
        "sympify(\"__import__('os').getcwd()\")",
        "S(\"__import__('os').getcwd()\")",
        "parse_expr(\"__import__('os').getcwd()\")",
        "lambdify(x, x)",
        "var('a')",
        "exec('import os')",
        "eval('1+1')",
        "getattr(x, 'evalf')",
        "globals()",
        "[c for c in (1, 2)]",
        "(lambda: 1)()",
        "Symbol('a').func",
        "symbols(__import__('os').getcwd())",
        "Function('f')(x).__class__",
        "Matrix([[1, 2], [3, 4]]).eigenvals.__self__.__class__",
        "integrate(__import__('os').getcwd(), (x, -oo, oo))",
        "solve([__import__('os').getcwd()], [x])",
        "Matrix(__import__('os').listdir('/')).eigenvals()",
    ]

    def test_attacks_are_refused(self):
        for expression in self.ATTACKS:
            result = calculate_expression(expression)
            self.assertRegex(result, r"(?i)error", f"{expression!r} -> {result!r}")

    def test_safe_eval_refuses_directly(self):
        for expression in self.ATTACKS:
            with self.assertRaises(Exception, msg=expression):
                safe_eval(expression)

    def test_other_names_are_symbols(self):
        self.assertEqual(calculate_expression("diff(t**2, t)"), "2.0*t")
        self.assertEqual(float(calculate_expression("Sum(k, (k, 1, 10)).doit()")), 55.0)
        # a name that is not a SymPy function is a symbol, which cannot be called
        self.assertTrue(calculate_expression("globals()").startswith("Error:"))

    def test_too_long(self):
        self.assertTrue(calculate_expression("1+" * 1500 + "1").startswith("Error:"))

    def test_documented_examples_still_work(self):
        examples = {
            "2 + 3*5": "17",
            "expand((x + 1)**2)": None,
            "diff(sin(x), x)": "cos(x)",
            "integrate(exp(x), (x, 0, 1))": None,
            "solve(x**2 - 4, x)": None,
            "limit(tan(x)/x, x, 0)": None,
            "Sum(k, (k, 1, 10)).doit()": None,
            "Matrix([[1, 2], [3, 4]]).inv()": None,
            "simplify((x**2 - 1)/(x + 1))": None,
            "factor(x**2 - 2*x - 15)": None,
            "series(cos(x), x, 0, 4)": None,
            "integrate(exp(-x**2)*sin(x), (x, -oo, oo))": None,
            "solve([x**2 + y**2 - 1, x + y - 1], [x, y])": None,
            "Matrix([[1, 2, 3], [4, 5, 6], [7, 8, 9]]).eigenvals()": None,
            "Matrix([[10, 2], [2, 5]]).eigenvects()": None,
            "Matrix([[1, 2], [3, 4]])[0, 1]": "2.00000000000000",
            "Matrix([[1, 2], [3, 4]]).T.det()": None,
            "symbols('a b')": None,
            "Eq(x**2, 4)": None,
            "sqrt(2)*pi": None,
            "100e6 / 3.2e-5": None,
            "abs(-3) + max(1, 2)": "5",
        }
        for expression, expected in examples.items():
            result = calculate_expression(expression)
            self.assertFalse(result.lower().startswith(("error", "integration error", "equation solving error",
                                                        "matrix eigenvalue calculation error")),
                             f"{expression!r} -> {result!r}")
            if expected is not None:
                self.assertEqual(result, expected, expression)



class TestLimits(unittest.TestCase):
    """Enormous calculations are stopped without stopping the calculator."""

    @classmethod
    def setUpClass(cls):
        import server
        cls.server = server
        cls.saved = (server._worker.timeout, server._worker.megabytes)
        server._worker._stop()
        server._worker.timeout, server._worker.megabytes = 3, 512

    @classmethod
    def tearDownClass(cls):
        cls.server._worker._stop()
        cls.server._worker.timeout, cls.server._worker.megabytes = cls.saved

    def test_too_long_is_stopped_and_the_next_works(self):
        result = calculate_expression("expand((x + y + z + 1)**300)")
        self.assertIn("took longer than", result)
        self.assertEqual(calculate_expression("2 + 3*5"), "17")

    def test_huge_power(self):
        result = calculate_expression("9**9**9")
        self.assertTrue(result.startswith("Error:"), result)
        self.assertEqual(calculate_expression("2**8"), "256")

    def test_too_much_memory(self):
        result = calculate_expression("[0] * 10**9")
        self.assertTrue(result.startswith("Error:"), result)
        self.assertIn("MB", result)
        self.assertEqual(calculate_expression("2**8"), "256")


if __name__ == "__main__":
    unittest.main()
