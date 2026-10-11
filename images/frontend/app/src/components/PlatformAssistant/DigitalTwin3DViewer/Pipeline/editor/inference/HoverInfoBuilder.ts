// ─────────────────────────────────────────────────────────────────────────────
// Pure function that turns a resolved variable (or method hover) into the
// VariableInfo object consumed by the hover provider.
// Replaces the old GetVariableInfo / findMethodsAndConstants helpers.
// ─────────────────────────────────────────────────────────────────────────────

import type {  VariableInfo } from "../types";
import { TypeResolver } from "./TypeResolver";

const resolver = new TypeResolver();

// ─────────────────────────────────────────────────────────────────────────────

export function getVariableInfo(
    name: string,
    fullDoc: string,
    lineText: string
): VariableInfo | null {
    // ── 1. Constant on a package: time.RFC3339 ───────────────────────────────
    const pkgConstantMatch = /(\w+)(?:\.[\w()]*)*\.(\w+)\s*;?$/.exec(lineText);
    if (pkgConstantMatch) {
        const [, pkgVar, constantName] = pkgConstantMatch;
        const [sourceClass] = resolver.resolve(pkgVar, fullDoc);
        if (sourceClass) {
            const constant = (sourceClass.methods as any).find(
                (m: any) => m.type === "constant" && m.label === constantName
            );
            if (constant && (constantName === name || isAssignment(lineText, name))) {
                return {
                    sig: formatConstant(constant),
                    doc: `Constant ${constantName} in ${pkgVar} package`,
                    constants: [],
                    methods: [],
                    properties: [],
                };
            }
        }
    }

    // ── 2. Method hover in a chained call: time.Now().Add ────────────────────
    const chainedMatch = parseChainedCall(lineText);
    if (chainedMatch && !isAssignment(lineText, name)) {
        const { rootVar, methodChain } = chainedMatch;

        // If the hovered word IS the root variable, skip chained logic entirely
        // and fall through to the variable hover section below.
        // e.g. hovering "now1" in "const now2 = now1.Add(time.Second)"
        if (name === rootVar) {
            // fall through to section 3
        } else {
        const [sourceClass] = resolver.resolve(rootVar, fullDoc);

        if (sourceClass) {
            // Hovering the root variable itself (package instance like "time")
            if (sourceClass.name.split(".")[0] === name || (sourceClass.name === "Go" && name === "go")) {
                return buildInstanceInfo(sourceClass);
            }

            // Hovering "All" on Go
            if (sourceClass.name === "Go" && name === "All") {
                return {
                    sig: "",
                    doc: "Method for give access to different packages by destructuring",
                    constants: [],
                    methods: buildGoAllMethods(sourceClass),
                    properties: [],
                };
            }

            // Hovering a direct method on the source class
            const directMethod = (sourceClass.methods as any).find((m: any) => m.label === name);
            if (directMethod) {
                return buildMethodInfo(directMethod, sourceClass);
            }

            // Hovering a method deeper in a chain
            const chainResult = resolver.resolveChain(sourceClass, methodChain);
            if (chainResult) {
                const [finalClass, lastMethod] = chainResult;
                if (finalClass) {
                    const m = (finalClass.methods as any).find((m: any) => m.label === lastMethod);
                    if (m) return buildMethodInfo(m, finalClass);
                }
            }
        }
        } // end else (name !== rootVar)
    }

    // ── 3. Variable hover ────────────────────────────────────────────────────
    const [classDef, origin] = resolver.resolve(name, fullDoc);
    if (!classDef) return null;

    const { methods, constants } = splitMethodsAndConstants(classDef);
    const [pkg, type] = classDef.name.split(".");
    const properties: string[] = [];

    switch (true) {
        case origin === "destructuring":
        case origin === "instance":
            return { sig: "", doc: `Instance of ${pkg} package`, constants, methods, properties };

        case origin === "instance_returned_by_method":
            return { sig: "", doc: `Instance of type ${type} in ${pkg} package`, constants, methods, properties };

        default:
            if (origin.startsWith("method: ")) {
                const methodName = origin.replace("method: ", "");
                const methodSig = methods.find((m) => m.startsWith(`${methodName}:`)) ?? "";
                return {
                    sig: methodSig,
                    doc: `Method ${methodName} of type ${type} in ${pkg} package`,
                    constants: [],
                    methods: [],
                    properties: []
                };
            }
            return null;
    }
}

// ─── Private helpers ──────────────────────────────────────────────────────────

function isAssignment(line: string, varName: string): boolean {
    return new RegExp(`(?:const|let|var)?\\s*${varName}\\s*=\\s*([^;]+);?`).test(line.trim());
}

function splitMethodsAndConstants(classDef: any): { methods: string[]; constants: string[] } {
    const methods: string[] = [];
    const constants: string[] = [];
    for (const m of classDef.methods) {
        const desc = m.info ? `${m.label}: ${m.detail}. ${m.info}` : `${m.label}: ${m.detail}.`;
        if (m.type === "constant") constants.push(desc);
        else methods.push(desc);
    }
    return { methods, constants };
}

function buildInstanceInfo(classDef: any): VariableInfo {
    const { methods, constants } = splitMethodsAndConstants(classDef);
    const properties: string[] = [];
    const pkg = classDef.name.split(".")[0];
    return { sig: "", doc: `Instance of ${pkg} package`, constants, methods, properties };
}

function buildMethodInfo(method: any, classDef: any): VariableInfo {
    const [pkg, type] = classDef.name.split(".");
    const sig = method.detail ? `${method.label}${method.detail}. ${method.info}` : "";
    return {
        sig,
        doc: `Method ${method.label} of type ${type} in ${pkg} package`,
        constants: [],
        methods: [],
        properties: []
    };
}

function buildGoAllMethods(classDef: any): string[] {
    return classDef.methods
        .filter((m: any) => m.instanceName)
        .map((m: any) => `${m.instanceName}: ${m.info}.`);
}

function formatConstant(m: any): string {
    return m.info ? `${m.label}: ${m.detail}. ${m.info}` : `${m.label}: ${m.detail}.`;
}

/** Parses "variable.method1().method2()." patterns from a line of code.
 *  Tolerates trailing characters like commas, closing brackets, etc.
 *  e.g. "    timestamp: now1.UnixMilli(),"  → { rootVar: "now1", methodChain: ".UnixMilli()" }
 */
function parseChainedCall(line: string): { rootVar: string; methodChain: string } | null {
    // Match: word followed by one or more .method() calls, anywhere in the line.
    // Trailing [,;)\s] are ignored so object-literal values and nested calls work.
    const match = /(\w+)((?:\.[\w]+\([^)]*(?:\([^)]*\)[^)]*)*\))+)[,;)?\s]*$/.exec(line.trimEnd());
    if (!match) return null;
    return { rootVar: match[1], methodChain: match[2] };
}
