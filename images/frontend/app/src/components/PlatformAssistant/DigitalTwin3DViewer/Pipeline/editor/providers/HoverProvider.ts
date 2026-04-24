// ─────────────────────────────────────────────────────────────────────────────
// editor/providers/HoverProvider.ts
// ─────────────────────────────────────────────────────────────────────────────

import type { VariableInfo } from "../types";
import { workerBridge } from "../worker/WorkerBridge";

// Inject scrollbar styles once
let scrollbarStyleInjected = false;
function ensureScrollbarStyle() {
    if (scrollbarStyleInjected) return;
    scrollbarStyleInjected = true;
    const style = document.createElement("style");
    style.textContent = `
        .osi-hover::-webkit-scrollbar { width: 8px; height: 8px; }
        .osi-hover::-webkit-scrollbar-track { background: #30363f; }
        .osi-hover::-webkit-scrollbar-thumb { background: #4b5563; border-radius: 4px; }
        .osi-hover::-webkit-scrollbar-thumb:hover { background: #6b7280; }
    `;
    document.head.appendChild(style);
}

// ─────────────────────────────────────────────────────────────────────────────

export async function hoverProvider(view: any, pos: number, _side: any) {
    const { state } = view;
    const wordRange = state.wordAt(pos);
    if (!wordRange) return null;

    const word = state.sliceDoc(wordRange.from, wordRange.to);
    if (!word) return null;

    const line = state.doc.lineAt(pos);
    const lineText = line.text;
    const doc = state.doc.toString();

    const lsPos = wordRange.from;

    const info = await workerBridge.hover(doc, lsPos, lineText, word);

    if (!info) return null;

    return {
        pos: wordRange.from,
        end: wordRange.to,
        above: false,
        strictSide: true,
        create() {
            const dom = document.createElement("div");
            dom.className = "osi-hover";

            Object.assign(dom.style, {
                maxWidth: "600px",
                maxHeight: "300px",
                padding: "6px 8px",
                overflowY: "auto",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                fontSize: "12px",
            });

            dom.innerHTML = buildHoverHTML(info);

            return { dom };
        },
    };
}

// ─── HTML ─────────────────────────────────────────────────────────────────────

function buildHoverHTML(info: VariableInfo): string {
    const sigHTML = info.sig
        ? `<div style="font-weight:600;margin-bottom:4px;font-size:13px;">${escapeHTML(info.sig)}</div>`
        : "";

    const docHTML = info.doc && info.doc !== info.sig
        ? `<div style="line-height:1.45;color:#d1d5db;">${escapeHTML(info.doc)}</div>`
        : "";

    const section = (title: string, items: string[]) =>
        items.length > 0
            ? `<div style="margin-top:6px;font-weight:600;">${title}:</div>
               <ul style="margin:4px 0 0 16px;padding:0;list-style-type:disc;">
                 ${items.map((s) => `<li style="margin-bottom:2px;">${escapeHTML(s)}</li>`).join("")}
               </ul>`
            : "";

    return sigHTML
        + docHTML
        + section("Constants",  info.constants)
        + section("Properties", info.properties ?? [])
        + section("Methods",    info.methods);
}

function escapeHTML(str: string): string {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
