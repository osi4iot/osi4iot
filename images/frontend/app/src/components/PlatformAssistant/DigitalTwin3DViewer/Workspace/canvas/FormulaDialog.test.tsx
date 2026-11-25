import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const inserted: string[] = [];
// MathLive needs a real browser: the visual editor is a field of LaTeX here, and its templates are noted
vi.mock("./MathFieldEditor", () => ({
    default: ({ value, onChange, onControl }: any) => {
        onControl?.({ insert: (t: string) => inserted.push(t), focus: () => undefined, toggleKeyboard: () => undefined });
        return <input aria-label="Formula" value={value} onChange={(e) => onChange(e.target.value)} />;
    },
}));

import { FormulaDialog } from "./FormulaDialog";
import { fromMathlive } from "../../../../../tools/mathTex";

describe("Insert formula", () => {
    it("edits on the formula (Visual) or its LaTeX, the same formula", async () => {
        const onApply = vi.fn();
        render(<FormulaDialog formula={{ tex: "x", color: "#1e1e1e", size: 28 }} editing={false} onApply={onApply} onDiscard={vi.fn()} />);
        expect(screen.getByRole("tab", { name: "Visual" })).toHaveAttribute("aria-selected", "true");
        const field = await screen.findByLabelText("Formula");
        expect(field).toHaveValue("x");
        // the templates, by group
        fireEvent.click(screen.getByRole("button", { name: "Fraction" }));
        fireEvent.click(screen.getByRole("button", { name: "Greek" }));
        fireEvent.click(screen.getByRole("button", { name: "alpha" }));
        expect(inserted).toEqual(["\\frac{#0}{#?}", "\\alpha"]);
        fireEvent.change(field, { target: { value: "\\frac{a}{b}" } });
        // no preview while editing on the formula: it is what you see
        expect(screen.queryByLabelText("Preview")).toBeNull();
        fireEvent.click(screen.getByRole("tab", { name: "LaTeX" }));
        expect(screen.getByLabelText("LaTeX")).toHaveValue("\\frac{a}{b}");
        expect(screen.getByLabelText("Preview").querySelector("img")).not.toBeNull();
        fireEvent.change(screen.getByLabelText("Mode"), { target: { value: "inline" } });
        fireEvent.click(screen.getByRole("button", { name: "Insert" }));
        expect(onApply).toHaveBeenCalledWith({ tex: "\\frac{a}{b}", color: "#1e1e1e", size: 28, inline: true });
    });

    it("has no color nor size for a Text panel's formula", () => {
        render(<FormulaDialog formula={{ tex: "x", color: "#1e1e1e", size: 28 }} editing look={false} tab="latex" onApply={vi.fn()} onDiscard={vi.fn()} />);
        expect(screen.getByRole("dialog", { name: "Edit formula" })).toBeInTheDocument();
        expect(screen.queryByLabelText("Color")).toBeNull();
        expect(screen.queryByLabelText("Size")).toBeNull();
        expect(screen.getByLabelText("Mode")).toBeInTheDocument();
    });

    it("reads MathLive's LaTeX as MathJax does", () => {
        expect(fromMathlive("\\frac{\\placeholder{}}{\\placeholder[x]{b}}")).toBe("\\frac{\\square}{b}");
        expect(fromMathlive("\\mleft(x\\mright)\\differentialD x\\exponentialE")).toBe("\\left(x\\right)\\mathrm{d} x\\mathrm{e}");
    });
});
