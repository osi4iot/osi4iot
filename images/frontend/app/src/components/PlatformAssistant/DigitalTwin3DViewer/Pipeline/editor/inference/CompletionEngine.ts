// ─────────────────────────────────────────────────────────────────────────────
// editor/inference/CompletionEngine.ts
//
// Pure completion logic decoupled from CodeMirror.
// All type information comes from DtsRegistry (osi4iot.d.ts).
// Returns SerializableCompletionResult so results cross the postMessage boundary.
// ─────────────────────────────────────────────────────────────────────────────

import type { SerializableCompletionResult, SerializableMethod } from "../types";
import { DtsInterface, DtsMember, interfaceMap, factoryMap, destructureMap, instanceVarMap } from "./DtsRegistry";
import { TypeResolver } from "./TypeResolver";

const resolver = new TypeResolver();

// ─────────────────────────────────────────────────────────────────────────────

export function getCompletions(
    doc: string,
    pos: number,
    lineText: string,
    matchText: string,
    matchFrom: number,
): SerializableCompletionResult | null {
    // Case A – chained:  time.Now().
    const chainedResult = handleChained(lineText, doc, pos);
    if (chainedResult) return chainedResult;

    // Case B – simple member access:  log.
    const simpleResult = handleSimple(matchText, doc, matchFrom);
    if (simpleResult) return simpleResult;

    // Case C – instance snippet:  typing "log" → "log = go.Logger();"
    const instanceResult = handleInstance(matchText, matchFrom);
    if (instanceResult) return instanceResult;

    return null;
}

// ─── Case A: chained ─────────────────────────────────────────────────────────

function handleChained(lineText: string, doc: string, pos: number): SerializableCompletionResult | null {
    const chainedMatch = parseChainedCall(lineText);
    if (!chainedMatch) return null;

    const { rootVar, methodChain, currentMethod } = chainedMatch;
    const [sourceIface] = resolver.resolve(rootVar, doc);
    if (!sourceIface) return null;

    // go.All() destructuring suggestions
    if (rootVar === "go" && methodChain === ".All()") {
        const options = buildGoAllOptions();
        return { from: pos - currentMethod.length, options, validFor: "^\\w*$" };
    }

    const chainResult = resolver.resolveChain(sourceIface, methodChain);
    if (!chainResult) return null;

    const [finalIface, lastMethod] = chainResult;
    if (!finalIface) return null;

    const filtered = finalIface.members.filter((m) => m.kind === "method" || lastMethod === "instance");

    return {
        from: pos - currentMethod.length,
        options: toSerializable(filtered),
        validFor: "^\\w*$",
    };
}

// ─── Case B: simple member access ────────────────────────────────────────────

function handleSimple(text: string, doc: string, matchFrom: number): SerializableCompletionResult | null {
    const variableMatch = /(\w+)\.(\w*)$/.exec(text);
    if (!variableMatch) return null;

    const [, varName] = variableMatch;
    const [iface, origin] = resolver.resolve(varName, doc);
    if (!iface) return null;

    let filtered: DtsMember[];

    if (origin === "instance_returned_by_method") {
        filtered = iface.members.filter((m) => m.kind === "method");
    } else if (origin === "destructuring") {
        // Package-level: show methods, constants, and properties
        filtered = iface.members;
    } else {
        // Plain instance: show everything
        filtered = iface.members;
    }

    return {
        from: matchFrom + variableMatch.index + varName.length + 1,
        options: toSerializable(filtered),
        validFor: "^\\w*$",
    };
}

// ─── Case C: instance snippet ─────────────────────────────────────────────────

function handleInstance(text: string, matchFrom: number): SerializableCompletionResult | null {
    const word = /\w*$/.exec(text);
    if (!word || !word[0] || text.includes(".")) return null;

    const prefix = word[0].toLowerCase();
    const options: SerializableMethod[] = [];

    // Suggest "go = Go();" as the root instance
    if ("go".startsWith(prefix)) {
        options.push({
            label: "go",
            type: "variable",
            info: "Create Go root instance",
            detail: "const go = Go()",
            apply: "__insert__:go = Go();",
            source: "osi4iot",
        });
    }

    // Suggest each package var from GoAllResult (log, time, utils, etc.)
    for (const [varName, ifaceName] of destructureMap) {
        if (!varName.startsWith(prefix)) continue;
        const iface = interfaceMap.get(ifaceName);
        options.push({
            label: varName,
            type: "variable",
            info: iface ? `Instance of ${ifaceName}` : ifaceName,
            detail: `const ${varName} = go.${capitalize(varName)}()`,
            apply: `__insert__:${varName} = go.${getFactoryLabel(ifaceName)}();`,
            source: "osi4iot",
        });
    }

    if (options.length === 0) return null;

    return {
        from: matchFrom + word.index,
        options,
        validFor: "^\\w*$",
    };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toSerializable(members: DtsMember[]): SerializableMethod[] {
    return members.map((m) => ({
        label: m.label,
        type: m.kind === "constant" ? "constant" : m.kind === "property" ? "property" : "method",
        info: m.doc,
        detail: m.detail,
        apply: m.apply,
        source: "osi4iot",
        returnType: m.returnType || undefined,
    }));
}

function buildGoAllOptions(): SerializableMethod[] {
    return Array.from(destructureMap.entries()).map(([varName, ifaceName]) => ({
        label: varName,
        type: "variable" as const,
        info: "",
        detail: `Instance of ${ifaceName}`,
        apply: varName,
        source: "osi4iot",
    }));
}

/** Find the GoRoot factory method label for a given interface name.
 *  e.g. "Logger" → "Logger",  "TimePackage" → "Time" */
function getFactoryLabel(ifaceName: string): string {
    for (const [label, name] of factoryMap) {
        if (name === ifaceName) return label;
    }
    return ifaceName;
}

function capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

interface ChainedCallMatch {
    rootVar: string;
    methodChain: string;
    currentMethod: string;
}

function parseChainedCall(line: string): ChainedCallMatch | null {
    const base = /(\w+)((?:\.\w+\([^)]*(?:\([^)]*\)[^)]*)*\))+)\.(\w*)$/.exec(line);
    if (base) return { rootVar: base[1], methodChain: base[2], currentMethod: base[3] };
    return parseChainedCallRobust(line);
}

function parseChainedCallRobust(text: string): ChainedCallMatch | null {
    const endMatch = /\.(\w*)$/.exec(text);
    if (!endMatch) return null;

    const currentMethod = endMatch[1];
    const before = text.slice(0, endMatch.index);
    if (!before.includes("(")) return null;

    let pos = before.length - 1;
    let parenCount = 0;
    let methodChain = "";
    let hasMethod = false;

    while (pos >= 0) {
        const ch = before[pos];
        if (ch === ")") {
            parenCount++;
            methodChain = ch + methodChain;
            hasMethod = true;
        } else if (ch === "(") {
            parenCount--;
            methodChain = ch + methodChain;
            if (parenCount < 0) return null;
        } else if (ch === "." && parenCount === 0) {
            if (methodChain === "") {
                pos--;
                continue;
            }
            const prev = before.slice(0, pos);
            if (/\)\s*$/.test(prev)) {
                methodChain = ch + methodChain;
            } else {
                const varMatch = /(\w+)$/.exec(prev);
                if (varMatch) return { rootVar: varMatch[1], methodChain, currentMethod };
                return null;
            }
        } else if (/\w/.test(ch)) {
            methodChain = ch + methodChain;
        } else if (parenCount === 0 && !/[\w.]/.test(ch)) {
            break;
        } else {
            methodChain = ch + methodChain;
        }
        pos--;
    }

    if (hasMethod) {
        const varMatch = /(\w+)$/.exec(before.slice(0, pos + 1));
        if (varMatch) return { rootVar: varMatch[1], methodChain, currentMethod };
    }
    return null;
}

// ─── apply serialization (used by LanguageServer applyIndex) ──────────────────

/** Serialize a plain apply string — kept for LanguageServer compatibility */
export function serializeApply(apply: string): string {
    return apply;
}
