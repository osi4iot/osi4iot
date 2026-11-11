// The Text panels of the Viewer page: markdown (titles, lists, tables, links, images, code), LaTeX formulas
// (KaTeX, as in the chat: $…$, $$…$$) and values of the NATS messages as they arrive: {{dtm2sim.rotorRpm}},
// {{dtm2sim.rotorRpm|1}} (1 decimal). The editor shows the text and how it looks, and offers the fields of the
// last message of each topic to put them in the text.
import { FC, useEffect, useId, useMemo, useRef, useState } from "react";
import styled from "styled-components";
import { FileText, X } from "lucide-react";
import { MessageContent, renderExplicitMathBlocks } from "../ChatAssitant/MathMessage";
import { scrollbarStyle } from "../../../Tools/FormTools";
import { LiveTopic, LiveValueStore, fillPlaceholders, topicRefsOf, useLiveTick } from "./liveValues";
import { MARKDOWN_MAX_LENGTH, WorkspacePanel } from "./workspaceLayout";

const font = `Roboto, "Helvetica Neue", Arial, sans-serif`;

const Scroll = styled.div`
    position: absolute;
    inset: 0;
    overflow: auto;
    padding: 10px 14px;
    box-sizing: border-box;
    color: #e6e8eb;
    font: 400 14px ${font};
    ${scrollbarStyle}
`;

const Empty = styled.p`
    margin: 0;
    color: #7d848d;
    font-size: 13px;
`;

// the text with the values and drawn as HTML (markdown and LaTeX)
export const renderMarkdownPanel = (text: string, store?: LiveValueStore): string =>
    renderExplicitMathBlocks(store ? fillPlaceholders(text, store.get) : text, { document: true });

export const MarkdownView: FC<{ text: string; store?: LiveValueStore }> = ({ text, store }) => {
    const refs = useMemo(() => topicRefsOf([text]), [text]);
    const tick = useLiveTick(store, refs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const html = useMemo(() => renderMarkdownPanel(text, store), [text, store, tick]);
    return (
        <Scroll className="ws-no-drag">
            {text.trim() ? <MessageContent dangerouslySetInnerHTML={{ __html: html }} /> : <Empty>No text yet: edit the layout and use the pencil of this panel.</Empty>}
        </Scroll>
    );
};

// --- the editor ---------------------------------------------------------------------------------------------

const Backdrop = styled.div`
    position: fixed;
    inset: 0;
    z-index: 2000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    background: rgba(0, 0, 0, 0.55);
`;

const Dialog = styled.form`
    width: 1180px;
    max-width: 100%;
    height: min(780px, calc(100vh - 32px));
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 18px;
    box-sizing: border-box;
    background: #16181c;
    border: 1px solid #2c3137;
    border-radius: 14px;
    color: #e6e8eb;
    font-family: ${font};

    h2 {
        margin: 0;
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 17px;
        font-weight: 600;
    }
    h2 svg {
        width: 18px;
        height: 18px;
        color: #8ab4ff;
    }
    label > span,
    .label {
        display: block;
        margin-bottom: 6px;
        color: #9aa1aa;
        font-size: 12px;
        font-weight: 600;
    }
    input,
    select {
        height: 34px;
        box-sizing: border-box;
        padding: 0 10px;
        background: #0e1013;
        border: 1px solid #2c3137;
        border-radius: 8px;
        color: #e6e8eb;
        font: 400 14px ${font};
    }
`;

const Head = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;

    button {
        margin-left: auto;
    }
`;

const Body = styled.div`
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 230px;
    gap: 12px;

    @media (max-width: 900px) {
        grid-template-columns: minmax(0, 1fr);
        overflow-y: auto;
    }
`;

const Column = styled.div`
    min-height: 0;
    display: flex;
    flex-direction: column;
`;

const Source = styled.textarea`
    flex: 1;
    min-height: 260px;
    resize: none;
    padding: 10px;
    box-sizing: border-box;
    background: #0e1013;
    border: 1px solid #2c3137;
    border-radius: 8px;
    color: #e6e8eb;
    font: 400 13px/1.5 ui-monospace, SFMono-Regular, Menlo, Monaco, monospace;
    ${scrollbarStyle}

    &:focus {
        outline: none;
        border-color: #3d82f0;
    }
`;

const Preview = styled.div`
    position: relative;
    flex: 1;
    min-height: 260px;
    background: #141619;
    border: 1px solid #262a2f;
    border-radius: 8px;
`;

const Fields = styled.div`
    flex: 1;
    min-height: 120px;
    overflow-y: auto;
    border: 1px solid #262a2f;
    border-radius: 8px;
    ${scrollbarStyle}

    button {
        width: 100%;
        display: block;
        padding: 6px 10px;
        background: transparent;
        border: none;
        border-bottom: 1px solid #1f2328;
        color: #d5d9de;
        font: 400 12px ui-monospace, SFMono-Regular, Menlo, monospace;
        text-align: left;
        cursor: pointer;
        word-break: break-all;
    }
    button:hover,
    button:focus-visible {
        background: #23272d;
        outline: none;
    }
    p {
        margin: 10px;
        font-size: 12px;
        color: #7d848d;
    }
`;

const Help = styled.p`
    margin: 0;
    font-size: 12px;
    line-height: 1.5;
    color: #9aa1aa;

    code {
        color: #c7cbd1;
    }
`;

const Actions = styled.div`
    display: flex;
    justify-content: flex-end;
    gap: 8px;

    button {
        height: 36px;
        padding: 0 14px;
        border-radius: 8px;
        font: 500 14px ${font};
        cursor: pointer;
    }
`;

const Secondary = styled.button`
    background: #1b1e22;
    border: 1px solid #2c3137;
    color: #d5d9de;
`;

const Primary = styled.button`
    background: #3d82f0;
    border: 1px solid #3d82f0;
    color: #fff;
`;

const Close = styled.button`
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: 1px solid #2c3137;
    border-radius: 8px;
    color: #c7cbd1;
    cursor: pointer;

    svg {
        width: 15px;
        height: 15px;
    }
`;

export interface MarkdownEditorProps {
    panel: WorkspacePanel;
    store?: LiveValueStore;
    // the topics whose values can be named (dev2pdb with their sensors' fields, dtm2sim, dev2sim)
    topics: LiveTopic[];
    onApply: (panel: WorkspacePanel) => void;
    onDiscard: () => void;
}

export const MarkdownEditor: FC<MarkdownEditorProps> = ({ panel, store, topics, onApply, onDiscard }) => {
    const topicRefs = useMemo(() => topics.map((t) => t.ref), [topics]);
    const [text, setText] = useState(panel.text ?? "");
    const [title, setTitle] = useState(panel.title ?? "");
    const [topic, setTopic] = useState(() => topicRefsOf([panel.text ?? ""])[0] ?? (topicRefs.includes("dtm2sim") ? "dtm2sim" : topicRefs[0] ?? ""));
    const sourceRef = useRef<HTMLTextAreaElement>(null);
    const titleId = useId();
    // the fields of the last message of the topic chosen, and the preview, as messages arrive
    const tick = useLiveTick(store, topic ? [topic, ...topicRefsOf([text])] : topicRefsOf([text]), 500);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // dev2pdb: the fields of its sensors; dtm2sim and dev2sim: those seen in their messages
    const known = topics.find((t) => t.ref === topic)?.fields;
    const fields = useMemo(
        () => (known && known.length ? known.map((f) => ({ path: f.path, label: `${f.label}${f.units && f.units !== "-" ? ` (${f.units})` : ""} — ${f.sensor}` })) : (topic && store ? store.fields(topic) : []).map((path) => ({ path, label: path }))),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [known, topic, store, tick],
    );
    useEffect(() => {
        sourceRef.current?.focus();
    }, []);

    const insert = (snippet: string) => {
        const area = sourceRef.current;
        const start = area?.selectionStart ?? text.length;
        const end = area?.selectionEnd ?? text.length;
        const next = (text.slice(0, start) + snippet + text.slice(end)).slice(0, MARKDOWN_MAX_LENGTH);
        setText(next);
        requestAnimationFrame(() => {
            if (!area) return;
            area.focus();
            area.selectionStart = area.selectionEnd = start + snippet.length;
        });
    };

    return (
        <Backdrop>
            <Dialog
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                onKeyDown={(e) => {
                    if (e.key === "Escape") {
                        e.stopPropagation();
                        onDiscard();
                    }
                }}
                onSubmit={(e) => {
                    e.preventDefault();
                    const next: WorkspacePanel = { ...panel, text };
                    if (title.trim()) next.title = title.trim().slice(0, 80);
                    else delete next.title;
                    onApply(next);
                }}
            >
                <Head>
                    <h2 id={titleId}>
                        <FileText aria-hidden="true" />
                        Edit text
                    </h2>
                    <Close type="button" aria-label="Discard the changes" onClick={onDiscard}>
                        <X aria-hidden="true" />
                    </Close>
                </Head>
                <label>
                    <span>Title (optional)</span>
                    <input value={title} maxLength={80} placeholder="Text" onChange={(e) => setTitle(e.target.value)} style={{ width: "100%" }} />
                </label>
                <Body>
                    <Column>
                        <span className="label">
                            Markdown ({text.length.toLocaleString()} / {MARKDOWN_MAX_LENGTH.toLocaleString()})
                        </span>
                        <Source
                            ref={sourceRef}
                            aria-label="Markdown text"
                            value={text}
                            maxLength={MARKDOWN_MAX_LENGTH}
                            spellCheck={false}
                            onChange={(e) => setText(e.target.value)}
                        />
                    </Column>
                    <Column>
                        <span className="label">Preview (with the last values)</span>
                        <Preview aria-label="Preview">
                            <MarkdownView text={text} store={store} />
                        </Preview>
                    </Column>
                    <Column>
                        <label>
                            <span>Values of the topic</span>
                            <select aria-label="Topic" value={topic} onChange={(e) => setTopic(e.target.value)} style={{ width: "100%" }}>
                                {topics.map((t) => (
                                    <option key={t.ref} value={t.ref}>
                                        {t.label}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <span className="label" style={{ marginTop: 10 }}>
                            Its fields (click to insert)
                        </span>
                        <Fields aria-label="Fields">
                            {fields.length ? (
                                fields.map(({ path, label }) => (
                                    <button key={path} type="button" title={`Insert {{${topic}.${path}}}`} onClick={() => insert(`{{${topic}.${path}}}`)}>
                                        {label}
                                    </button>
                                ))
                            ) : (
                                <p>
                                    No message of {topic || "this topic"} has arrived since the viewer was opened. You can still write{" "}
                                    <code>{`{{${topic || "dtm2sim"}.field}}`}</code>.
                                </p>
                            )}
                        </Fields>
                    </Column>
                </Body>
                <Help>
                    <code># Title</code> · <code>**bold**</code> · <code>_italic_</code> · <code>- list</code> · <code>| table |</code> ·{" "}
                    <code>[link](https://…)</code> · <code>![image](https://…)</code> · <code>&gt; quote</code> · <code>---</code> · LaTeX{" "}
                    <code>$E = mc^2$</code>, <code>$$…$$</code> · values <code>{"{{dtm2sim.rotorRpm}}"}</code>, with 1 decimal{" "}
                    <code>{"{{dtm2sim.rotorRpm|1}}"}</code>
                </Help>
                <Actions>
                    <Secondary type="button" onClick={onDiscard}>
                        Discard
                    </Secondary>
                    <Primary type="submit">Apply</Primary>
                </Actions>
            </Dialog>
        </Backdrop>
    );
};
