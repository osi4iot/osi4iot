// ─────────────────────────────────────────────────────────────────────────────
// editor/inference/DtsRegistry.ts
//
// Single source of truth for all type/completion information, parsed once at
// startup from osi4iot.d.ts. Replaces ClassDefinitions entirely.
//
// Maps built:
//   interfaceMap:    interfaceName → DtsInterface
//   returnTypeMap:   "IfaceName.methodName" → returnIfaceName
//   factoryMap:      GoRoot method label → return interfaceName
//   destructureMap:  GoAllResult prop name → interfaceName
//   instanceVarMap:  interfaceName → canonical var name (from GoAllResult)
// ─────────────────────────────────────────────────────────────────────────────

import * as ts from "typescript";
import dtsContent from "../worker/osi4iot.d.ts?raw";

// ─── Public types ─────────────────────────────────────────────────────────────

export interface DtsMember {
    label:      string;
    kind:       "method" | "constant" | "property";
    doc:        string;   // JSDoc text
    detail:     string;   // full signature, e.g. "Now(): Time"
    returnType: string;   // interface name of return, "" for primitives/void
    apply:      string;   // insert text for completion
}

export interface DtsInterface {
    name:    string;      // e.g. "TimePackage"
    doc:     string;      // raw JSDoc on the interface
    members: DtsMember[];
}

// ─── AST helpers ──────────────────────────────────────────────────────────────

const src = ts.createSourceFile(
    "osi4iot.d.ts",
    dtsContent,
    ts.ScriptTarget.ES2020,
    /* setParentNodes */ true,
);

function getJsDoc(node: ts.Node): string {
    const ranges = ts.getLeadingCommentRanges(dtsContent, node.pos);
    if (!ranges) return "";
    for (const r of [...ranges].reverse()) {
        const text = dtsContent.slice(r.pos, r.end);
        if (text.startsWith("/**")) {
            return text
                .replace(/^\/\*\*\s*/, "")
                .replace(/\s*\*\/$/, "")
                .replace(/^\s*\*\s?/gm, "")
                .trim();
        }
    }
    return "";
}

function isReadonlyMember(member: ts.TypeElement): boolean {
    return !!(
        ts.getCombinedModifierFlags(member as ts.Declaration) & ts.ModifierFlags.Readonly
    );
}

/** Renders a method signature: "Now(): Time", "Add(d: TimeDuration | number): Time" */
function renderMethodDetail(method: ts.MethodSignature): string {
    const name   = (method.name as ts.Identifier).text;
    const params = method.parameters.map((p) => {
        const pname = (p.name as ts.Identifier).text;
        const ptype = p.type ? p.type.getText(src) : "any";
        const opt   = p.questionToken ? "?" : "";
        const rest  = p.dotDotDotToken ? "..." : "";
        return `${rest}${pname}${opt}: ${ptype}`;
    }).join(", ");
    const ret = method.type ? method.type.getText(src) : "void";
    return `${name}(${params}): ${ret}`;
}

/** Builds the apply/insert text with argument placeholders.
 *
 *  Rules per parameter:
 *    - string / String  →  "paramName"   (quoted)
 *    - rest ...args     →  args           (no spread, just the name)
 *    - everything else  →  paramName
 *
 *  The encoded result uses the __insert__ protocol so CompletionProvider
 *  can place the cursor selection over the first argument, letting the
 *  user immediately overwrite it without moving the caret manually.
 *
 *  Format:  __insert__:<insertText>:<selectionStart>:<selectionEnd>
 */
function buildApply(method: ts.MethodSignature): string {
    const name   = (method.name as ts.Identifier).text;
    const params = method.parameters.filter((p) => !p.questionToken);

    if (params.length === 0) return `${name}()`;

    const args = params.map((p) => {
        const pname    = (p.name as ts.Identifier).text;
        const typeText = p.type ? p.type.getText(src) : "any";
        const isRest   = !!p.dotDotDotToken;
        const isString = /^string$/i.test(typeText.trim());

        if (isRest)   return pname;           // ...args → args
        if (isString) return `"${pname}"`;    // string  → "paramName"
        return pname;                          // other   → paramName
    });

    const insertText = `${name}(${args.join(", ")})`;

    // Selection covers the first argument so the user can overwrite it
    // immediately after the completion is inserted.
    const openParen  = name.length + 1;  // position of first char after "("
    const firstArg   = args[0];
    const selEnd     = openParen + firstArg.length;

    return `__insert__:${insertText}:${openParen}:${selEnd}`;
}

/** Extracts the first uppercase type name from a type node.
 *  Returns "" for primitives (number, string, boolean, void, any, never, etc.) */
function extractReturnTypeName(typeNode: ts.TypeNode | undefined): string {
    if (!typeNode) return "";
    const text = typeNode.getText(src);
    // Handle union types — take the first non-primitive uppercase token
    for (const tok of text.split(/\s*\|\s*/)) {
        const t = tok.trim().replace(/\[\]$/, ""); // strip array brackets
        if (/^[A-Z]/.test(t)) return t;
    }
    return "";
}

// ─── Registry maps ────────────────────────────────────────────────────────────

/** interfaceName → DtsInterface */
export const interfaceMap = new Map<string, DtsInterface>();

/** "IfaceName.methodName" → return interfaceName (non-primitive only) */
export const returnTypeMap = new Map<string, string>();

/** GoRoot method label → return interfaceName  e.g. "Utils" → "Utils" */
export const factoryMap = new Map<string, string>();

/** GoAllResult prop name → interfaceName  e.g. "utils" → "Utils" */
export const destructureMap = new Map<string, string>();

/** interfaceName → canonical var name from GoAllResult  e.g. "Utils" → "utils" */
export const instanceVarMap = new Map<string, string>();

// ─── Parse & populate ─────────────────────────────────────────────────────────

(function buildRegistry() {
    ts.forEachChild(src, (node) => {
        if (!ts.isInterfaceDeclaration(node)) return;

        const ifaceName = node.name.text;
        const ifaceDoc  = getJsDoc(node);

        // ── GoAllResult → destructureMap + instanceVarMap ─────────────────────
        if (ifaceName === "GoAllResult") {
            for (const member of node.members) {
                if (!ts.isPropertySignature(member) || !ts.isIdentifier(member.name)) continue;
                const varName  = member.name.text;
                const typeName = member.type ? member.type.getText(src).trim() : "";
                if (typeName) {
                    destructureMap.set(varName, typeName);
                    instanceVarMap.set(typeName, varName);
                }
            }
            return;
        }

        // ── GoRoot → factoryMap ───────────────────────────────────────────────
        if (ifaceName === "GoRoot") {
            for (const member of node.members) {
                if (!ts.isMethodSignature(member) || !ts.isIdentifier(member.name)) continue;
                const label      = member.name.text;
                const returnName = extractReturnTypeName(member.type);
                if (returnName && label !== "All") {
                    factoryMap.set(label, returnName);
                }
            }
            return;
        }

        // ── Regular interface → interfaceMap + returnTypeMap ──────────────────
        const members: DtsMember[] = [];

        for (const member of node.members) {
            const memberDoc = getJsDoc(member);

            // Method
            if (ts.isMethodSignature(member) && ts.isIdentifier(member.name)) {
                const label      = member.name.text;
                const detail     = renderMethodDetail(member);
                const apply      = buildApply(member);
                const returnType = extractReturnTypeName(member.type);

                if (returnType) {
                    returnTypeMap.set(`${ifaceName}.${label}`, returnType);
                }

                members.push({ label, kind: "method", doc: memberDoc, detail, returnType, apply });
                continue;
            }

            // Property (readonly → constant, otherwise property)
            if (ts.isPropertySignature(member) && ts.isIdentifier(member.name)) {
                const label      = member.name.text;
                const typeText   = member.type ? member.type.getText(src) : "any";
                const detail     = `${label}: ${typeText}`;
                const kind       = isReadonlyMember(member) ? "constant" : "property";
                const returnType = extractReturnTypeName(member.type);

                if (returnType) {
                    returnTypeMap.set(`${ifaceName}.${label}`, returnType);
                }

                members.push({ label, kind, doc: memberDoc, detail, returnType, apply: label });
                continue;
            }
        }

        interfaceMap.set(ifaceName, { name: ifaceName, doc: ifaceDoc, members });
    });
})();

// ─── Convenience lookups ──────────────────────────────────────────────────────

/** Resolves a factory call label to its DtsInterface.
 *  e.g. "Utils" → DtsInterface for Utils
 *       "Logger" → DtsInterface for Logger */
export function getInterfaceByFactory(label: string): DtsInterface | null {
    const ifaceName = factoryMap.get(label);
    return ifaceName ? (interfaceMap.get(ifaceName) ?? null) : null;
}

/** Resolves a destructuring var name to its DtsInterface.
 *  e.g. "utils" → DtsInterface for Utils */
export function getInterfaceByDestructure(varName: string): DtsInterface | null {
    const ifaceName = destructureMap.get(varName);
    return ifaceName ? (interfaceMap.get(ifaceName) ?? null) : null;
}

/** Returns the return-type DtsInterface for a method on an interface.
 *  e.g. ("TimePackage", "Now") → DtsInterface for Time */
export function getReturnInterface(ifaceName: string, methodName: string): DtsInterface | null {
    const returnName = returnTypeMap.get(`${ifaceName}.${methodName}`);
    return returnName ? (interfaceMap.get(returnName) ?? null) : null;
}

/** Returns the human-readable doc for a variable of a given interface.
 *  Parses the JSDoc "pkg.Type instance" pattern to produce "Instance of pkg package".
 *  Falls back to the raw interface doc. */
export function getInstanceDoc(ifaceName: string): string {
    const iface = interfaceMap.get(ifaceName);
    if (!iface) return "";
    // Pattern: "utils.Utils instance" or "time.Time package-level functions and constants"
    const m = /^(\w+)\.\w+/.exec(iface.doc);
    if (m) return `Instance of ${m[1]} package`;
    return iface.doc;
}