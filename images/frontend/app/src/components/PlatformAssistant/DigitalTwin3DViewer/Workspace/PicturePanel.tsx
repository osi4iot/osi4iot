// The Picture panels of the Viewer page: an image of the digital twin (JPEG, PNG, WebP, GIF or SVG) and, for an
// SVG, the animations of its elements with the values of the NATS messages (pictureBindings.ts). The editor
// chooses or uploads the image, how it fits, and the animations: click an element of the SVG to animate it.
import { FC, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import styled from "styled-components";
import { FileImage, ImageOff, Plus, Trash2, Upload, X } from "lucide-react";
import { scrollbarStyle } from "../../../Tools/FormTools";
import { LiveTopic, LiveValueStore, useLiveTick } from "./liveValues";
import { BindingCard, newBinding } from "./PictureBindingCard";
import {
    PICTURE_MAX_BINDINGS,
    PictureAction,
    PictureBinding,
    PictureFit,
    applyEffects,
    bindingEffects,
    sanitizeSvg,
    svgElementIds,
} from "./pictureBindings";
import { LoadedViewerImage, ViewerImageInfo, isSvgName, viewerImageName } from "./viewerImagesApi";
import { WorkspacePanel } from "./workspaceLayout";

const font = `Roboto, "Helvetica Neue", Arial, sans-serif`;

export interface PictureFiles {
    load: (fileName: string) => Promise<LoadedViewerImage | null>;
    list: () => Promise<ViewerImageInfo[]>;
    upload: (file: File, fileName: string) => Promise<boolean>;
    remove: (fileName: string) => Promise<boolean>;
}

const Frame = styled.div`
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;

    > img {
        width: 100%;
        height: 100%;
        display: block;
    }
    > .svg-host,
    > .svg-host > svg {
        width: 100%;
        height: 100%;
        display: block;
    }
`;

const Note = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    color: #7d848d;
    font: 400 13px ${font};
    text-align: center;
    padding: 12px;

    svg {
        width: 40px;
        height: 40px;
        color: #4a5058;
    }
`;

const PRESERVE: Record<PictureFit, string> = { contain: "xMidYMid meet", cover: "xMidYMid slice", fill: "none" };

const useImage = (file: string | undefined, load: PictureFiles["load"] | undefined) => {
    const [state, setState] = useState<{ file?: string; image: LoadedViewerImage | null | undefined }>({ image: undefined });
    useEffect(() => {
        if (!file || !load) return;
        let alive = true;
        setState({ file, image: undefined });
        load(file).then((image) => alive && setState({ file, image }));
        return () => {
            alive = false;
        };
    }, [file, load]);
    return file && state.file === file ? state.image : file ? undefined : null;
};

export interface PictureViewProps {
    file?: string;
    fit?: PictureFit;
    bindings?: PictureBinding[];
    store?: LiveValueStore;
    load?: PictureFiles["load"];
    // the editor: the element under the pointer is marked, and a click on an element chooses it
    highlight?: string | null;
    onPickElement?: (id: string) => void;
}

export const PictureView: FC<PictureViewProps> = ({ file, fit = "contain", bindings = [], store, load, highlight, onPickElement }) => {
    const image = useImage(file, load);
    const svg = useMemo(() => (image?.svg ? sanitizeSvg(image.svg) : null), [image]);
    const hostRef = useRef<HTMLDivElement>(null);
    const refs = useMemo(() => Array.from(new Set(bindings.map((b) => b.topicRef))), [bindings]);
    const tick = useLiveTick(store, refs, 100);

    // the SVG drawn once (its elements are then changed in place)
    useLayoutEffect(() => {
        const host = hostRef.current;
        if (!host) return;
        host.innerHTML = svg ?? "";
        const root = host.querySelector("svg");
        root?.setAttribute("preserveAspectRatio", PRESERVE[fit]);
    }, [svg, fit]);

    useLayoutEffect(() => {
        const root = hostRef.current?.querySelector("svg");
        if (!root || !store || bindings.length === 0) return;
        applyEffects(root, bindingEffects(bindings, store.get));
    }, [svg, bindings, store, tick]);

    useLayoutEffect(() => {
        const root = hostRef.current?.querySelector("svg");
        if (!root) return;
        root.querySelectorAll(".pic-highlight").forEach((el) => el.classList.remove("pic-highlight"));
        if (highlight) root.querySelector(`[id="${CSS.escape(highlight)}"]`)?.classList.add("pic-highlight");
    }, [svg, highlight]);

    if (!file) {
        return (
            <Frame>
                <Note>
                    <FileImage aria-hidden="true" />
                    No image yet: edit the layout and use the pencil of this panel.
                </Note>
            </Frame>
        );
    }
    if (image === null || (image?.svg !== undefined && svg === null)) {
        return (
            <Frame>
                <Note role="alert">
                    <ImageOff aria-hidden="true" />
                    {image === null ? `The image ${file} could not be read (it may have been removed).` : `${file} is not a valid SVG.`}
                </Note>
            </Frame>
        );
    }
    return (
        <Frame
            className="ws-no-drag"
            onClick={(e) => {
                if (!onPickElement) return;
                const el = (e.target as Element).closest("[id]");
                if (el && hostRef.current?.contains(el) && el.id && el.nodeName.toLowerCase() !== "svg") onPickElement(el.id);
            }}
        >
            <style>{`.pic-highlight { outline: 2px solid #3d82f0; filter: drop-shadow(0 0 3px #3d82f0); }`}</style>
            {image && !isSvgName(file) && <img src={image.url} alt={file} style={{ objectFit: fit }} />}
            <div ref={hostRef} className="svg-host" role={svg ? "img" : undefined} aria-label={svg ? file : undefined} style={{ display: svg ? "block" : "none", cursor: onPickElement ? "crosshair" : undefined }} />
            {image === undefined && <Note>Loading {file}…</Note>}
        </Frame>
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
    width: 1440px;
    max-width: 100%;
    height: min(860px, calc(100vh - 32px));
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
    .label {
        display: block;
        margin-bottom: 6px;
        color: #9aa1aa;
        font-size: 12px;
        font-weight: 600;
    }
    input,
    select {
        height: 30px;
        box-sizing: border-box;
        padding: 0 8px;
        background: #0e1013;
        border: 1px solid #2c3137;
        border-radius: 7px;
        color: #e6e8eb;
        font: 400 13px ${font};
        min-width: 0;
    }
    input[type="number"] {
        width: 74px;
    }
`;

const Head = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
`;

const Body = styled.div`
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: 210px minmax(0, 1fr) minmax(0, 1.1fr);
    grid-template-rows: minmax(0, 1fr);
    gap: 14px;
`;

const Files = styled.div`
    grid-row: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
`;

const FileList = styled.ul`
    flex: 1;
    min-height: 0;
    margin: 0;
    padding: 0;
    list-style: none;
    overflow-y: auto;
    border: 1px solid #262a2f;
    border-radius: 8px;
    ${scrollbarStyle}

    li {
        display: flex;
        align-items: center;
        border-bottom: 1px solid #1f2328;
    }
    li > button:first-child {
        flex: 1;
        min-width: 0;
        padding: 7px 10px;
        background: transparent;
        border: none;
        color: #d5d9de;
        font: 400 13px ${font};
        text-align: left;
        cursor: pointer;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    li[aria-current="true"] > button:first-child {
        background: #1d3354;
        color: #fff;
    }
    p {
        margin: 10px;
        color: #7d848d;
        font-size: 12px;
    }
`;

const SmallButton = styled.button`
    height: 30px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 0 10px;
    background: #1b1e22;
    border: 1px solid #2c3137;
    border-radius: 7px;
    color: #d5d9de;
    font: 500 13px ${font};
    cursor: pointer;

    &:disabled {
        opacity: 0.45;
        cursor: default;
    }
    svg {
        width: 14px;
        height: 14px;
    }
`;

const IconOnly = styled(SmallButton)`
    width: 30px;
    padding: 0;
    flex: none;
    background: transparent;
    border-color: transparent;
`;

const Preview = styled.div`
    position: relative;
    min-height: 200px;
    background: #141619;
    border: 1px solid #262a2f;
    border-radius: 8px;
`;

const Bindings = styled.div`
    grid-column: 3;
    grid-row: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding-right: 4px;
    ${scrollbarStyle}

    .hint {
        margin: 0;
        color: #9aa1aa;
        font-size: 12px;
        line-height: 1.45;
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

export { ColorField, newBinding } from "./PictureBindingCard";

export interface PictureEditorProps {
    panel: WorkspacePanel;
    store?: LiveValueStore;
    // the topics a value can come from (dev2pdb with their sensors' fields, dtm2sim, dev2sim)
    topics: LiveTopic[];
    files: PictureFiles;
    onApply: (panel: WorkspacePanel) => void;
    onDiscard: () => void;
}

export const PictureEditor: FC<PictureEditorProps> = ({ panel, store, topics, files, onApply, onDiscard }) => {
    const topicRefs = useMemo(() => topics.map((t) => t.ref), [topics]);
    const [file, setFile] = useState(panel.file);
    const [fit, setFit] = useState<PictureFit>(panel.fit ?? "contain");
    const [title, setTitle] = useState(panel.title ?? "");
    const [bindings, setBindings] = useState<PictureBinding[]>(panel.bindings ?? []);
    const [list, setList] = useState<ViewerImageInfo[] | null>(null);
    const [busy, setBusy] = useState(false);
    const [hover, setHover] = useState<string | null>(null);
    // the animation just added (from a click on the picture): shown and marked
    const [fresh, setFresh] = useState<number | null>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const [svgText, setSvgText] = useState<string | null>(null);
    const uploadRef = useRef<HTMLInputElement>(null);
    const titleId = useId();
    const defaultTopic = topicRefs.includes("dtm2sim") ? "dtm2sim" : topicRefs[0] ?? "dtm2sim";
    const tick = useLiveTick(store, topicRefs, 1000);

    const refresh = () => files.list().then(setList);
    useEffect(() => {
        void refresh();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    useEffect(() => {
        setSvgText(null);
        if (!file || !isSvgName(file)) return;
        let alive = true;
        files.load(file).then((image) => alive && setSvgText(image?.svg ?? null));
        return () => {
            alive = false;
        };
    }, [file, files]);
    const ids = useMemo(() => (svgText ? svgElementIds(svgText) : []), [svgText]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const fieldsOf = useMemo(() => new Map(topicRefs.map((ref) => [ref, store ? store.fields(ref) : []])), [topicRefs, store, tick]);

    const update = (i: number, patch: Partial<PictureBinding>) => setBindings((list) => list.map((b, k) => (k === i ? { ...b, ...patch } : b)));
    const changeAction = (i: number, action: PictureAction) =>
        setBindings((list) => list.map((b, k) => (k === i ? newBinding(b.element, b.topicRef, action, b.path) : b)));
    const addBinding = (element?: string) => {
        if (bindings.length >= PICTURE_MAX_BINDINGS) return;
        // an element that is a <text>: show the value as text; the rest: its colour
        const id = element ?? ids[0]?.id ?? "";
        const tag = ids.find((x) => x.id === id)?.tag.toLowerCase();
        setBindings((list) => [...list, newBinding(id, defaultTopic, tag === "text" || tag === "tspan" ? "text" : "color")]);
        setFresh(bindings.length);
        requestAnimationFrame(() => listRef.current?.querySelector(`[aria-label="Animation ${bindings.length + 1}"]`)?.scrollIntoView({ block: "nearest" }));
    };

    const upload = async (picked: File | undefined) => {
        if (!picked) return;
        const name = viewerImageName(picked.name);
        if (!name) return;
        setBusy(true);
        if (await files.upload(picked, name)) {
            setFile(name);
            await refresh();
        }
        setBusy(false);
    };

    const isSvg = !!file && isSvgName(file);
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
                    const next: WorkspacePanel = { ...panel, fit };
                    if (file) next.file = file;
                    else delete next.file;
                    const valid = isSvg ? bindings.filter((b) => b.element && b.path) : [];
                    if (valid.length) next.bindings = valid;
                    else delete next.bindings;
                    if (title.trim()) next.title = title.trim().slice(0, 80);
                    else delete next.title;
                    onApply(next);
                }}
            >
                <Head>
                    <h2 id={titleId}>
                        <FileImage aria-hidden="true" />
                        Edit picture
                    </h2>
                    <input aria-label="Title" placeholder="Title (optional)" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} style={{ flex: 1, height: 34 }} />
                    <select aria-label="Fit" value={fit} onChange={(e) => setFit(e.target.value as PictureFit)} style={{ height: 34 }}>
                        <option value="contain">Fit inside</option>
                        <option value="cover">Fill and crop</option>
                        <option value="fill">Stretch</option>
                    </select>
                    <IconOnly type="button" aria-label="Discard the changes" onClick={onDiscard}>
                        <X aria-hidden="true" />
                    </IconOnly>
                </Head>
                <Body>
                    <Files>
                        <span className="label">Images of the twin</span>
                        <FileList aria-label="Images of the twin">
                            {list === null ? (
                                <p>Reading…</p>
                            ) : list.length === 0 ? (
                                <p>No images yet: upload a JPEG, PNG, WebP, GIF or SVG (10 MB at most).</p>
                            ) : (
                                list.map((f) => (
                                    <li key={f.fileName} aria-current={f.fileName === file ? "true" : undefined}>
                                        <button type="button" title={`${f.fileName} · ${Math.ceil(f.size / 1024)} KB`} onClick={() => setFile(f.fileName)}>
                                            {f.fileName}
                                        </button>
                                        <IconOnly
                                            type="button"
                                            aria-label={`Remove the image ${f.fileName}`}
                                            title="Remove it from the twin's files (other panels that show it stay empty)"
                                            disabled={busy}
                                            onClick={async () => {
                                                setBusy(true);
                                                if (await files.remove(f.fileName)) {
                                                    if (file === f.fileName) setFile(undefined);
                                                    await refresh();
                                                }
                                                setBusy(false);
                                            }}
                                        >
                                            <Trash2 aria-hidden="true" />
                                        </IconOnly>
                                    </li>
                                ))
                            )}
                        </FileList>
                        <SmallButton type="button" disabled={busy} onClick={() => uploadRef.current?.click()}>
                            <Upload aria-hidden="true" />
                            {busy ? "Uploading…" : "Upload an image"}
                        </SmallButton>
                        <input
                            ref={uploadRef}
                            type="file"
                            hidden
                            aria-label="Image file"
                            accept=".png,.jpg,.jpeg,.webp,.gif,.svg,image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                            onChange={(e) => {
                                const picked = e.target.files?.[0];
                                e.target.value = "";
                                void upload(picked);
                            }}
                        />
                    </Files>
                    <Preview aria-label="Preview">
                        <PictureView
                            file={file}
                            fit={fit}
                            bindings={bindings}
                            store={store}
                            load={files.load}
                            highlight={hover}
                            onPickElement={isSvg ? (id) => addBinding(id) : undefined}
                        />
                    </Preview>
                    <Bindings aria-label="Animations" ref={listRef}>
                        {!isSvg ? (
                            <p className="hint">Animations are for SVG images: their elements with an id change with the values of the NATS messages.</p>
                        ) : (
                            <>
                                <p className="hint">
                                    <strong>Click an element of the picture</strong> to animate it (or “Add”): choose where its value comes from and what the value does to it. Each
                                    animation shows what it does now with the last value. {ids.length} elements of the SVG have an id.
                                </p>
                                {bindings.map((b, i) => (
                                    <BindingCard
                                        key={i}
                                        index={i}
                                        binding={b}
                                        elements={ids}
                                        topics={topics}
                                        seen={fieldsOf.get(b.topicRef) ?? []}
                                        store={store}
                                        active={fresh === i || hover === b.element}
                                        onChange={(patch) => update(i, patch)}
                                        onAction={(action) => changeAction(i, action)}
                                        onRemove={() => {
                                            setBindings((list) => list.filter((_, k) => k !== i));
                                            setFresh(null);
                                        }}
                                        onHover={(on) => setHover(on ? b.element : null)}
                                    />
                                ))}
                                <SmallButton type="button" onClick={() => addBinding()} disabled={ids.length === 0 || bindings.length >= PICTURE_MAX_BINDINGS} style={{ alignSelf: "flex-start" }}>
                                    <Plus aria-hidden="true" />
                                    Add an animation
                                </SmallButton>
                            </>
                        )}
                    </Bindings>
                </Body>
                <Actions>
                    <SmallButton type="button" onClick={onDiscard} style={{ height: 36 }}>
                        Discard
                    </SmallButton>
                    <button type="submit" style={{ background: "#3d82f0", border: "1px solid #3d82f0", color: "#fff" }}>
                        Apply
                    </button>
                </Actions>
            </Dialog>
        </Backdrop>
    );
};
