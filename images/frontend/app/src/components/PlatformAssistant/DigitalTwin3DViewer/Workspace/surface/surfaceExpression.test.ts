import { describe, expect, it } from "vitest";
import { compileSurfaceExpression, isReservedSurfaceName } from "./surfaceExpression";

const z = (text: string, vars: Record<string, number> = {}, params: string[] = Object.keys(vars).filter((k) => k !== "x" && k !== "y")) => {
    const compiled = compileSurfaceExpression(text, params);
    if ("error" in compiled) throw new Error(compiled.error);
    return compiled.evaluate({ x: 0, y: 0, ...vars });
};

describe("formulas of the 3D Surface", () => {
    it("computes as on a calculator", () => {
        expect(z("1 + 2 * 3")).toBe(7);
        expect(z("(1 + 2) * 3")).toBe(9);
        expect(z("2^3^2")).toBe(512);
        expect(z("-x^2", { x: 3 })).toBe(-9);
        expect(z("2^-1")).toBe(0.5);
        expect(z("10 / 4 - 1e-1")).toBeCloseTo(2.4);
        expect(z("x^2 + y^2", { x: 3, y: 4 })).toBe(25);
        expect(z("sqrt(x^2 + y^2)", { x: 3, y: 4 })).toBe(5);
        expect(z("atan2(y, x)", { x: 1, y: 1 })).toBeCloseTo(Math.PI / 4);
        expect(z("max(1, x, 3)", { x: 5 })).toBe(5);
        expect(z("mod(-1, 3)")).toBe(2);
        expect(z("log(e)")).toBe(1);
        expect(z("2pi")).toBeCloseTo(2 * Math.PI);
    });

    it("takes a product without its sign", () => {
        expect(z("2x", { x: 3 })).toBe(6);
        expect(z("3(x + 1)", { x: 1 })).toBe(6);
        expect(z("(x + 1)(x - 1)", { x: 3 })).toBe(8);
        expect(z("2sin(x)", { x: Math.PI / 2 })).toBe(2);
        expect(z("x y", { x: 2, y: 5 })).toBe(10);
    });

    it("uses the parameters of the panel, which can hide a constant", () => {
        const compiled = compileSurfaceExpression("A*sin(k*x)*cos(k*y) + e", ["A", "k", "B"]);
        if ("error" in compiled) throw new Error(compiled.error);
        expect(compiled.params.sort()).toEqual(["A", "k"]);
        expect(compiled.evaluate({ x: Math.PI / 2, y: 0, A: 2, k: 1 })).toBeCloseTo(2 + Math.E);
        expect(z("e * 2", { e: 10 }, ["e"])).toBe(20);
    });

    it("gives a hole where the formula has no value", () => {
        expect(z("log(x)", { x: -1 })).toBeNaN();
        expect(z("1 / x", { x: 0 })).toBeNaN();
    });

    it("says why a formula is not valid, and where", () => {
        expect(compileSurfaceExpression("")).toEqual({ error: "Write a formula: z = f(x, y)" });
        expect(compileSurfaceExpression("x + A")).toEqual({ error: 'Unknown name "A": add it as a parameter', at: 4 });
        expect(compileSurfaceExpression("sin x")).toEqual({ error: "sin needs its value in parentheses: sin(x)", at: 0 });
        expect(compileSurfaceExpression("atan2(x)")).toEqual({ error: "atan2() takes 2 values", at: 0 });
        expect(compileSurfaceExpression("(x + 1")).toEqual({ error: '")" expected at the end', at: 6 });
        expect(compileSurfaceExpression("x + 1)")).toEqual({ error: 'A ")" without its "("', at: 5 });
        expect(compileSurfaceExpression("x * ")).toEqual({ error: "The formula ends too soon", at: 4 });
        expect(compileSurfaceExpression("x; alert(1)")).toEqual({ error: '";" cannot be in a formula', at: 1 });
        // what every JavaScript object inherits is not a function or a constant of the formulas
        for (const name of ["constructor(x)", "toString", "__proto__", "valueOf(1)", "hasOwnProperty"]) {
            expect(compileSurfaceExpression(name)).toMatchObject({ error: expect.stringContaining("Unknown name") });
        }
        expect(compileSurfaceExpression("x".repeat(501))).toMatchObject({ error: expect.stringContaining("at most 500") });
        expect(compileSurfaceExpression("(".repeat(70) + "x" + ")".repeat(70))).toMatchObject({ error: expect.stringContaining("nested") });
    });

    it("keeps the names of variables, constants and functions for itself", () => {
        expect(isReservedSurfaceName("x")).toBe(true);
        expect(isReservedSurfaceName("Sin")).toBe(true);
        expect(isReservedSurfaceName("PI")).toBe(true);
        expect(isReservedSurfaceName("A")).toBe(false);
    });
});
