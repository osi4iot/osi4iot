// ─────────────────────────────────────────────────────────────────────────────
// editor/worker/editor.worker.ts
// ─────────────────────────────────────────────────────────────────────────────

import { getCompletions, getHoverInfo, getDiagnostics, getApplyForMethod } from "./LanguageServer";
import { getVariableInfo } from "../inference/HoverInfoBuilder";
import type { WorkerRequest, WorkerResponse, SerializableCompletionResult, SerializableMethod } from "../types";

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
    const req = event.data;

    try {
        // ── Completions ───────────────────────────────────────────────────────
        if (req.type === "complete") {
            const entries = getCompletions(req.doc, req.pos);

            const options: SerializableMethod[] = entries.map((e) => {
                const isConstant = e.kind === "const" || e.kind === "property";
                return {
                    label:      e.name,
                    type:       isConstant ? "property" : "method",
                    info:       e.doc,
                    detail:     e.detail,
                    apply:      getApplyForMethod(e.name, isConstant),
                    source:     "ts-ls",
                    returnType: undefined,
                };
            });

            const result: SerializableCompletionResult = {
                from:    req.wordFrom ?? req.pos,
                options,
                validFor: "^\\w*$",
            };

            self.postMessage({ id: req.id, type: "complete", result } as WorkerResponse);
            return;
        }

        // ── Hover ─────────────────────────────────────────────────────────────
        if (req.type === "hover") {
            const lsInfo = getHoverInfo(req.doc, req.pos);

            // Split LS members by kind
            const constants:  string[] = [];
            const properties: string[] = [];
            const methods:    string[] = [];

            if (lsInfo) {
                for (const member of lsInfo.members) {
                    const cleaned = cleanMemberDisplay(member.display);
                    if      (member.kind === "constant")  constants.push(cleaned);
                    else if (member.kind === "property")  properties.push(cleaned);
                    else                                  methods.push(cleaned);
                }
            }

            const hasMembers = constants.length > 0 || properties.length > 0 || methods.length > 0;

            // TS LS found members → use them directly
            if (lsInfo && hasMembers) {
                self.postMessage({
                    id: req.id, type: "hover",
                    result: { sig: lsInfo.display, doc: lsInfo.doc, constants, properties, methods },
                } as WorkerResponse);
                return;
            }

            // Fallback: HoverInfoBuilder uses DtsRegistry and always has the full
            // member list. word and lineText are sent by WorkerBridge.
            const fallback = getVariableInfo(req.word, req.doc, req.lineText);
            if (fallback) {
                self.postMessage({ id: req.id, type: "hover", result: fallback } as WorkerResponse);
                return;
            }

            // Nothing from either source — emit LS display alone if available
            self.postMessage({
                id: req.id, type: "hover",
                result: lsInfo
                    ? { sig: lsInfo.display, doc: lsInfo.doc, constants: [], properties: [], methods: [] }
                    : null,
            } as WorkerResponse);
            return;
        }

        // ── Diagnostics ───────────────────────────────────────────────────────
        if (req.type === "diagnose") {
            const result = getDiagnostics(req.doc);
            self.postMessage({ id: req.id, type: "diagnose", result } as WorkerResponse);
            return;
        }

    } catch (err: any) {
        self.postMessage({
            id: req.id, type: "error",
            message: err?.message ?? String(err),
        } as WorkerResponse);
    }
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cleanMemberDisplay(raw: string): string {
    let s = raw.replace(/^\((property|method)\)\s*/, "");
    s = s.replace(/^[\w]+\./, "");
    return s;
}
