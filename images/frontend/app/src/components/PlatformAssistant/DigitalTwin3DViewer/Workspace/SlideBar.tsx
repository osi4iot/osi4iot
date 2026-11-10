// The slides of the Viewer: arrows, the current slide's title and position, a tab per slide and the button of
// all the slides (where the user chooses which slides the bar shows). Only the slides shown are gone through.
// PageUp / PageDown change the slide too, when no field is being typed in.
//
// While the layout is edited, a second row changes the current slide: its title and tag, its place, a copy of
// it, a new slide or removing it.
import { FC, KeyboardEvent, useEffect, useId, useState } from "react";
import styled from "styled-components";
import { ChevronLeft, ChevronRight, Copy, LayoutGrid, MoveLeft, MoveRight, Plus, Trash2 } from "lucide-react";
import { scrollbarStyle } from "../../../Tools/FormTools";
import { MAX_SLIDES, SLIDE_TAG, SLIDE_TITLE_MAX, WorkspaceSlide } from "./workspaceLayout";

const font = `Roboto, "Helvetica Neue", Arial, sans-serif`;

const Wrap = styled.div`
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

const Scroll = styled.div`
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    overflow-x: auto;
    padding: 2px 0;
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

const Tools = styled.div`
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    padding: 8px 10px;
    background: #121820;
    border: 1px solid #263a57;
    border-radius: 10px;
    font-size: 13px;

    label {
        color: #c7cbd1;
        font-size: 12px;
    }
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

const ToolButton = styled.button<{ $danger?: boolean }>`
    height: 30px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0 10px;
    background: #1b1e22;
    border: 1px solid ${({ $danger }) => ($danger ? "#5a2e33" : "#2c3137")};
    border-radius: 7px;
    color: ${({ $danger }) => ($danger ? "#f2a1aa" : "#d5d9de")};
    font: 500 12px ${font};
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

const Spacer = styled.span`
    flex: 1;
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
    onMove: (delta: -1 | 1) => void;
    onUpdate: (patch: { title?: string; tag?: string }) => void;
    // opens all the slides (thumbnails, search, order)
    onOverview?: () => void;
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
    onMove,
    onUpdate,
    onOverview,
}) => {
    const ids = useId();
    const at = Math.max(0, slides.findIndex((s) => s.id === current.id));
    const several = slides.length > 1;

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

    const allAt = allSlides.findIndex((s) => s.id === current.id);
    return (
        <Wrap aria-label="Slides" role="group">
            <Row>
                <Arrow type="button" aria-label="Previous slide" title="Previous slide (PageUp)" disabled={!several} onClick={() => onStep(-1)}>
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
                    <Scroll role="tablist" aria-label="Slide" onKeyDown={onTabsKey}>
                        {slides.map((s) => (
                            <Tab
                                key={s.id}
                                type="button"
                                role="tab"
                                aria-selected={s.id === current.id}
                                tabIndex={s.id === current.id ? 0 : -1}
                                $on={s.id === current.id}
                                title={`${s.title} · ${s.tag}`}
                                onClick={() => onGo(s.id)}
                            >
                                {s.title}
                            </Tab>
                        ))}
                    </Scroll>
                )}
                {onOverview && (
                    <Arrow
                        type="button"
                        aria-label="All slides"
                        title="All slides: find, show or hide, reorder"
                        style={{ marginLeft: "auto" }}
                        onClick={onOverview}
                    >
                        <LayoutGrid aria-hidden="true" />
                    </Arrow>
                )}
            </Row>
            {editing && !phone && (
                <SlideTools
                    key={current.id}
                    idBase={ids}
                    slide={current}
                    tags={tags}
                    index={allAt}
                    count={allSlides.length}
                    onAdd={onAdd}
                    onDuplicate={onDuplicate}
                    onRemove={onRemove}
                    onMove={onMove}
                    onUpdate={onUpdate}
                />
            )}
        </Wrap>
    );
};

interface SlideToolsProps {
    idBase: string;
    slide: WorkspaceSlide;
    tags: string[];
    index: number;
    count: number;
    onAdd: () => void;
    onDuplicate: () => void;
    onRemove: () => void;
    onMove: (delta: -1 | 1) => void;
    onUpdate: (patch: { title?: string; tag?: string }) => void;
}

// The current slide while the layout is edited
const SlideTools: FC<SlideToolsProps> = ({ idBase, slide, tags, index, count, onAdd, onDuplicate, onRemove, onMove, onUpdate }) => {
    const [title, setTitle] = useState(slide.title);
    const [tag, setTag] = useState(slide.tag);
    const tagValid = SLIDE_TAG.test(tag.trim());
    const commitTitle = () => {
        if (!title.trim()) setTitle(slide.title);
        else if (title.trim() !== slide.title) onUpdate({ title });
    };
    const commitTag = () => {
        if (!tagValid) setTag(slide.tag);
        else if (tag.trim() !== slide.tag) onUpdate({ tag });
    };
    const enter = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
    };
    return (
        <Tools role="region" aria-label="This slide">
            <label htmlFor={`${idBase}-title`}>Title</label>
            <Field
                id={`${idBase}-title`}
                value={title}
                maxLength={SLIDE_TITLE_MAX}
                style={{ width: 180 }}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={commitTitle}
                onKeyDown={enter}
            />
            <label htmlFor={`${idBase}-tag`}>Tag</label>
            <Field
                id={`${idBase}-tag`}
                value={tag}
                maxLength={40}
                list={`${idBase}-tags`}
                style={{ width: 140 }}
                aria-invalid={!tagValid}
                title="Letters, digits, spaces, _ . -. Slides with the same tag are shown or hidden together."
                onChange={(e) => setTag(e.target.value)}
                onBlur={commitTag}
                onKeyDown={enter}
            />
            <datalist id={`${idBase}-tags`}>
                {tags.map((t) => (
                    <option key={t} value={t} />
                ))}
            </datalist>
            <ToolButton type="button" aria-label="Move the slide before" title="Move before" disabled={index <= 0} onClick={() => onMove(-1)}>
                <MoveLeft aria-hidden="true" />
            </ToolButton>
            <ToolButton type="button" aria-label="Move the slide after" title="Move after" disabled={index >= count - 1} onClick={() => onMove(1)}>
                <MoveRight aria-hidden="true" />
            </ToolButton>
            <Spacer />
            <ToolButton type="button" disabled={count >= MAX_SLIDES} onClick={onDuplicate}>
                <Copy aria-hidden="true" />
                Duplicate
            </ToolButton>
            <ToolButton type="button" disabled={count <= 1} $danger onClick={onRemove} aria-label={`Remove the slide ${slide.title}`}>
                <Trash2 aria-hidden="true" />
                Remove
            </ToolButton>
            <ToolButton type="button" disabled={count >= MAX_SLIDES} onClick={onAdd} title={count >= MAX_SLIDES ? `At most ${MAX_SLIDES} slides` : undefined}>
                <Plus aria-hidden="true" />
                New slide
            </ToolButton>
        </Tools>
    );
};

export default SlideBar;
