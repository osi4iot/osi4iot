// ─────────────────────────────────────────────────────────────────────────────
// editor/worker/WorkerBridge.ts
// ─────────────────────────────────────────────────────────────────────────────

import type {
    CompletionResult, SerializableCompletionResult,
    VariableInfo, WorkerRequest, WorkerResponse, LSDiagnostic,
} from "../types";
import { deserializeCompletionResult } from "../providers/CompletionProvider";

// Synchronous fallbacks (used if Worker fails to load)
import { getCompletions } from "../inference/CompletionEngine";
import { getVariableInfo } from "../inference/HoverInfoBuilder";

type Resolve = (value: any) => void;
type Reject  = (reason: any) => void;

export class WorkerBridge {
    private worker:      Worker | null = null;
    private pending      = new Map<number, [Resolve, Reject]>();
    private nextId       = 1;
    private useFallback  = false;
    private disposed     = false;

    constructor() { this.spawnWorker(); }

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    private spawnWorker() {
        try {
            this.worker = new Worker(
                new URL("./editor.worker.ts", import.meta.url),
                { type: "module" },
            );
            this.worker.onmessage = this.handleMessage.bind(this);
            this.worker.onerror   = (e) => {
                console.warn("[WorkerBridge] Worker error — falling back to sync:", e);
                this.useFallback = true;
                this.worker      = null;
            };
            this.disposed = false;
        } catch {
            console.warn("[WorkerBridge] Worker unavailable — using sync fallback.");
            this.useFallback = true;
        }
    }

    dispose() {
        this.disposed = true;
        this.worker?.terminate();
        this.worker = null;
        this.pending.forEach(([, reject]) => reject(new Error("WorkerBridge disposed")));
        this.pending.clear();
    }

    restart() {
        if (!this.disposed) return;
        this.useFallback = false;
        this.spawnWorker();
    }

    // ── complete ──────────────────────────────────────────────────────────────

    complete(doc: string, pos: number, wordFrom: number): Promise<CompletionResult | null> {
        if (this.useFallback || !this.worker) {
            const lineStart = doc.lastIndexOf("\n", pos - 1) + 1;
            const lineText  = doc.slice(lineStart, pos);
            const matchText = doc.slice(wordFrom, pos);
            const raw = getCompletions(doc, pos, lineText, matchText, wordFrom);
            return Promise.resolve(raw ? deserializeCompletionResult(raw) : null);
        }

        return this.send<SerializableCompletionResult | null>({
            id: this.nextId++, type: "complete", doc, pos, wordFrom,
        }).then((raw) => raw ? deserializeCompletionResult(raw) : null);
    }

    // ── hover ─────────────────────────────────────────────────────────────────

    hover(doc: string, pos: number, lineText: string, word: string): Promise<VariableInfo | null> {
        if (this.useFallback || !this.worker) {
            return Promise.resolve(getVariableInfo(word, doc, lineText));
        }

        return this.send<VariableInfo | null>({
            id: this.nextId++, type: "hover", doc, pos, word, lineText,
        });
    }

    // ── diagnose ──────────────────────────────────────────────────────────────

    diagnose(doc: string): Promise<LSDiagnostic[]> {
        if (this.useFallback || !this.worker) return Promise.resolve([]);
        return this.send<LSDiagnostic[]>({
            id: this.nextId++, type: "diagnose", doc,
        });
    }

    // ── internal ──────────────────────────────────────────────────────────────

    private send<T>(req: WorkerRequest): Promise<T> {
        if (!this.worker) {
            return Promise.reject(new Error("WorkerBridge: worker not available"));
        }
        return new Promise<T>((resolve, reject) => {
            this.pending.set(req.id, [resolve, reject]);
            if (this.worker) {
                this.worker.postMessage(req);
            } else {
                this.pending.delete(req.id);
                reject(new Error("WorkerBridge: worker terminated before send"));
            }
        });
    }

    private handleMessage(event: MessageEvent<WorkerResponse>) {
        const resp = event.data;
        const handlers = this.pending.get(resp.id);
        if (!handlers) return;
        this.pending.delete(resp.id);
        const [resolve, reject] = handlers;
        if (resp.type === "error") reject(new Error(resp.message));
        else resolve((resp as any).result);
    }
}

export const workerBridge = new WorkerBridge();
