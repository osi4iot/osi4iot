// The slides of the Viewer, in one row whether there is one slide or several and whether the layout is edited
// or not: arrows, the current slide's title and position, a tab per slide and, on the right, icons.
// Only the slides shown are gone through; PageUp / PageDown change the slide too, when no field is being typed in.
//
// The icons: New slide, Duplicate slide, Edit slide, Delete slide (a second click confirms) and All slides (where
// the user chooses which slides the bar shows, and reorders them). Edit slide edits the layout: the icons become
// Add panel, Cancel and Save for the group (Done for those who only change it for themselves), and a double click
// on the current tab opens its title and tag.
import { FC, KeyboardEvent, ReactNode, useEffect, useId, useRef, useState } from "react";
import styled from "styled-components";
import { Check, ChevronLeft, ChevronRight, Copy, LayoutGrid, Pencil, Plus, RotateCcw, SquarePlus, Trash2, X } from "lucide-react";
import { scrollbarStyle } from "../../../Tools/FormTools";
import { MAX_SLIDES, SLIDE_TAG, SLIDE_TITLE_MAX, WorkspaceSlide } from "./workspaceLayout";

const font = `Roboto, "Helvetica Neue", Arial, sans-serif`;

const Wrap = styled.div`
    position: relative;
    flex: none;
    display: flex;
    flex-direction: column;
    gap: 8px;
    font-family: ${font};
`;

const Row = styled.div`
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
`;

const Arrow = styled.button`
    width: 34px;
    height: 34px;
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    background: #1b1e22;
    border: 1px solid #2c3137;
    border-radius: 8px;
    color: #e6e8eb;
    cursor: pointer;

    &:hover:not(:disabled),
    &:focus-visible {
        border-color: #3d82f0;
    }
    &:disabled {
        opacity: 0.4;
        cursor: default;
    }
    svg {
        width: 17px;
        height: 17px;
    }
`;

// an icon of the right of the row (its tooltip names it)
const Icon = styled(Arrow)<{ $tone?: "primary" | "danger" | "armed" }>`
    ${({ $tone }) =>
        $tone === "primary"
            ? "background: #3d82f0; border-color: #3d82f0; color: #ffffff;"
            : $tone === "danger"
              ? "color: #f2a1aa; border-color: #5a2e33;"
              : $tone === "armed"
                ? "background: #e5484d; border-color: #e5484d; color: #ffffff;"
                : ""}
`;

// apart from the tabs: a line between them and some room
const Icons = styled.div`
    display: flex;
    align-items: center;
    gap: 6px;
    margin-left: auto;
    flex: none;
    padding-left: 12px;
    border-left: 1px solid #2c3137;
`;

const IconSeparator = styled.span`
    width: 1px;
    height: 22px;
    margin: 0 2px;
    background: #2c3137;
`;

// the title and tag of the current slide (a double click on its tab, while the layout is edited)
const Popover = styled.div`
    position: absolute;
    top: calc(100% + 6px);
    z-index: 1100;
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 260px;
    padding: 12px;
    background: #16181c;
    border: 1px solid #2c3137;
    border-radius: 10px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45);
    font-size: 13px;

    label {
        display: flex;
        flex-direction: column;
        gap: 4px;
        color: #c7cbd1;
        font-size: 12px;
    }
    small {
        color: #9aa1aa;
        font-size: 11px;
    }
`;

const Current = styled.div`
    display: flex;
    flex-direction: column;
    min-width: 0;
    flex: none;
    max-width: 220px;

    strong {
        font-size: 14px;
        font-weight: 600;
        color: #f2f3f5;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    span {
        font-size: 12px;
        color: #9aa1aa;
    }
`;

// the tabs scroll; where some are hidden, that edge fades out (so a cut tab is not taken for one touching the icons)
const FADE = 28;
const Scroll = styled.div<{ $fadeLeft: boolean; $fadeRight: boolean }>`
    /* positioned: the tabs' offsetLeft is measured from here */
    position: relative;
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    overflow-x: auto;
    padding: 2px 0;
    mask-image: linear-gradient(
        to right,
        transparent 0,
        #000 ${({ $fadeLeft }) => ($fadeLeft ? FADE : 0)}px,
        #000 calc(100% - ${({ $fadeRight }) => ($fadeRight ? FADE : 0)}px),
        transparent 100%
    );
    ${scrollbarStyle}
    &::-webkit-scrollbar {
        height: 6px;
    }
`;

const Tab = styled.button<{ $on: boolean }>`
    height: 30px;
    flex: none;
    padding: 0 12px;
    border-radius: 7px;
    border: 1px solid ${({ $on }) => ($on ? "#3d82f0" : "#2c3137")};
    background: ${({ $on }) => ($on ? "#23324a" : "transparent")};
    color: ${({ $on }) => ($on ? "#e6efff" : "#b4bac2")};
    font: ${({ $on }) => ($on ? 600 : 500)} 13px ${font};
    cursor: pointer;
    max-width: 200px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
`;

const Field = styled.input`
    height: 30px;
    box-sizing: border-box;
    padding: 0 8px;
    background: #0c0d0f;
    border: 1px solid #2c3137;
    border-radius: 7px;
    color: #e6e8eb;
    font: 400 13px ${font};

    &:focus {
        outline: none;
        border-color: #3d82f0;
    }
    &[aria-invalid="true"] {
        border-color: #e5484d;
    }
`;

export interface SlideBarProps {
    // the slides shown (those the user did not hide), and all of them (their count)
    slides: WorkspaceSlide[];
    allSlides: WorkspaceSlide[];
    current: WorkspaceSlide;
    // the tags of the slides: the ones offered when a tag is typed
    tags: string[];
    editing: boolean;
    phone?: boolean;
    onGo: (id: string) => void;
    onStep: (delta: number) => void;
    onAdd: () => void;
    onDuplicate: () => void;
    onRemove: () => void;
    // (kept for the callers; the slides are reordered in All slides)
    onMove?: (delta: -1 | 1) => void;
    onUpdate: (patch: { title?: string; tag?: string }) => void;
    // opens all the slides (thumbnails, search, order)
    onOverview?: () => void;
    // the slide icons (New, Duplicate, Edit, Delete): whoever can change the layout, not on a phone
    canEdit?: boolean;
    // a group administrator: the layout is saved for the group
    canSave?: boolean;
    saving?: boolean;
    // a layout to go back to (the automatic one, or the group's), with its name; none: no icon
    restoreLabel?: string | null;
    onEdit?: () => void;
    onAddPanel?: () => void;
    onCancel?: () => void;
    onSave?: () => void;
    onDone?: () => void;
    onRestore?: () => void;
}

// typing in a field (or a menu): PageUp / PageDown are the field's
const isTyping = (target: EventTarget | null) => {
    const el = target as HTMLElement | null;
    if (!el || !el.tagName) return false;
    return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
};

const SlideBar: FC<SlideBarProps> = ({
    slides,
    allSlides,
    current,
    tags,
    editing,
    phone = false,
    onGo,
    onStep,
    onAdd,
    onDuplicate,
    onRemove,
    onUpdate,
    onOverview,
    canEdit = false,
    canSave = false,
    saving = false,
    restoreLabel = null,
    onEdit,
    onAddPanel,
    onCancel,
    onSave,
    onDone,
    onRestore,
}) => {
    const ids = useId();
    const at = Math.max(
        0,
        slides.findIndex((s) => s.id === current.id),
    );
    const several = slides.length > 1;
    const wrapRef = useRef<HTMLDivElement>(null);
    // the tabs: whether some are hidden on the left / on the right
    const scrollRef = useRef<HTMLDivElement>(null);
    const [hidden, setHidden] = useState({ left: false, right: false });
    const measure = () => {
        const el = scrollRef.current;
        if (!el) return;
        const left = el.scrollLeft > 1;
        const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
        setHidden((h) => (h.left === left && h.right === right ? h : { left, right }));
    };
    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        measure();
        if (typeof ResizeObserver === "undefined") return;
        const observer = new ResizeObserver(measure);
        observer.observe(el);
        return () => observer.disconnect();
    }, [phone, slides.length]);
    // the tab of the slide shown is always in sight (clear of the fading edges)
    useEffect(() => {
        const el = scrollRef.current;
        const tab = el?.querySelectorAll<HTMLElement>('[role="tab"]')[at];
        if (!el || !tab) return;
        if (tab.offsetLeft - FADE < el.scrollLeft) el.scrollLeft = Math.max(0, tab.offsetLeft - FADE);
        else if (tab.offsetLeft + tab.offsetWidth + FADE > el.scrollLeft + el.clientWidth)
            el.scrollLeft = tab.offsetLeft + tab.offsetWidth + FADE - el.clientWidth;
        measure();
    }, [at, slides.length]);
    // the title and tag of the current slide: where its tab is
    const [naming, setNaming] = useState<number | null>(null);
    // Delete is armed by a first click; a second one deletes
    const [deleteArmed, setDeleteArmed] = useState(false);
    useEffect(() => setDeleteArmed(false), [current.id, editing]);
    useEffect(() => {
        if (!editing) setNaming(null);
    }, [editing]);

    useEffect(() => {
        if (!several) return;
        const onKey = (e: globalThis.KeyboardEvent) => {
            if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || isTyping(e.target)) return;
            if (e.key === "PageDown" || e.key === "PageUp") {
                e.preventDefault();
                onStep(e.key === "PageDown" ? 1 : -1);
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [several, onStep]);

    // the arrows of the keyboard move between the tabs (and show the slide), as in a tab list
    const onTabsKey = (e: KeyboardEvent<HTMLDivElement>) => {
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        e.preventDefault();
        onStep(e.key === "ArrowRight" ? 1 : -1);
        const next = e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]');
        const target = next[(at + (e.key === "ArrowRight" ? 1 : -1) + slides.length) % slides.length];
        target?.focus();
    };

    const icon = (
        label: string,
        title: string,
        node: ReactNode,
        onClick?: () => void,
        extra: { disabled?: boolean; tone?: "primary" | "danger" | "armed" } = {},
    ) => (
        <Icon type="button" aria-label={label} title={title} disabled={extra.disabled || !onClick} $tone={extra.tone} onClick={onClick}>
            {node}
        </Icon>
    );

    const count = allSlides.length;
    const showIcons = canEdit && !phone;
    return (
        <Wrap aria-label="Slides" role="group" ref={wrapRef}>
            <Row>
                <Arrow
                    type="button"
                    aria-label="Previous slide"
                    title="Previous slide (PageUp)"
                    disabled={!several}
                    onClick={() => onStep(-1)}
                >
                    <ChevronLeft aria-hidden="true" />
                </Arrow>
                <Current aria-live="polite">
                    <strong>{current.title}</strong>
                    <span>
                        Slide {at + 1} of {slides.length}
                        {slides.length !== allSlides.length ? ` (${allSlides.length} in all)` : ""}
                    </span>
                </Current>
                <Arrow type="button" aria-label="Next slide" title="Next slide (PageDown)" disabled={!several} onClick={() => onStep(1)}>
                    <ChevronRight aria-hidden="true" />
                </Arrow>
                {!phone && (
                    <Scroll
                        ref={scrollRef}
                        role="tablist"
                        aria-label="Slide"
                        onKeyDown={onTabsKey}
                        onScroll={measure}
                        $fadeLeft={hidden.left}
                        $fadeRight={hidden.right}
                    >
                        {slides.map((s) => (
                            <Tab
                                key={s.id}
                                type="button"
                                role="tab"
                                aria-selected={s.id === current.id}
                                tabIndex={s.id === current.id ? 0 : -1}
                                $on={s.id === current.id}
                                title={
                                    editing && s.id === current.id
                                        ? `${s.title} · ${s.tag} · double-click to rename`
                                        : `${s.title} · ${s.tag}`
                                }
                                onClick={() => onGo(s.id)}
                                onDoubleClick={(e) => {
                                    if (!editing || s.id !== current.id) return;
                                    const wrap = wrapRef.current?.getBoundingClientRect();
                                    const tab = e.currentTarget.getBoundingClientRect();
                                    setNaming(wrap ? Math.max(0, tab.left - wrap.left) : 0);
                                }}
                            >
                                {s.title}
                            </Tab>
                        ))}
                    </Scroll>
                )}
                <Icons role="toolbar" aria-label={editing ? "Edit slide" : "Slide"}>
                    {showIcons && !editing && (
                        <>
                            {icon(
                                "New slide",
                                count >= MAX_SLIDES ? `At most ${MAX_SLIDES} slides` : "New slide",
                                <Plus aria-hidden="true" />,
                                onAdd,
                                {
                                    disabled: count >= MAX_SLIDES || saving,
                                },
                            )}
                            {icon("Duplicate slide", "Duplicate slide", <Copy aria-hidden="true" />, onDuplicate, {
                                disabled: count >= MAX_SLIDES || saving,
                            })}
                            {icon(
                                "Edit slide",
                                canSave
                                    ? "Edit slide: add, move and resize its panels, for the whole group"
                                    : "Edit slide: add, move and resize its panels (only for you)",
                                <Pencil aria-hidden="true" />,
                                onEdit,
                                { disabled: saving },
                            )}
                            {icon(
                                deleteArmed ? `Confirm: delete the slide ${current.title}` : `Delete the slide ${current.title}`,
                                count <= 1
                                    ? "The only slide cannot be deleted"
                                    : deleteArmed
                                      ? "Click again to delete the slide"
                                      : "Delete slide",
                                <Trash2 aria-hidden="true" />,
                                () => {
                                    if (!deleteArmed) {
                                        setDeleteArmed(true);
                                        return;
                                    }
                                    setDeleteArmed(false);
                                    onRemove();
                                },
                                { disabled: count <= 1 || saving, tone: deleteArmed ? "armed" : "danger" },
                            )}
                            {restoreLabel &&
                                !canSave &&
                                icon(
                                    `Back to the ${restoreLabel.toLowerCase()}`,
                                    `Back to the ${restoreLabel.toLowerCase()}`,
                                    <RotateCcw aria-hidden="true" />,
                                    onRestore,
                                )}
                        </>
                    )}
                    {showIcons && editing && (
                        <>
                            {icon("Add panel", "Add panel", <SquarePlus aria-hidden="true" />, onAddPanel, { disabled: saving })}
                            {restoreLabel &&
                                icon(
                                    `Back to the ${restoreLabel.toLowerCase()}`,
                                    `Back to the ${restoreLabel.toLowerCase()}`,
                                    <RotateCcw aria-hidden="true" />,
                                    onRestore,
                                    { disabled: saving },
                                )}
                            <IconSeparator aria-hidden="true" />
                            {icon("Cancel", "Cancel: undo the changes", <X aria-hidden="true" />, onCancel, { disabled: saving })}
                            {canSave
                                ? icon(
                                      saving ? "Saving…" : "Save for the group",
                                      saving ? "Saving…" : "Save for the group",
                                      <Check aria-hidden="true" />,
                                      onSave,
                                      {
                                          disabled: saving,
                                          tone: "primary",
                                      },
                                  )
                                : icon(
                                      "Done",
                                      "Done: keep these changes while the viewer is open (only for you)",
                                      <Check aria-hidden="true" />,
                                      onDone,
                                      {
                                          tone: "primary",
                                      },
                                  )}
                        </>
                    )}
                    {onOverview && !(showIcons && editing) && (
                        <>
                            {showIcons && <IconSeparator aria-hidden="true" />}
                            {icon("All slides", "All slides: find, show or hide, reorder", <LayoutGrid aria-hidden="true" />, onOverview)}
                        </>
                    )}
                </Icons>
            </Row>
            {editing && naming !== null && !phone && (
                <SlideNaming
                    key={current.id}
                    idBase={ids}
                    slide={current}
                    tags={tags}
                    left={naming}
                    onUpdate={onUpdate}
                    onClose={() => setNaming(null)}
                />
            )}
        </Wrap>
    );
};

interface SlideNamingProps {
    idBase: string;
    slide: WorkspaceSlide;
    tags: string[];
    left: number;
    onUpdate: (patch: { title?: string; tag?: string }) => void;
    onClose: () => void;
}

// The title and tag of the current slide, under its tab
const SlideNaming: FC<SlideNamingProps> = ({ idBase, slide, tags, left, onUpdate, onClose }) => {
    const [title, setTitle] = useState(slide.title);
    const [tag, setTag] = useState(slide.tag);
    const ref = useRef<HTMLDivElement>(null);
    const tagValid = SLIDE_TAG.test(tag.trim());
    const commit = () => {
        const patch: { title?: string; tag?: string } = {};
        if (title.trim() && title.trim() !== slide.title) patch.title = title;
        if (tagValid && tag.trim() !== slide.tag) patch.tag = tag;
        if (patch.title !== undefined || patch.tag !== undefined) onUpdate(patch);
        onClose();
    };
    const commitRef = useRef(commit);
    commitRef.current = commit;
    useEffect(() => {
        ref.current?.querySelector("input")?.focus();
        // a click outside keeps what was typed
        const onDown = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) commitRef.current();
        };
        document.addEventListener("mousedown", onDown);
        return () => document.removeEventListener("mousedown", onDown);
    }, []);
    const keys = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") onClose();
    };
    return (
        <Popover ref={ref} role="dialog" aria-label="Slide title and tag" style={{ left }}>
            <label>
                Title
                <Field
                    id={`${idBase}-title`}
                    value={title}
                    maxLength={SLIDE_TITLE_MAX}
                    onChange={(e) => setTitle(e.target.value)}
                    onKeyDown={keys}
                />
            </label>
            <label>
                Tag
                <Field
                    id={`${idBase}-tag`}
                    value={tag}
                    maxLength={40}
                    list={`${idBase}-tags`}
                    aria-invalid={!tagValid}
                    onChange={(e) => setTag(e.target.value)}
                    onKeyDown={keys}
                />
            </label>
            <datalist id={`${idBase}-tags`}>
                {tags.map((t) => (
                    <option key={t} value={t} />
                ))}
            </datalist>
            <small>
                Letters, digits, spaces, _ . -. Slides with the same tag are shown or hidden together. Enter keeps it, Esc leaves it.
            </small>
        </Popover>
    );
};

export default SlideBar;
