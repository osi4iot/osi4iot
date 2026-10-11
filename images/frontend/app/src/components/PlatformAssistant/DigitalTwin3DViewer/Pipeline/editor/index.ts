import { javascript, javascriptLanguage } from "@codemirror/lang-javascript";
import { indentUnit, indentOnInput } from "@codemirror/language";
import { keymap, hoverTooltip } from "@codemirror/view";
import { acceptCompletion, completionKeymap } from "@codemirror/autocomplete";
import { indentWithTab } from "@codemirror/commands";
import { linter, lintGutter } from "@codemirror/lint";

import { hoverProvider } from "./providers/HoverProvider";
import { lintSource } from "./providers/LintProvider";
import { workerBridge } from "./worker/WorkerBridge";
import { completionProvider } from "./providers/CompletionProvider";
import { ReIndentCommand } from "../types";
import { Prec } from "@uiw/react-codemirror";

export { workerBridge };
export type { VariableInfo } from "./types";

// ─────────────────────────────────────────────────────────────────────────────

export interface EditorOptions {
    hoverTime?: number; // ms before hover tooltip appears (default: 180)
    lintDelay?: number; // ms debounce before re-running diagnostics (default: 500)
    showLintGutter?: boolean; // show error icons in the left gutter (default: true)
}

export function buildEditorExtensions(options: EditorOptions = {}) {
    const { hoverTime = 180, lintDelay = 500, showLintGutter = true } = options;

    return [
        javascript({ typescript: true }),

        // Autocomplete
        javascriptLanguage.data.of({
            autocomplete: completionProvider,
        }),

        // Type-error diagnostics
        linter(lintSource, { delay: lintDelay }),
        ...(showLintGutter ? [lintGutter()] : []),

        // Formatting
        indentUnit.of("    "),
        indentOnInput(),

        // Hover tooltips
        hoverTooltip(hoverProvider, { hoverTime }),

        Prec.highest(keymap.of([{ key: "Tab", run: acceptCompletion }])),

        // Keymaps
        keymap.of([...completionKeymap, indentWithTab, ReIndentCommand]),
    ];
}

/** Call when the editor component unmounts to terminate the Web Worker */
export function disposeEditor() {
    workerBridge.dispose();
}

/** Call when the editor component remounts after a previous dispose */
export function restartEditor() {
    workerBridge.restart();
}
