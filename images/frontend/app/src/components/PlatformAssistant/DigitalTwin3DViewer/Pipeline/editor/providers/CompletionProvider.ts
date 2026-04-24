import type { CompletionContext, CompletionResult as CMCompletionResult } from "@codemirror/autocomplete";
import type { CompletionResult, SerializableCompletionResult, SerializableMethod, Method } from "../types";
import { workerBridge } from "../worker/WorkerBridge";

// ─── Deserialization ──────────────────────────────────────────────────────────

const INSERT_PREFIX = "__insert__:";

function deserializeApply(apply: string): Method {
    if (!apply.startsWith(INSERT_PREFIX)) return apply; // plain string

    const rest = apply.slice(INSERT_PREFIX.length);

    // Format A (with cursor): "__insert__:<insert>:<iniChar>:<endChar>"
    // Format B (legacy):      "__insert__:<insert>"
    // The last two colon-separated tokens are numbers for cursor positions.
    const lastColon       = rest.lastIndexOf(":");
    const secondLastColon = rest.lastIndexOf(":", lastColon - 1);

    if (secondLastColon !== -1) {
        const insert  = rest.slice(0, secondLastColon);
        const iniChar = parseInt(rest.slice(secondLastColon + 1, lastColon), 10);
        const endChar = parseInt(rest.slice(lastColon + 1), 10);

        if (!isNaN(iniChar) && !isNaN(endChar)) {
            return (view: any, _completion: any, from: number, to: any) => {
                view.dispatch({
                    changes:   { from, to, insert },
                    selection: { anchor: from + iniChar, head: from + endChar },
                });
            };
        }
    }

    // Format B — no cursor positions, place cursor at end
    const insert = rest;
    return (view: any, _completion: any, from: number, to: any) => {
        view.dispatch({
            changes:   { from, to, insert },
            selection: { anchor: from + insert.length, head: from + insert.length },
        });
    };
}

export function deserializeCompletionResult(raw: SerializableCompletionResult): CompletionResult {
    return {
        from:    raw.from,
        validFor: new RegExp(raw.validFor),
        options:  raw.options.map((m: SerializableMethod) => ({
            ...m,
            apply: deserializeApply(m.apply),
        })),
    };
}

// ─── CodeMirror provider ──────────────────────────────────────────────────────

export async function completionProvider(
    context: CompletionContext
): Promise<CMCompletionResult | null> {
    // Match the word/chain being typed before the cursor
    const before = context.matchBefore(/[\w.]*/);
    if (!before || (!context.explicit && before.from === before.to)) return null;

    const doc = context.state.doc.toString();
    const pos = context.pos;

    // wordFrom = start of the current word token (after the dot)
    // e.g.  "now.Add|"  → wordFrom is position of 'A', pos is after 'd'
    const wordMatch = context.matchBefore(/\w*/);
    const wordFrom  = wordMatch?.from ?? pos;

    const result = await workerBridge.complete(doc, pos, wordFrom);
    if (!result) return null;

    return {
        from:    result.from,
        options: result.options,
        validFor: result.validFor,
    };
}
