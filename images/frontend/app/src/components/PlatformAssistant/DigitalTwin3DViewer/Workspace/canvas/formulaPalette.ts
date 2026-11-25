// The templates of the visual editor of formulas, by group: what a key shows, its name, and what it inserts in
// MathLive (#0: the selection, #?: a box to fill; the LaTeX MathJax draws)
export interface FormulaKey {
    label: string;
    title: string;
    insert: string;
    // what the key shows, drawn as the formulas are (MathJax)
    show: string;
}

export interface FormulaPaletteGroup {
    id: string;
    label: string;
    keys: FormulaKey[];
}

const key = (label: string, title: string, insert: string, show?: string): FormulaKey => ({ label, title, insert, show: show ?? insert });

export const FORMULA_PALETTE: FormulaPaletteGroup[] = [
    {
        id: "structures",
        label: "Structures",
        keys: [
            key("a/b", "Fraction", "\\frac{#0}{#?}", "\\frac{a}{b}"),
            key("√", "Square root", "\\sqrt{#0}", "\\sqrt{x}"),
            key("ⁿ√", "Root", "\\sqrt[#?]{#0}", "\\sqrt[n]{x}"),
            key("xⁿ", "Superscript", "#0^{#?}", "x^{n}"),
            key("xₙ", "Subscript", "#0_{#?}", "x_{n}"),
            key("∫", "Integral", "\\int_{#?}^{#?}#0", "\\int"),
            key("∑", "Sum", "\\sum_{#?}^{#?}#0", "\\sum"),
            key("∏", "Product", "\\prod_{#?}^{#?}#0", "\\prod"),
            key("lim", "Limit", "\\lim_{#?\\to #?}#0", "\\lim"),
            key("[ ]", "Brackets", "\\left[#0\\right]", "[\\,\\cdot\\,]"),
            key("( )", "Parentheses", "\\left(#0\\right)", "(\\,\\cdot\\,)"),
            key("{ }", "Cases", "\\begin{cases}#? & #?\\\\ #? & #?\\end{cases}", "\\{\\,\\cdot\\,"),
            key("∂/∂x", "Partial derivative", "\\frac{\\partial #?}{\\partial #?}", "\\frac{\\partial}{\\partial x}"),
            key("d/dx", "Derivative", "\\frac{d#?}{d#?}", "\\frac{d}{dx}"),
            key("x̄", "Bar", "\\bar{#0}", "\\bar{x}"),
            key("x⃗", "Vector", "\\vec{#0}", "\\vec{x}"),
            key("x̂", "Hat", "\\hat{#0}", "\\hat{x}"),
            key("ẋ", "Dot", "\\dot{#0}", "\\dot{x}"),
            key("𝐱", "Bold", "\\mathbf{#0}", "\\mathbf{x}"),
            key("abc", "Text", "\\text{#?}", "\\text{abc}"),
        ],
    },
    {
        id: "greek",
        label: "Greek",
        keys: [
            ["α", "alpha"],
            ["β", "beta"],
            ["γ", "gamma"],
            ["δ", "delta"],
            ["ε", "varepsilon"],
            ["θ", "theta"],
            ["λ", "lambda"],
            ["μ", "mu"],
            ["ν", "nu"],
            ["π", "pi"],
            ["ρ", "rho"],
            ["σ", "sigma"],
            ["τ", "tau"],
            ["φ", "varphi"],
            ["ω", "omega"],
            ["Γ", "Gamma"],
            ["Δ", "Delta"],
            ["Π", "Pi"],
            ["Σ", "Sigma"],
            ["Ω", "Omega"],
        ].map(([label, name]) => key(label, name, `\\${name}`)),
    },
    {
        id: "operators",
        label: "Operators",
        keys: [
            ["±", "pm"],
            ["×", "times"],
            ["·", "cdot"],
            ["÷", "div"],
            ["≤", "le"],
            ["≥", "ge"],
            ["≠", "ne"],
            ["≈", "approx"],
            ["≡", "equiv"],
            ["∞", "infty"],
            ["∂", "partial"],
            ["∇", "nabla"],
            ["→", "to"],
            ["⇒", "Rightarrow"],
            ["⇔", "iff"],
            ["∈", "in"],
            ["∀", "forall"],
            ["∃", "exists"],
            ["∪", "cup"],
            ["∩", "cap"],
        ].map(([label, name]) => key(label, name, `\\${name}`)),
    },
    {
        id: "matrices",
        label: "Matrices",
        keys: [
            key("2×2", "Matrix 2×2", "\\begin{bmatrix}#? & #?\\\\ #? & #?\\end{bmatrix}", "\\begin{bmatrix}a&b\\\\c&d\\end{bmatrix}"),
            key(
                "3×3",
                "Matrix 3×3",
                "\\begin{bmatrix}#? & #? & #?\\\\ #? & #? & #?\\\\ #? & #? & #?\\end{bmatrix}",
                "\\begin{bmatrix}\\cdot&\\cdot&\\cdot\\\\\\cdot&\\cdot&\\cdot\\\\\\cdot&\\cdot&\\cdot\\end{bmatrix}",
            ),
            key("2×1", "Vector of 2", "\\begin{bmatrix}#?\\\\ #?\\end{bmatrix}", "\\begin{bmatrix}a\\\\b\\end{bmatrix}"),
            key("3×1", "Vector of 3", "\\begin{bmatrix}#?\\\\ #?\\\\ #?\\end{bmatrix}", "\\begin{bmatrix}a\\\\b\\\\c\\end{bmatrix}"),
            key("|A|", "Determinant", "\\begin{vmatrix}#? & #?\\\\ #? & #?\\end{vmatrix}", "\\begin{vmatrix}a&b\\\\c&d\\end{vmatrix}"),
            key("( )", "Matrix in parentheses", "\\begin{pmatrix}#? & #?\\\\ #? & #?\\end{pmatrix}", "\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}"),
            key("⋯", "Horizontal dots", "\\cdots"),
            key("⋮", "Vertical dots", "\\vdots"),
            key("⋱", "Diagonal dots", "\\ddots"),
            key("ᵀ", "Transpose", "#0^{T}", "\\mathbf{A}^{T}"),
        ],
    },
];
