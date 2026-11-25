// Insert formula / Edit formula: a Canvas's (a picture of the drawing, with its color and size) or a Text panel's
// (its LaTeX between $ … $ or $$ … $$). Two tabs over the same LaTeX:
//   Visual  MathLive's editor (MathFieldEditor): one edits on the formula, with a palette of templates
//   LaTeX   the LaTeX itself, with a preview (MathJax, as it will be drawn: on a Canvas, the drawing's colors, before
//           the dark theme inverts them). It is also what the Chat Assistant can write.
import { FC, Suspense, lazy, useEffect, useId, useMemo, useRef, useState } from "react";
import styled from "styled-components";
import { Keyboard, Sigma, X } from "lucide-react";
import { scrollbarStyle } from "../../../../Tools/FormTools";
import { texToHtml } from "../../../../../tools/mathTex";
import { CanvasFormula, FORMULA_COLORS, FORMULA_SIZE_MAX, FORMULA_SIZE_MIN, formulaPicture } from "./canvasFormula";
import type { MathFieldControl } from "./MathFieldEditor";
import { FORMULA_PALETTE, FormulaPaletteGroup } from "./formulaPalette";

const MathFieldEditor = lazy(() => import("./MathFieldEditor"));

// what a key of the palette shows: its template drawn as the formulas are (our own LaTeX, MathJax's SVG)
const keyFace = (tex: string): string => texToHtml(tex, true);

const font = 'Roboto, "Helvetica Neue", Arial, sans-serif';

const Backdrop = styled.div`
    position: fixed;
    inset: 0;
    z-index: 4000;
    display: flex;
    /* at the top: MathLive's math keyboard comes up from the bottom */
    align-items: flex-start;
    justify-content: center;
    padding: 24px 16px;
    background: rgba(0, 0, 0, 0.55);
`;

const Dialog = styled.form`
    width: 860px;
    max-width: 100%;
    max-height: calc(100vh - 32px);
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 18px;
    box-sizing: border-box;
    background: #16181c;
    border: 1px solid #2c3137;
    border-radius: 14px;
    color: #e6e8eb;
    font-family: ${font};
    overflow-y: auto;
    ${scrollbarStyle}

    h2 {
        margin: 0;
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 17px;
        font-weight: 600;
    }
    h2 svg {
        width: 18px;
        height: 18px;
        color: #8ab4ff;
    }
    label > span {
        display: block;
        margin-bottom: 4px;
        font-size: 12px;
        color: #9aa0a6;
    }
    select,
    input {
        height: 34px;
        padding: 0 8px;
        box-sizing: border-box;
        background: #0f1114;
        border: 1px solid #2c3137;
        border-radius: 8px;
        color: #e6e8eb;
        font: 14px ${font};
    }
`;

const Head = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;

    button {
        margin-left: auto;
    }
`;

const Source = styled.textarea`
    width: 100%;
    min-height: 120px;
    resize: vertical;
    box-sizing: border-box;
    padding: 10px;
    background: #0f1114;
    border: 1px solid #2c3137;
    border-radius: 8px;
    color: #e6e8eb;
    font:
        14px/1.5 ui-monospace,
        SFMono-Regular,
        Menlo,
        Monaco,
        "Liberation Mono",
        monospace;
    ${scrollbarStyle}
`;

const Row = styled.div`
    display: flex;
    gap: 12px;
    align-items: flex-end;
    flex-wrap: wrap;
`;

// the drawing's paper: the formula with its colors as they are in the scene
const Preview = styled.div`
    min-height: 90px;
    max-height: 320px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 14px;
    overflow: auto;
    background: #ffffff;
    border-radius: 8px;
    ${scrollbarStyle}

    img {
        max-width: none;
    }
`;

const Note = styled.p<{ $error?: boolean }>`
    margin: 0;
    font-size: 12px;
    color: ${({ $error }) => ($error ? "#ff8a8a" : "#9aa0a6")};
`;

const Actions = styled.div`
    display: flex;
    justify-content: flex-end;
    gap: 8px;

    button {
        height: 36px;
        padding: 0 14px;
        border-radius: 8px;
        font: 500 14px ${font};
        cursor: pointer;
    }
`;

const Secondary = styled.button`
    background: #1b1e22;
    border: 1px solid #2c3137;
    color: #d5d9de;
`;

const Primary = styled.button`
    background: #3d82f0;
    border: 1px solid #3d82f0;
    color: #fff;

    &:disabled {
        opacity: 0.5;
        cursor: default;
    }
`;

const Close = styled.button`
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: 1px solid #2c3137;
    border-radius: 8px;
    color: #c7cbd1;
    cursor: pointer;

    svg {
        width: 15px;
        height: 15px;
    }
`;

const Tabs = styled.div`
    display: flex;
    gap: 2px;
    padding: 3px;
    margin-left: 16px;
    background: #0f1114;
    border: 1px solid #2c3137;
    border-radius: 9px;

    button {
        height: 30px;
        padding: 0 14px;
        border: 0;
        border-radius: 6px;
        background: transparent;
        color: #c7cbd1;
        font: 500 13px ${font};
        cursor: pointer;
    }
    button[aria-selected="true"] {
        background: #3d82f0;
        color: #fff;
    }
`;

const Groups = styled.div`
    display: flex;
    gap: 6px;
    flex-wrap: wrap;

    button {
        height: 32px;
        padding: 0 12px;
        border-radius: 16px;
        border: 1px solid #2c3137;
        background: #1b1e22;
        color: #c7cbd1;
        font: 13px ${font};
        cursor: pointer;
    }
    button[aria-pressed="true"] {
        border-color: #3d82f0;
        background: rgba(61, 130, 240, 0.18);
        color: #cfe0ff;
    }
`;

const Keys = styled.div`
    display: grid;
    grid-template-columns: repeat(10, minmax(0, 1fr));
    gap: 6px;

    button {
        height: 44px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #1b1e22;
        border: 1px solid #2c3137;
        border-radius: 8px;
        color: #e6e8eb;
        font-size: 14px;
        cursor: pointer;
    }
    button:hover {
        border-color: #3d82f0;
    }
    .key {
        display: flex;
        align-items: center;
        justify-content: center;
    }
    .key mjx-container,
    .key .math-display {
        margin: 0 !important;
    }
    .key svg {
        max-height: 36px;
        max-width: 100%;
    }
`;

const Field = styled.div`
    min-height: 150px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 18px;
    box-sizing: border-box;
    background: #0f1114;
    border: 1px solid #3d82f0;
    border-radius: 10px;
    box-shadow: 0 0 0 3px rgba(61, 130, 240, 0.18);

    /* the math keyboard: the dialog's own button */
    math-field::part(virtual-keyboard-toggle) {
        display: none;
    }
`;

const Hints = styled.div`
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
    font-size: 12px;
    color: #9aa0a6;

    b {
        color: #c7cbd1;
    }
`;

const Tool = styled.button`
    margin-left: auto;
    height: 34px;
    padding: 0 12px;
    display: flex;
    align-items: center;
    gap: 6px;
    background: #1b1e22;
    border: 1px solid #2c3137;
    border-radius: 8px;
    color: #d5d9de;
    font: 13px ${font};
    cursor: pointer;

    svg {
        width: 16px;
        height: 16px;
    }
`;

export type FormulaTab = "visual" | "latex";

export interface FormulaDialogProps {
    // the formula to edit, or the defaults of a new one
    formula: CanvasFormula;
    editing: boolean;
    // its color and size (a Canvas's); a Text panel's formula has neither
    look?: boolean;
    // the tab it opens on
    tab?: FormulaTab;
    onApply: (formula: CanvasFormula) => void;
    onDiscard: () => void;
}

export const FormulaDialog: FC<FormulaDialogProps> = ({ formula, editing, look = true, tab: firstTab = "visual", onApply, onDiscard }) => {
    const titleId = useId();
    const [tab, setTab] = useState<FormulaTab>(firstTab);
    const [group, setGroup] = useState<FormulaPaletteGroup>(FORMULA_PALETTE[0]);
    const [tex, setTex] = useState(formula.tex);
    const [color, setColor] = useState(formula.color);
    const [size, setSize] = useState(formula.size);
    const [inline, setInline] = useState(!!formula.inline);
    const area = useRef<HTMLTextAreaElement>(null);
    const field = useRef<MathFieldControl | null>(null);
    useEffect(() => {
        if (tab === "latex") area.current?.focus();
        else field.current?.focus();
    }, [tab]);
    const colors = FORMULA_COLORS.some((c) => c.color === color) ? FORMULA_COLORS : [...FORMULA_COLORS, { color, label: color }];
    const result = (): CanvasFormula => (inline ? { tex, color, size, inline: true } : { tex, color, size });
    const picture = useMemo(
        () => (tab === "latex" && tex.trim() ? formulaPicture(inline ? { tex, color, size, inline: true } : { tex, color, size }) : null),
        [tab, tex, color, size, inline],
    );

    return (
        // (its pointer is its own: not the page's below it, as the canvas's or the chat's listeners)
        <Backdrop onPointerDown={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
            <Dialog
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === "Escape") onDiscard();
                    if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && tex.trim()) onApply(result());
                }}
                onSubmit={(e) => {
                    // (opened from another dialog's form, as the Text panel's: its submit is not that form's)
                    e.preventDefault();
                    e.stopPropagation();
                    if (tex.trim()) onApply(result());
                }}
            >
                <Head>
                    <h2 id={titleId}>
                        <Sigma aria-hidden="true" />
                        {editing ? "Edit formula" : "Insert formula"}
                    </h2>
                    <Tabs role="tablist" aria-label="Editor">
                        <button type="button" role="tab" aria-selected={tab === "visual"} onClick={() => setTab("visual")}>
                            Visual
                        </button>
                        <button type="button" role="tab" aria-selected={tab === "latex"} onClick={() => setTab("latex")}>
                            LaTeX
                        </button>
                    </Tabs>
                    <Close type="button" aria-label="Discard" onClick={onDiscard}>
                        <X aria-hidden="true" />
                    </Close>
                </Head>

                {tab === "visual" ? (
                    <>
                        <Groups role="group" aria-label="Templates">
                            {FORMULA_PALETTE.map((g) => (
                                <button key={g.id} type="button" aria-pressed={g.id === group.id} onClick={() => setGroup(g)}>
                                    {g.label}
                                </button>
                            ))}
                        </Groups>
                        <Keys>
                            {group.keys.map((k) => (
                                <button
                                    key={k.label}
                                    type="button"
                                    title={k.title}
                                    aria-label={k.title} // (the formula keeps the focus, and its caret)
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => field.current?.insert(k.insert)}
                                >
                                    <span className="key" dangerouslySetInnerHTML={{ __html: keyFace(k.show) }} />
                                </button>
                            ))}
                        </Keys>
                        <label>
                            <span>Formula · type on it</span>
                            <Field>
                                <Suspense fallback={<Note>Loading the visual editor…</Note>}>
                                    <MathFieldEditor value={tex} onChange={setTex} onControl={(c) => (field.current = c)} />
                                </Suspense>
                            </Field>
                        </label>
                        <Hints>
                            <span>
                                <b>a/b</b> fraction
                            </span>
                            <span>
                                <b>sqrt</b> root
                            </span>
                            <span>
                                <b>alpha</b> → α
                            </span>
                            <span>
                                <b>^ _</b> superscript, subscript
                            </span>
                            <span>
                                <b>Tab / ← →</b> next box
                            </span>
                        </Hints>
                    </>
                ) : (
                    <>
                        <label>
                            <span>LaTeX · the same formula as the Visual tab</span>
                            <Source
                                ref={area}
                                aria-label="LaTeX"
                                value={tex}
                                spellCheck={false}
                                placeholder={"\\Pi(u_2,u_3)=\\tfrac12\\,k\\,u_2^2-qL\\,u_2"}
                                onChange={(e) => setTex(e.target.value)}
                            />
                        </label>
                        <label>
                            <span>Preview · as it will be drawn (MathJax)</span>
                            <Preview aria-label="Preview">
                                {picture && <img src={picture.dataURL} width={picture.width} height={picture.height} alt={tex} />}
                            </Preview>
                        </label>
                        {picture?.error && <Note $error>Part of the LaTeX could not be read: it is shown in red.</Note>}
                    </>
                )}

                <Row>
                    {look && (
                        <>
                            <label>
                                <span>Color</span>
                                <select aria-label="Color" value={color} onChange={(e) => setColor(e.target.value)}>
                                    {colors.map((c) => (
                                        <option key={c.color} value={c.color}>
                                            {c.label}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <label>
                                <span>Size (as a text)</span>
                                <input
                                    aria-label="Size"
                                    type="number"
                                    min={FORMULA_SIZE_MIN}
                                    max={FORMULA_SIZE_MAX}
                                    step={1}
                                    value={size}
                                    onChange={(e) => {
                                        const n = Number(e.target.value);
                                        if (Number.isFinite(n)) setSize(Math.min(FORMULA_SIZE_MAX, Math.max(FORMULA_SIZE_MIN, n)));
                                    }}
                                    style={{ width: 110 }}
                                />
                            </label>
                        </>
                    )}
                    <label>
                        <span>Mode</span>
                        <select aria-label="Mode" value={inline ? "inline" : "display"} onChange={(e) => setInline(e.target.value === "inline")}>
                            <option value="display">Display ($$ … $$)</option>
                            <option value="inline">Inline ($ … $)</option>
                        </select>
                    </label>
                    {tab === "visual" && (
                        <Tool type="button" onClick={() => field.current?.toggleKeyboard()}>
                            <Keyboard aria-hidden="true" />
                            Math keyboard
                        </Tool>
                    )}
                </Row>

                <Actions>
                    <Secondary type="button" onClick={onDiscard}>
                        Cancel
                    </Secondary>
                    <Primary type="submit" disabled={!tex.trim()}>
                        {editing ? "Apply" : "Insert"}
                    </Primary>
                </Actions>
            </Dialog>
        </Backdrop>
    );
};
