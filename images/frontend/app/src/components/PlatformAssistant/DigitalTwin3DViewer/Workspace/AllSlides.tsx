// "All slides": every slide of the Viewer as a thumbnail (its panels drawn small, by type), to find one by its
// title, tag or panel titles and open it, to choose which slides the slide bar shows (the eye of each one, or
// all the slides found at once), and to reorder them by dragging a thumbnail (or with Alt + ← → on it).
// What is shown or hidden is the user's (remembered as the rest of the viewer), not the layout's. Reordering changes the layout: it starts editing it, as adding a panel does; it is saved (or kept only
// for the user) as every other change of the layout. While searching, the order cannot be changed.
import { DragEvent, FC, KeyboardEvent, useEffect, useRef, useState } from "react";
import styled from "styled-components";
import { BellRing, Box, Camera, ChartLine, ClipboardCheck, Eye, EyeOff, GripVertical, Search, X } from "lucide-react";
import { scrollbarStyle } from "../../../Tools/FormTools";
import { GRID_COLS, PAGE_ROWS, PanelType, WorkspaceSlide, panelTitle, searchSlides } from "./workspaceLayout";

const font = `Roboto, "Helvetica Neue", Arial, sans-serif`;

const Overlay = styled.div`
    position: absolute;
    inset: 0;
    z-index: 30;
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 16px;
    box-sizing: border-box;
    background: #0b0c0e;
    border: 1px solid #262a2f;
    border-radius: 12px;
    font-family: ${font};
    color: #e6e8eb;
`;

const Head = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;

    h2 {
        margin: 0;
        font-size: 16px;
        font-weight: 600;
    }
    p {
        margin: 0;
        font-size: 13px;
        color: #9aa1aa;
    }
`;

const SearchBox = styled.label`
    margin-left: auto;
    height: 36px;
    width: 280px;
    max-width: 100%;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 10px;
    box-sizing: border-box;
    background: #141619;
    border: 1px solid #2c3137;
    border-radius: 8px;

    &:focus-within {
        border-color: #3d82f0;
    }
    svg {
        width: 15px;
        height: 15px;
        color: #9aa1aa;
        flex: none;
    }
    input {
        flex: 1;
        min-width: 0;
        height: 100%;
        background: transparent;
        border: none;
        outline: none;
        color: #e6e8eb;
        font: 400 14px ${font};
    }
`;

const Close = styled.button`
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #1b1e22;
    border: 1px solid #2c3137;
    border-radius: 8px;
    color: #d5d9de;
    cursor: pointer;

    svg {
        width: 16px;
        height: 16px;
    }
`;

const List = styled.ol`
    list-style: none;
    margin: 0;
    padding: 2px;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    align-content: start;
    gap: 18px;
    ${scrollbarStyle}
`;

const Item = styled.li<{ $drop: "before" | "after" | null; $dragging: boolean }>`
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 8px;
    opacity: ${({ $dragging }) => ($dragging ? 0.4 : 1)};

    &::before {
        content: "";
        display: ${({ $drop }) => ($drop ? "block" : "none")};
        position: absolute;
        top: 0;
        bottom: 0;
        ${({ $drop }) => ($drop === "after" ? "right: -11px;" : "left: -11px;")}
        width: 4px;
        border-radius: 2px;
        background: #3d82f0;
    }
`;

const Card = styled.button<{ $current: boolean; $muted: boolean }>`
    width: 100%;
    aspect-ratio: 16 / 9;
    padding: 8px;
    box-sizing: border-box;
    display: flex;
    background: #141619;
    border: ${({ $current }) => ($current ? "2px solid #3d82f0" : "1px solid #2c3137")};
    border-radius: 12px;
    cursor: pointer;
    opacity: ${({ $muted }) => ($muted ? 0.55 : 1)};

    &:focus-visible {
        outline: 2px solid #8ab4ff;
        outline-offset: 2px;
    }
`;

const Mini = styled.span`
    flex: 1;
    display: grid;
    grid-template-columns: repeat(${GRID_COLS}, minmax(0, 1fr));
    gap: 3px;
    min-height: 0;
`;

const Block = styled.span`
    min-width: 0;
    min-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    overflow: hidden;
    border-radius: 4px;
    font-size: 10px;
    color: #c7cbd1;

    svg {
        width: 12px;
        height: 12px;
        flex: none;
    }
`;

const Caption = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    font-size: 13px;

    strong {
        flex: 1;
        min-width: 0;
        font-weight: 600;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    svg {
        width: 14px;
        height: 14px;
        flex: none;
        color: #7d848d;
    }
`;

const Tag = styled.span`
    flex: none;
    padding: 2px 8px;
    border: 1px solid #3d5f93;
    border-radius: 10px;
    color: #a9c4ee;
    font-size: 11px;
    max-width: 110px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
`;

const Count = styled.span`
    position: absolute;
    right: 14px;
    top: 14px;
    padding: 2px 7px;
    border-radius: 10px;
    background: rgba(11, 12, 14, 0.85);
    color: #9aa1aa;
    font-size: 11px;
    pointer-events: none;
`;

const EyeToggle = styled.button<{ $on: boolean }>`
    flex: none;
    width: 30px;
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    background: ${({ $on }) => ($on ? "transparent" : "#1b1e22")};
    border: 1px solid ${({ $on }) => ($on ? "transparent" : "#2c3137")};
    border-radius: 7px;
    color: ${({ $on }) => ($on ? "#9aa1aa" : "#7d848d")};
    cursor: pointer;

    &:hover:not(:disabled),
    &:focus-visible {
        border-color: #3d82f0;
        color: #e6e8eb;
    }
    &:disabled {
        opacity: 0.35;
        cursor: default;
    }
    svg {
        width: 16px;
        height: 16px;
        color: inherit;
    }
`;

const HeadButton = styled.button`
    height: 36px;
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0 12px;
    background: #1b1e22;
    border: 1px solid #2c3137;
    border-radius: 8px;
    color: #d5d9de;
    font: 500 13px ${font};
    cursor: pointer;

    &:disabled {
        opacity: 0.45;
        cursor: default;
    }
    svg {
        width: 15px;
        height: 15px;
    }
`;

const HiddenBadge = styled.span`
    position: absolute;
    top: 14px;
    left: 14px;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 8px;
    border-radius: 10px;
    background: rgba(11, 12, 14, 0.85);
    color: #c7cbd1;
    font-size: 11px;
    pointer-events: none;

    svg {
        width: 12px;
        height: 12px;
    }
`;

const Nothing = styled.p`
    margin: 40px 0;
    text-align: center;
    color: #9aa1aa;
    font-size: 14px;
`;

const BLOCK_COLOR: Record<PanelType, string> = {
    model: "#24344c",
    image: "#43341f",
    chart: "#1f3348",
    alarms: "#47262b",
    approvals: "#262f48",
};

const blockIcon = (type: PanelType) =>
    type === "model" ? (
        <Box aria-hidden="true" />
    ) : type === "image" ? (
        <Camera aria-hidden="true" />
    ) : type === "alarms" ? (
        <BellRing aria-hidden="true" />
    ) : type === "approvals" ? (
        <ClipboardCheck aria-hidden="true" />
    ) : (
        <ChartLine aria-hidden="true" />
    );

// The panels of a slide drawn small: the grid of the slide, at least one page high
const Thumbnail: FC<{ slide: WorkspaceSlide }> = ({ slide }) => {
    const rows = Math.max(PAGE_ROWS, ...slide.panels.map((p) => p.y + p.h));
    return (
        <Mini aria-hidden="true" style={{ gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }}>
            {slide.panels.map((p) => (
                <Block
                    key={p.id}
                    style={{ gridColumn: `${p.x + 1} / span ${p.w}`, gridRow: `${p.y + 1} / span ${p.h}`, background: BLOCK_COLOR[p.type] }}
                >
                    {blockIcon(p.type)}
                    {p.w >= 3 && p.h >= 2 && <span>{panelTitle(p)}</span>}
                </Block>
            ))}
        </Mini>
    );
};

export interface AllSlidesProps {
    slides: WorkspaceSlide[];
    currentId: string;
    // the slides the slide bar does not show
    hiddenIds: string[];
    onOpen: (id: string) => void;
    // hides (or shows) the slides `ids` in the slide bar
    onSetHidden: (ids: string[], hide: boolean) => void;
    // the slide `id` to the place `to` of all the slides
    onReorder: (id: string, to: number) => void;
    onClose: () => void;
}

const AllSlides: FC<AllSlidesProps> = ({ slides, currentId, hiddenIds, onOpen, onSetHidden, onReorder, onClose }) => {
    const [query, setQuery] = useState("");
    const [dragId, setDragId] = useState<string | null>(null);
    const [drop, setDrop] = useState<{ id: string; side: "before" | "after" } | null>(null);
    const searchRef = useRef<HTMLInputElement>(null);
    const shown = searchSlides(slides, query);
    const searching = !!query.trim();
    const canReorder = !searching && slides.length > 1;
    const hiddenCount = slides.filter((s) => hiddenIds.includes(s.id)).length;
    const shownCount = slides.length - hiddenCount;
    const foundIds = shown.map((s) => s.id);
    const foundShown = shown.filter((s) => !hiddenIds.includes(s.id)).length;

    useEffect(() => {
        searchRef.current?.focus();
    }, []);

    const onEscape = (e: KeyboardEvent<HTMLDivElement>) => {
        if (e.key === "Escape") {
            e.stopPropagation();
            onClose();
        }
    };

    // the place the dragged slide goes to: before or after the slide under the pointer
    const dropIndex = (targetId: string, side: "before" | "after") => {
        const from = slides.findIndex((s) => s.id === dragId);
        let to = slides.findIndex((s) => s.id === targetId) + (side === "after" ? 1 : 0);
        if (from !== -1 && from < to) to -= 1;
        return to;
    };

    const over = (e: DragEvent<HTMLLIElement>, id: string) => {
        if (!dragId) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        const box = e.currentTarget.getBoundingClientRect();
        const side = box.width > 0 && e.clientX > box.left + box.width / 2 ? "after" : "before";
        if (drop?.id !== id || drop.side !== side) setDrop({ id, side });
    };

    const finish = (e: DragEvent<HTMLLIElement>, id: string) => {
        e.preventDefault();
        if (dragId && drop) {
            const to = dropIndex(drop.id, drop.side);
            if (to !== slides.findIndex((s) => s.id === dragId)) onReorder(dragId, to);
        }
        setDragId(null);
        setDrop(null);
    };

    const keyMove = (e: KeyboardEvent<HTMLButtonElement>, id: string) => {
        if (!canReorder || !e.altKey || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
        e.preventDefault();
        const at = slides.findIndex((s) => s.id === id);
        const to = at + (e.key === "ArrowRight" ? 1 : -1);
        if (to >= 0 && to < slides.length) onReorder(id, to);
    };

    return (
        <Overlay role="dialog" aria-label="All slides" onKeyDown={onEscape}>
            <Head>
                <h2>All slides</h2>
                <p>
                    {slides.length} slides{hiddenCount ? `, ${hiddenCount} hidden` : ""}.
                    {canReorder ? " Drag a slide (or Alt + ← → on it) to change its place." : searching ? " Clear the search to change the order." : ""}
                </p>
                <SearchBox>
                    <Search aria-hidden="true" />
                    <input
                        ref={searchRef}
                        type="search"
                        aria-label="Search slides"
                        placeholder="Title, tag or panel"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                    />
                </SearchBox>
                {searching && shown.length > 0 && (
                    <>
                        <HeadButton type="button" disabled={foundShown === shown.length} onClick={() => onSetHidden(foundIds, false)}>
                            <Eye aria-hidden="true" />
                            Show these {shown.length}
                        </HeadButton>
                        <HeadButton
                            type="button"
                            disabled={foundShown === 0 || foundShown === shownCount}
                            title={foundShown === shownCount ? "Some slide is always shown" : undefined}
                            onClick={() => onSetHidden(foundIds, true)}
                        >
                            <EyeOff aria-hidden="true" />
                            Hide these {shown.length}
                        </HeadButton>
                    </>
                )}
                {!searching && hiddenCount > 0 && (
                    <HeadButton type="button" onClick={() => onSetHidden(slides.map((s) => s.id), false)}>
                        <Eye aria-hidden="true" />
                        Show all
                    </HeadButton>
                )}
                <Close type="button" aria-label="Close all slides" onClick={onClose}>
                    <X aria-hidden="true" />
                </Close>
            </Head>
            {shown.length === 0 ? (
                <Nothing>No slide has “{query.trim()}” in its title, tag or panels.</Nothing>
            ) : (
                <List aria-label="Slides">
                    {shown.map((slide) => {
                        const n = slides.indexOf(slide) + 1;
                        const hidden = hiddenIds.includes(slide.id);
                        // the last slide shown cannot be hidden
                        const lastShown = !hidden && shownCount <= 1;
                        return (
                            <Item
                                key={slide.id}
                                draggable={canReorder}
                                $dragging={dragId === slide.id}
                                $drop={drop?.id === slide.id && dragId !== slide.id ? drop.side : null}
                                onDragStart={(e) => {
                                    if (!canReorder) return;
                                    setDragId(slide.id);
                                    e.dataTransfer.effectAllowed = "move";
                                    e.dataTransfer.setData("text/plain", slide.id);
                                }}
                                onDragOver={(e) => over(e, slide.id)}
                                onDrop={(e) => finish(e, slide.id)}
                                onDragEnd={() => {
                                    setDragId(null);
                                    setDrop(null);
                                }}
                            >
                                <Card
                                    type="button"
                                    $current={slide.id === currentId}
                                    $muted={hidden}
                                    aria-current={slide.id === currentId ? "true" : undefined}
                                    aria-label={`Open slide ${n}: ${slide.title}${hidden ? " (hidden)" : ""}`}
                                    onClick={() => onOpen(slide.id)}
                                    onKeyDown={(e) => keyMove(e, slide.id)}
                                >
                                    <Thumbnail slide={slide} />
                                </Card>
                                <Count aria-hidden="true">
                                    {slide.panels.length} {slide.panels.length === 1 ? "panel" : "panels"}
                                </Count>
                                {hidden && (
                                    <HiddenBadge aria-hidden="true">
                                        <EyeOff />
                                        Hidden
                                    </HiddenBadge>
                                )}
                                <Caption>
                                    {canReorder && <GripVertical aria-hidden="true" style={{ cursor: "grab" }} />}
                                    <strong>
                                        {n}. {slide.title}
                                    </strong>
                                    <Tag title={slide.tag}>{slide.tag}</Tag>
                                    <EyeToggle
                                        type="button"
                                        $on={!hidden}
                                        aria-pressed={!hidden}
                                        aria-label={`Show slide ${n} in the slide bar`}
                                        title={lastShown ? "Some slide is always shown" : hidden ? "Hidden: show it in the slide bar" : "Shown: hide it from the slide bar"}
                                        disabled={lastShown}
                                        onClick={() => onSetHidden([slide.id], !hidden)}
                                    >
                                        {hidden ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                                    </EyeToggle>
                                </Caption>
                            </Item>
                        );
                    })}
                </List>
            )}
        </Overlay>
    );
};

export default AllSlides;
