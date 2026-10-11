// ─────────────────────────────────────────────────────────────────────────────
// editor/worker/LanguageServer.ts
// ─────────────────────────────────────────────────────────────────────────────

import * as ts from "typescript";
import dtsContent  from "./osi4iot.d.ts?raw";
import es2020Lib   from "./es2020.lib.d.ts?raw";
import { interfaceMap }     from "../inference/DtsRegistry";
import type { LSDiagnostic } from "../types";

// ─── Method apply index ───────────────────────────────────────────────────────
// Built from DtsRegistry (osi4iot.d.ts). Maps method label → insert text.

const applyIndex = new Map<string, string>();

for (const iface of interfaceMap.values()) {
    for (const member of iface.members) {
        if (!applyIndex.has(member.label)) {
            applyIndex.set(member.label, member.apply);
        }
    }
}

export function getApplyForMethod(name: string, isConstant: boolean): string {
    if (isConstant) return name;
    return applyIndex.get(name) ?? `${name}()`;
}

const FILE_DTS       = "osi4iot.d.ts";
const FILE_USER      = "user.ts";
const FILE_SYNTHETIC = "synthetic.ts";
const FILE_LIB       = "lib.es2020.d.ts";  // served from bundled content

// ─── Virtual file system ──────────────────────────────────────────────────────

interface VirtualFile { content: string; version: number; }

const vfs = new Map<string, VirtualFile>([
    [FILE_DTS,       { content: dtsContent, version: 1 }],
    [FILE_LIB,       { content: es2020Lib,  version: 1 }],
    [FILE_USER,      { content: "",         version: 1 }],
    [FILE_SYNTHETIC, { content: "",         version: 1 }],
]);

let globalVersion = 10;
function nextVersion() { return ++globalVersion; }

function updateUserFile(rawDoc: string) {
    const { transformed } = getTransformed(rawDoc);
    const entry = vfs.get(FILE_USER)!;
    if (entry.content === transformed) return;
    entry.content = transformed;
    entry.version = nextVersion();
}

function updateSyntheticFile(content: string) {
    const entry = vfs.get(FILE_SYNTHETIC)!;
    entry.content = content;
    entry.version = nextVersion();
}

// ─── Document transformer ─────────────────────────────────────────────────────
// Adds TypeScript type annotations to known entry-point function signatures
// so the LS knows that `msg` is of type `Message`.
//
// function process(msg)  →  function process(msg: Message)
// function start()       →  unchanged
// function init()        →  unchanged
//
// We track the offset introduced by the injection so positions from the
// original document can be translated to/from the transformed document.

interface Offset { from: number; delta: number; }

function transformDoc(doc: string): { transformed: string; offsets: Offset[] } {
    const injection = ": Message";
    const offsets: Offset[] = [];

    const transformed = doc.replace(
        /\bfunction\s+(process|start|init)\s*\(\s*msg\s*\)/g,
        (match, _fn, matchOffset) => {
            const replacement = match.replace("msg)", "msg: Message)");
            offsets.push({
                from:  matchOffset + match.indexOf("msg)") + "msg".length,
                delta: injection.length,
            });
            return replacement;
        }
    );

    return { transformed, offsets };
}

/** Translate a position in the original doc to the transformed doc */
function toTransformedPos(pos: number, offsets: Offset[]): number {
    let delta = 0;
    for (const o of offsets) {
        if (pos >= o.from) delta += o.delta;
    }
    return pos + delta;
}

/** Translate a position in the transformed doc back to the original doc */
function toOriginalPos(pos: number, offsets: Offset[]): number {
    let delta = 0;
    for (const o of offsets) {
        if (pos >= o.from + o.delta) delta += o.delta;
    }
    return pos - delta;
}

// Cached transform result — recomputed only when the doc changes
let lastRawDoc    = "";
let lastTransformed = "";
let lastOffsets: Offset[] = [];

function getTransformed(doc: string): { transformed: string; offsets: Offset[] } {
    if (doc === lastRawDoc) return { transformed: lastTransformed, offsets: lastOffsets };
    const result    = transformDoc(doc);
    lastRawDoc      = doc;
    lastTransformed = result.transformed;
    lastOffsets     = result.offsets;
    return result;
}

// ─── Language Service ─────────────────────────────────────────────────────────

const compilerOptions: ts.CompilerOptions = {
    target:  ts.ScriptTarget.ES2020,
    lib:     [FILE_LIB],
    strict:  false,
    noEmit:  true,
    allowJs: true,
    checkJs: true,
};

const registry = ts.createDocumentRegistry();

const host: ts.LanguageServiceHost = {
    getScriptFileNames:      () => [FILE_DTS, FILE_LIB, FILE_USER, FILE_SYNTHETIC],
    getScriptVersion:        (f) => String(vfs.get(f)?.version ?? 0),
    getScriptSnapshot:       (f) => {
        const file = vfs.get(f);
        return file ? ts.ScriptSnapshot.fromString(file.content) : undefined;
    },
    getCurrentDirectory:     () => "/",
    getCompilationSettings:  () => compilerOptions,
    getDefaultLibFileName:   () => FILE_LIB,
    fileExists:              (f) => vfs.has(f),
    readFile:                (f) => vfs.get(f)?.content,
    getNewLine:              () => "\n",
    useCaseSensitiveFileNames: () => true,
    readDirectory:           () => [],
};

const ls = ts.createLanguageService(host, registry);

// ─── Public types ─────────────────────────────────────────────────────────────

export interface LSCompletion {
    name:     string;
    kind:     string;
    detail:   string;
    doc:      string;
    sortText: string;
}

export interface LSHoverInfo {
    display: string;
    doc:     string;
    members: LSMember[];
}

// ─── Completions ──────────────────────────────────────────────────────────────

export function getCompletions(doc: string, pos: number): LSCompletion[] {
    const { offsets } = getTransformed(doc);
    updateUserFile(doc);
    const transformedPos = toTransformedPos(pos, offsets);

    const raw = ls.getCompletionsAtPosition(FILE_USER, transformedPos, {
        triggerCharacter: "." as ts.CompletionsTriggerCharacter,
        includeCompletionsWithInsertText:   true,
        includeCompletionsForModuleExports: false,
    });

    if (!raw?.entries) return [];

    return raw.entries
        .filter((e) => !BUILTIN_NOISE.has(e.name))
        .map((entry) => {
            const detail = ls.getCompletionEntryDetails(
                FILE_USER, transformedPos, entry.name,
                undefined, undefined, undefined, undefined
            );
            return {
                name:     entry.name,
                kind:     entry.kind,
                detail:   detail?.displayParts?.map((p) => p.text).join("") ?? "",
                doc:      detail?.documentation?.map((p) => p.text).join("") ?? "",
                sortText: entry.sortText,
            };
        });
}

// ─── Hover ────────────────────────────────────────────────────────────────────

export function getHoverInfo(doc: string, pos: number): LSHoverInfo | null {
    const { offsets } = getTransformed(doc);
    updateUserFile(doc);
    const transformedPos = toTransformedPos(pos, offsets);

    const info = ls.getQuickInfoAtPosition(FILE_USER, transformedPos);
    if (!info) return null;

    const display = info.displayParts?.map((p) => p.text).join("") ?? "";
    const doc2    = info.documentation?.map((p) => p.text).join("") ?? "";
    if (!display) return null;

    const typeName = extractTypeName(display);
    const members  = typeName ? getMembersForType(typeName) : [];

    return { display, doc: doc2, members };
}

// ─── Extract type name from quickInfo display string ─────────────────────────
// "const now: Time"       → "Time"
// "const utils: Utils"    → "Utils"
// "const go: GoRoot"      → "GoRoot"
// "(method) Time.Add(…)"  → null  (it's a method, not a variable)

function extractTypeName(display: string): string | null {
    const m = /:\s*([A-Z]\w*)/.exec(display);
    return m ? m[1] : null;
}

// ─── Get members via isolated synthetic file ──────────────────────────────────
//
// Uses FILE_SYNTHETIC (a completely separate file from FILE_USER) so that
// user.ts is NEVER modified. This eliminates any risk of the LS caching a
// corrupted snapshot of the user document.

// ─── Readonly index ───────────────────────────────────────────────────────────
// Built once from the osi4iot.d.ts AST. Maps "InterfaceName.memberName" → true
// for any member declared with the `readonly` modifier.
// Used to distinguish constants (readonly properties) from mutable properties.

const readonlyIndex = new Set<string>();

(function buildReadonlyIndex() {
    const src = ts.createSourceFile(
        FILE_DTS,
        dtsContent,
        ts.ScriptTarget.ES2020,
        /* setParentNodes */ true
    );

    function visit(node: ts.Node) {
        if (ts.isInterfaceDeclaration(node)) {
            const ifaceName = node.name.text;
            for (const member of node.members) {
                if (
                    ts.isPropertySignature(member) &&
                    member.name &&
                    ts.isIdentifier(member.name) &&
                    !!(ts.getCombinedModifierFlags(member) & ts.ModifierFlags.Readonly)
                ) {
                    readonlyIndex.add(`${ifaceName}.${member.name.text}`);
                }
            }
        }
        ts.forEachChild(node, visit);
    }
    visit(src);
})();

// ─── Structured member ────────────────────────────────────────────────────────

export interface LSMember {
    name:       string;
    display:    string;   // cleaned display string, e.g. "Now(): Time"
    kind:       "method" | "constant" | "property";
}

// ─── Get members ─────────────────────────────────────────────────────────────
// Uses FILE_SYNTHETIC (a completely separate file from FILE_USER) so that
// user.ts is NEVER modified. This eliminates any risk of the LS caching a
// corrupted snapshot of the user document.

function getMembersForType(typeName: string): LSMember[] {
    const syntheticDoc = `const __hv__: ${typeName} = null as any;\n__hv__.`;
    const syntheticPos = syntheticDoc.length;

    updateSyntheticFile(syntheticDoc);

    const completions = ls.getCompletionsAtPosition(FILE_SYNTHETIC, syntheticPos, {
        triggerCharacter: "." as ts.CompletionsTriggerCharacter,
        includeCompletionsForModuleExports: false,
    });

    if (!completions?.entries) return [];

    return completions.entries
        .filter((e) => !BUILTIN_NOISE.has(e.name))
        .map((e) => {
            const detail = ls.getCompletionEntryDetails(
                FILE_SYNTHETIC, syntheticPos, e.name,
                undefined, undefined, undefined, undefined
            );
            const display = detail?.displayParts?.map((p) => p.text).join("") ?? e.name;

            let kind: LSMember["kind"];
            if (e.kind === "method") {
                kind = "method";
            } else if (readonlyIndex.has(`${typeName}.${e.name}`)) {
                kind = "constant";
            } else {
                kind = "property";
            }

            return { name: e.name, display, kind };
        });
}

// ─── Noise filter ─────────────────────────────────────────────────────────────

const BUILTIN_NOISE = new Set([
    "hasOwnProperty", "isPrototypeOf", "propertyIsEnumerable",
    "toLocaleString", "toString", "valueOf",
    "__defineGetter__", "__defineSetter__", "__lookupGetter__", "__lookupSetter__",
    "__proto__", "constructor",
]);

// ─── Diagnostics ──────────────────────────────────────────────────────────────

export function getDiagnostics(doc: string): LSDiagnostic[] {
    const { offsets } = getTransformed(doc);
    updateUserFile(doc);

    const syntactic = ls.getSyntacticDiagnostics(FILE_USER);
    const semantic  = ls.getSemanticDiagnostics(FILE_USER);

    return [...syntactic, ...semantic]
        .filter((d) => d.start !== undefined && d.length !== undefined)
        .map((d) => {
            const msg =
                typeof d.messageText === "string"
                    ? d.messageText
                    : d.messageText.messageText;

            const severity: LSDiagnostic["severity"] =
                d.category === ts.DiagnosticCategory.Error   ? "error"   :
                d.category === ts.DiagnosticCategory.Warning ? "warning" : "info";

            // Translate positions from the transformed doc back to the original
            const from = toOriginalPos(d.start!, offsets);
            const to   = toOriginalPos(d.start! + d.length!, offsets);

            return { from, to, severity, message: msg };
        });
}
