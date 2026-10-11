// ─────────────────────────────────────────────────────────────────────────────
// CodeMirror linting source that delegates to the TypeScript Language Service.
// Shows type errors and syntax errors as red/yellow underlines in the editor.
//
// Install: yarn add @codemirror/lint
// ─────────────────────────────────────────────────────────────────────────────

import type { Diagnostic } from "@codemirror/lint";
import type { EditorView }  from "@codemirror/view";
import { workerBridge }     from "../worker/WorkerBridge";

/**
 * Async lint source for CodeMirror.
 *
 * Usage in buildEditorExtensions():
 *   import { linter } from "@codemirror/lint";
 *   import { lintSource } from "./providers/LintProvider";
 *   ...
 *   linter(lintSource, { delay: 500 })
 *
 * The `delay` throttles how often diagnostics are recomputed while typing.
 * 500ms is a good default — low enough to feel responsive, high enough to
 * avoid hammering the TS Language Service on every keystroke.
 */
export async function lintSource(view: EditorView): Promise<Diagnostic[]> {
    const doc = view.state.doc.toString();
    const lsDiagnostics = await workerBridge.diagnose(doc);

    return lsDiagnostics.map((d) => ({
        from:     d.from,
        to:       d.to,
        severity: d.severity,
        message:  d.message,
    }));
}
