// ─────────────────────────────────────────────────────────────────────────────
// editor/inference/TypeResolver.ts
//
// Resolves variable names to their DtsInterface by walking the document AST
// with acorn. All type information comes from DtsRegistry (osi4iot.d.ts).
// ─────────────────────────────────────────────────────────────────────────────

import * as acorn from "acorn";
import * as walk  from "acorn-walk";
import type { VariableOrigin } from "../types";
import {
    DtsInterface,
    interfaceMap,
    factoryMap,
    destructureMap,
    returnTypeMap,
} from "./DtsRegistry";

export type ResolvedVar = [DtsInterface | null, VariableOrigin];

type ScopeEntry = { ifaceName: string; origin: VariableOrigin };

export class TypeResolver {
    private scope:   Map<string, ScopeEntry> = new Map();
    private docHash: number = 0;

    // ── Public API ────────────────────────────────────────────────────────────

    resolve(varName: string, doc: string): ResolvedVar {
        this.ensureParsed(doc);
        const entry = this.scope.get(varName);
        if (!entry) return [null, ""];
        const iface = interfaceMap.get(entry.ifaceName) ?? null;
        return [iface, entry.origin];
    }

    /** Resolves a chain of method calls from a known interface.
     *  ".Now().Add(time.Hour)" on TimePackage → [Time iface, "Add"] */
    resolveChain(
        startIface: DtsInterface,
        methodChain: string,
    ): [DtsInterface | null, string] | null {
        const names = this.extractMethodNames(methodChain);
        if (names.length === 0) return null;

        let current: DtsInterface = startIface;
        let lastLabel = "instance";

        for (const name of names) {
            const member = current.members.find((m) => m.label === name);
            if (!member) return null;
            if (!member.returnType) return [null, name];
            const next = interfaceMap.get(member.returnType);
            if (!next) return [null, name];
            current   = next;
            lastLabel = name;
        }

        return [current, lastLabel];
    }

    // ── Parsing ───────────────────────────────────────────────────────────────

    private ensureParsed(doc: string) {
        const hash = this.hashDoc(doc);
        if (hash === this.docHash) return;
        this.docHash = hash;
        this.scope.clear();
        this.parseDoc(doc);
    }

    private parseDoc(doc: string) {
        let ast: acorn.Program | undefined;
        for (const candidate of this.buildParseCandidates(doc)) {
            try {
                ast = acorn.parse(candidate, {
                    ecmaVersion: "latest",
                    sourceType:  "script",
                    onInsertedSemicolon: () => {},
                    onTrailingComma:     () => {},
                });
                break;
            } catch { /* try next */ }
        }
        if (!ast) return;

        walk.simple(ast, {
            VariableDeclaration: (node: any) => {
                for (const decl of node.declarations) this.processDeclarator(decl);
            },
        });
    }

    /** Patterns handled:
     *  A) const log  = go.Logger()           → direct factory
     *  B) const { log, time } = go.All()     → destructuring
     *  C) const t1   = time.Now()            → method return
     *  D) const t2   = time.Now().Add(...)   → chained method return */
    private processDeclarator(decl: any) {
        const init = decl.init;
        if (!init) return;

        // B: destructuring
        if (decl.id?.type === "ObjectPattern" && this.isGoAllCall(init)) {
            for (const prop of decl.id.properties) {
                const varName: string = prop.key?.name ?? prop.value?.name;
                if (!varName) continue;
                const ifaceName = destructureMap.get(varName);
                if (ifaceName) this.scope.set(varName, { ifaceName, origin: "destructuring" });
            }
            return;
        }

        if (decl.id?.type !== "Identifier") return;
        const varName: string = decl.id.name;

        // A: direct factory — const log = go.Logger()  or  const log = Logger()
        if (init.type === "CallExpression") {
            const calleeName = this.extractCalleeName(init.callee);
            if (calleeName) {
                const ifaceName = factoryMap.get(calleeName);
                if (ifaceName) {
                    this.scope.set(varName, { ifaceName, origin: "instance" });
                    return;
                }
            }
        }

        // C: single method return — const t1 = time.Now()
        if (init.type === "CallExpression" && init.callee?.type === "MemberExpression") {
            const objName:    string = init.callee.object?.name ?? "";
            const methodName: string = init.callee.property?.name ?? "";
            if (objName && methodName) {
                const entry = this.scope.get(objName);
                if (entry) {
                    const returnName = returnTypeMap.get(`${entry.ifaceName}.${methodName}`);
                    if (returnName) {
                        const origin: VariableOrigin = interfaceMap.has(returnName)
                            ? "instance_returned_by_method"
                            : `method: ${methodName}`;
                        this.scope.set(varName, { ifaceName: returnName, origin });
                        return;
                    }
                }
            }
        }

        // D: chained — const t2 = time.Now().Add(time.Hour)
        if (init.type === "CallExpression") {
            const chain = this.flattenCallChain(init);
            if (chain.length >= 2) {
                const rootEntry = this.scope.get(chain[0].object);
                if (rootEntry) {
                    let currentIface: string | undefined = rootEntry.ifaceName;
                    for (const step of chain) {
                        if (!currentIface) break;
                        const r = returnTypeMap.get(`${currentIface}.${step.method}`) as string | undefined;
                        if (!r) { currentIface = undefined; break; }
                        currentIface = r;
                    }
                    if (currentIface) {
                        const lastMethod = chain[chain.length - 1].method;
                        const origin: VariableOrigin = interfaceMap.has(currentIface)
                            ? "instance_returned_by_method"
                            : `method: ${lastMethod}`;
                        this.scope.set(varName, { ifaceName: currentIface, origin });
                    }
                }
            }
        }
    }

    // ── AST helpers ───────────────────────────────────────────────────────────

    private isGoAllCall(node: any): boolean {
        return (
            node?.type === "CallExpression" &&
            node.callee?.type === "MemberExpression" &&
            node.callee.property?.name === "All"
        );
    }

    private extractCalleeName(callee: any): string | null {
        if (callee?.type === "Identifier")       return callee.name;
        if (callee?.type === "MemberExpression") return callee.property?.name ?? null;
        return null;
    }

    private flattenCallChain(node: any): Array<{ object: string; method: string }> {
        const chain: Array<{ object: string; method: string }> = [];
        let current = node;
        while (current?.type === "CallExpression" && current.callee?.type === "MemberExpression") {
            const method: string = current.callee.property?.name ?? "";
            const obj = current.callee.object;
            if (obj?.type === "Identifier") {
                chain.unshift({ object: obj.name, method });
                break;
            } else if (obj?.type === "CallExpression") {
                chain.unshift({ object: "", method });
                current = obj;
            } else break;
        }
        return chain;
    }

    private extractMethodNames(chain: string): string[] {
        const names: string[] = [];
        const re = /\.(\w+)\s*\(/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(chain)) !== null) names.push(m[1]);
        return names;
    }

    private buildParseCandidates(doc: string): string[] {
        const lines = doc.split("\n");
        return [
            lines.filter((l) => !/^\s*[\w.()]+\.\s*$/.test(l)).join("\n"),
            ...Array.from({ length: Math.min(8, lines.length - 1) }, (_, i) =>
                lines.slice(0, lines.length - i - 1).join("\n")
            ),
        ];
    }

    private hashDoc(doc: string): number {
        let h = 0;
        for (let i = 0; i < doc.length; i++) h = (Math.imul(31, h) + doc.charCodeAt(i)) | 0;
        return h;
    }
}
