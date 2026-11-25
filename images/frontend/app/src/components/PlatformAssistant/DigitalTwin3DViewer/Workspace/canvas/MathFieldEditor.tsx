// The visual editor of a formula: MathLive's <math-field> (MIT), loaded when it is first shown. One edits on the
// formula itself (boxes, arrows, a/b → fraction, sqrt, alpha…), and its LaTeX is the formula (fromMathlive). Its
// fonts are served at /mathlive-assets/fonts/ (vite.config.ts); no sounds.
import { FC, createElement, useEffect, useRef, useState } from "react";
import { fromMathlive } from "../../../../../tools/mathTex";

// what the dialog asks of the editor
export interface MathFieldControl {
    // a template at the caret (MathLive's: #0 the selection, #? a box to fill)
    insert: (latex: string) => void;
    focus: () => void;
    // the math keyboard of MathLive (on screen)
    toggleKeyboard: () => void;
}

interface MathFieldElementLike extends HTMLElement {
    value: string;
    insert: (s: string, options?: Record<string, unknown>) => boolean;
    focus: () => void;
    smartFence: boolean;
    mathVirtualKeyboardPolicy: string;
}

interface MathliveModule {
    MathfieldElement: { fontsDirectory: string | null; soundsDirectory: string | null };
}
interface KeyboardLike {
    visible: boolean;
    show: () => void;
    hide: () => void;
}

// its letter size, made smaller (down to the least) while a long formula does not fit in its width
const FONT_SIZE = 30;
const FONT_SIZE_MIN = 14;

let loading: Promise<MathliveModule> | null = null;
const loadMathlive = (): Promise<MathliveModule> => {
    loading ??= import("mathlive").then((m) => {
        const module = m as unknown as MathliveModule;
        module.MathfieldElement.fontsDirectory = "/mathlive-assets/fonts";
        module.MathfieldElement.soundsDirectory = null;
        return module;
    });
    return loading;
};

export interface MathFieldEditorProps {
    value: string;
    onChange: (latex: string) => void;
    onControl?: (control: MathFieldControl) => void;
}

export const MathFieldEditor: FC<MathFieldEditorProps> = ({ value, onChange, onControl }) => {
    const ref = useRef<MathFieldElementLike | null>(null);
    const [ready, setReady] = useState(false);
    const [failed, setFailed] = useState(false);
    const changeRef = useRef(onChange);
    changeRef.current = onChange;
    const valueRef = useRef(value);
    valueRef.current = value;
    const fitFrame = useRef(0);

    // the whole formula in sight: its letters as big as fit (MathLive scrolls it, else: its start hidden)
    const fit = (pass = 0) => {
        cancelAnimationFrame(fitFrame.current);
        fitFrame.current = requestAnimationFrame(() => {
            const mf = ref.current;
            const content = mf?.shadowRoot?.querySelector<HTMLElement>("[part=content]");
            if (!mf || !content) return;
            // from the full size, smaller while it does not fit (measured again each time: not all of it scales)
            if (pass === 0) {
                mf.style.fontSize = `${FONT_SIZE}px`;
                fit(1);
                return;
            }
            const current = parseFloat(mf.style.fontSize) || FONT_SIZE;
            const room = content.clientWidth;
            if (room <= 0 || content.scrollWidth <= room || current <= FONT_SIZE_MIN || pass > 8) return;
            const size = Math.max(FONT_SIZE_MIN, Math.min(current - 1, Math.floor((current * room) / content.scrollWidth)));
            mf.style.fontSize = `${size}px`;
            fit(pass + 1);
        });
    };

    useEffect(() => {
        let alive = true;
        loadMathlive()
            .then(() => alive && setReady(true))
            .catch(() => alive && setFailed(true));
        return () => {
            alive = false;
        };
    }, []);

    useEffect(() => {
        const mf = ref.current;
        if (!ready || !mf) return;
        // (its value is set here, never as its content: React would put it back as text, and MathLive would start
        // again, its caret at the end)
        mf.value = valueRef.current;
        mf.smartFence = true;
        mf.mathVirtualKeyboardPolicy = "manual";
        const onInput = () => {
            changeRef.current(fromMathlive(mf.value));
            fit();
        };
        mf.addEventListener("input", onInput);
        onControl?.({
            insert: (latex) => {
                mf.insert(latex, { selectionMode: "placeholder", format: "latex", focus: true });
                changeRef.current(fromMathlive(mf.value));
                fit();
            },
            focus: () => mf.focus(),
            toggleKeyboard: () => {
                const keyboard = (window as unknown as { mathVirtualKeyboard?: KeyboardLike }).mathVirtualKeyboard;
                if (!keyboard) return;
                mf.focus();
                if (keyboard.visible) keyboard.hide();
                else keyboard.show();
            },
        });
        mf.focus();
        fit();
        // its math keyboard: over the dialog, and dark (MathLive reads both from the page)
        const root = document.documentElement;
        const zIndex = root.style.getPropertyValue("--keyboard-zindex");
        const theme = document.body.getAttribute("theme");
        root.style.setProperty("--keyboard-zindex", "5000");
        document.body.setAttribute("theme", "dark");
        return () => {
            if (zIndex) root.style.setProperty("--keyboard-zindex", zIndex);
            else root.style.removeProperty("--keyboard-zindex");
            if (theme === null) document.body.removeAttribute("theme");
            else document.body.setAttribute("theme", theme);
            mf.removeEventListener("input", onInput);
            cancelAnimationFrame(fitFrame.current);
            (window as unknown as { mathVirtualKeyboard?: KeyboardLike }).mathVirtualKeyboard?.hide();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ready]);

    // the formula changed elsewhere (the LaTeX tab): shown here
    useEffect(() => {
        const mf = ref.current;
        if (ready && mf && fromMathlive(mf.value) !== value) {
            mf.value = value;
            fit();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ready, value]);

    if (failed) return <p style={{ margin: 0, color: "#ff8a8a", fontSize: 13 }}>The visual editor could not be loaded: use the LaTeX tab.</p>;
    if (!ready) return <p style={{ margin: 0, color: "#9aa0a6", fontSize: 13 }}>Loading the visual editor…</p>;
    return createElement("math-field", {
        ref,
        "aria-label": "Formula",
        "data-testid": "math-field",
        style: {
            display: "block",
            width: "100%",
            fontSize: `${FONT_SIZE}px`,
            // a click puts the caret there: MathLive ignores the pointer where text cannot be selected, and the
            // platform's labels (where it is) are not selectable (App.css)
            userSelect: "text",
            WebkitUserSelect: "text",
            background: "transparent",
            color: "#e6e8eb",
            border: "none",
            outline: "none",
            "--caret-color": "#8ab4ff",
            "--selection-background-color": "rgba(61,130,240,.35)",
            "--contains-highlight-background-color": "rgba(61,130,240,.12)",
            "--placeholder-color": "#8ab4ff",
            "--smart-fence-color": "#9aa0a6",
        },
    });
};

export default MathFieldEditor;
