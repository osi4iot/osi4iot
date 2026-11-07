// Ctrl/Cmd+C, X and V on the canvas. Firefox does not fire "copy", "cut"
// and "paste" with the nodes selected (no text selection, no editable focus):
// the editor then does it itself. Chrome fires them: nothing is done twice.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { toast } from "react-toastify";
import { FALLBACK_DELAY_MS, usePipelineEditing } from "./usePipelineEditing";
import { parsePipelineYaml } from "./pipelineClipboard";

vi.mock("react-toastify", () => ({ toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() } }));

const node = (id: string, label: string, selected: boolean) => ({
    id,
    type: "Function",
    position: { x: 100, y: 50 },
    selected,
    data: { label, nodeUid: id, numOutputs: 1, debug: "off", settings: {} },
});

const setup = () => {
    const nodes = [node("aaa", "Function 1", true), node("bbb", "Function 2", false)];
    const setNodes = vi.fn();
    const setEdges = vi.fn();
    const wrapper = document.createElement("div");
    document.body.appendChild(wrapper);
    const hook = renderHook(() =>
        usePipelineEditing({
            nodes,
            edges: [],
            setNodes,
            setEdges,
            wrapperRef: { current: wrapper },
            screenToFlowPosition: (p) => p,
            handlePipelineUiChanged: vi.fn(),
            natsClient: null,
            natsSubjectsData: [],
        }),
    );
    return { hook, wrapper, setNodes };
};

const press = (target: EventTarget, key: string) =>
    target.dispatchEvent(new KeyboardEvent("keydown", { key, ctrlKey: true, bubbles: true }));

// jsdom has no ClipboardEvent with data: an Event with clipboardData is enough
const clipboardEvent = (type: string, text = "") => {
    const data = new Map<string, string>([["text/plain", text]]);
    const event = new Event(type, { bubbles: true, cancelable: true }) as any;
    event.clipboardData = { setData: (t: string, v: string) => data.set(t, v), getData: (t: string) => data.get(t) ?? "" };
    return { event, data };
};

let writeText: ReturnType<typeof vi.fn>;

beforeEach(() => {
    vi.useFakeTimers();
    writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    vi.mocked(toast.info).mockClear();
});

afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
});

describe("pipeline keyboard clipboard", () => {
    it("Firefox: Ctrl+C without a copy event copies the selected nodes to the clipboard", async () => {
        const { wrapper } = setup();
        press(wrapper, "c");
        await act(async () => {
            await vi.runAllTimersAsync();
        });
        expect(writeText).toHaveBeenCalledTimes(1);
        const yamlNodes = parsePipelineYaml(writeText.mock.calls[0][0] as string);
        expect(yamlNodes?.map((n: any) => n.name ?? n.label)).toHaveLength(1);
        expect(toast.info).toHaveBeenCalledWith("1 node(s) copied", expect.anything());
    });

    it("Chrome: Ctrl+C followed by the copy event copies once, through the event", async () => {
        const { wrapper } = setup();
        press(wrapper, "c");
        const { event, data } = clipboardEvent("copy");
        wrapper.dispatchEvent(event);
        await act(async () => {
            await vi.runAllTimersAsync();
        });
        expect(event.defaultPrevented).toBe(true);
        expect(parsePipelineYaml(data.get("text/plain")!)).toHaveLength(1);
        expect(writeText).not.toHaveBeenCalled();
        expect(toast.info).toHaveBeenCalledTimes(1);
    });

    it("Firefox: Ctrl+V without a paste event pastes the nodes copied before", async () => {
        const { hook, wrapper } = setup();
        press(wrapper, "c");
        await act(async () => {
            await vi.runAllTimersAsync();
        });
        expect(hook.result.current.isPlacing).toBe(false);
        // the browser cannot read the clipboard (Firefox < 125): readText is missing
        press(wrapper, "v");
        await act(async () => {
            await vi.runAllTimersAsync();
        });
        expect(hook.result.current.isPlacing).toBe(true);
    });

    it("Chrome: Ctrl+V followed by the paste event pastes once", async () => {
        const { hook, wrapper } = setup();
        press(wrapper, "c");
        await act(async () => {
            await vi.runAllTimersAsync();
        });
        const copied = writeText.mock.calls[0][0] as string;
        const readText = vi.fn(() => Promise.resolve(copied));
        Object.defineProperty(navigator, "clipboard", { value: { writeText, readText }, configurable: true });
        press(wrapper, "v");
        const { event } = clipboardEvent("paste", copied);
        act(() => {
            wrapper.dispatchEvent(event);
        });
        await act(async () => {
            await vi.runAllTimersAsync();
        });
        expect(event.defaultPrevented).toBe(true);
        expect(readText).not.toHaveBeenCalled();
        expect(hook.result.current.isPlacing).toBe(true);
    });

    // startPlacement adds the pasted nodes with one setNodes call
    const pastes = (setNodes: ReturnType<typeof vi.fn>) =>
        setNodes.mock.calls.filter(([updater]) => typeof updater === "function" && updater([]).length > 0).length;

    it("Firefox: a paste event arriving after the editor already pasted does not paste again", async () => {
        const { wrapper, setNodes } = setup();
        press(wrapper, "c");
        await act(async () => {
            await vi.runAllTimersAsync();
        });
        const copied = writeText.mock.calls[0][0] as string;
        press(wrapper, "v");
        await act(async () => {
            await vi.advanceTimersByTimeAsync(FALLBACK_DELAY_MS + 50);
        });
        expect(pastes(setNodes)).toBe(1);
        // the late event of Firefox
        const { event } = clipboardEvent("paste", copied);
        act(() => {
            wrapper.dispatchEvent(event);
        });
        expect(event.defaultPrevented).toBe(true);
        expect(pastes(setNodes)).toBe(1);
    });

    it("Firefox: a paste event arriving before the fallback pastes once", async () => {
        const { wrapper, setNodes } = setup();
        press(wrapper, "c");
        await act(async () => {
            await vi.runAllTimersAsync();
        });
        const copied = writeText.mock.calls[0][0] as string;
        press(wrapper, "v");
        await act(async () => {
            await vi.advanceTimersByTimeAsync(100);
        });
        act(() => {
            wrapper.dispatchEvent(clipboardEvent("paste", copied).event);
        });
        await act(async () => {
            await vi.runAllTimersAsync();
        });
        expect(pastes(setNodes)).toBe(1);
    });

    it("the copy of the browser's Edit menu (no key pressed) still works", () => {
        const { hook, wrapper } = setup();
        act(() => {
            wrapper.dispatchEvent(clipboardEvent("copy").event);
        });
        expect(toast.info).toHaveBeenCalledWith("1 node(s) copied", expect.anything());
        expect(hook.result.current.isPlacing).toBe(false);
    });

    it("leaves the text fields alone", async () => {
        const { wrapper } = setup();
        const input = document.createElement("input");
        wrapper.appendChild(input);
        press(input, "c");
        await act(async () => {
            await vi.runAllTimersAsync();
        });
        expect(writeText).not.toHaveBeenCalled();
    });
});