import { FC, KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styled, { css } from "styled-components";
import { ChevronRight, Search, X } from "lucide-react";
import {
    countAlarms,
    filterEntries,
    groupByPlace,
    SwitcherEntry,
    SwitcherFilter,
    SwitcherStatus,
    SwitcherTwin,
} from "./assetSwitcherData";

const PHONE_WIDTH = 640;

const STATUS_COLOR: Record<SwitcherStatus, string> = {
    ok: "#56c271",
    pending: "#f79520",
    alerting: "#f2495c",
};
const STATUS_TEXT: Record<SwitcherStatus, string> = { ok: "OK", pending: "Pending", alerting: "Alerting" };

const Backdrop = styled.div`
    position: fixed;
    inset: 0;
    z-index: 3000;
    background: rgba(5, 6, 8, 0.62);
    display: flex;
    justify-content: center;
    align-items: flex-start;
    padding: 9vh 16px 16px;
    box-sizing: border-box;

    @media (max-width: ${PHONE_WIDTH}px) {
        padding: 0;
    }
`;

const Dialog = styled.div`
    width: min(880px, 100%);
    max-height: min(620px, 82vh);
    display: flex;
    flex-direction: column;
    background: #17191c;
    color: #e6e8eb;
    border: 1px solid #2c3137;
    border-radius: 14px;
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.55);
    overflow: hidden;
    font: 400 14px Roboto, "Helvetica Neue", Arial, sans-serif;

    button,
    input {
        font-family: inherit;
    }

    @media (max-width: ${PHONE_WIDTH}px) {
        width: 100%;
        height: 100%;
        max-height: none;
        border-radius: 0;
        border: none;
    }
`;

const SearchRow = styled.div`
    flex: none;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 12px 0 16px;
    height: 56px;
    border-bottom: 1px solid #262a2f;
    color: #9aa1aa;
`;

const SearchInput = styled.input`
    flex: 1;
    min-width: 0;
    height: 100%;
    background: transparent;
    border: none;
    outline: none;
    color: #f2f3f5;
    font-size: 16px;

    &::placeholder {
        color: #7d848d;
    }
`;

const IconButton = styled.button`
    width: 36px;
    height: 36px;
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 8px;
    color: #c7cbd1;
    cursor: pointer;

    &:hover,
    &:focus-visible {
        border-color: #3a4048;
        background: #1f2226;
    }
`;

const Kbd = styled.kbd`
    font-family: inherit;

    @media (max-width: ${PHONE_WIDTH}px) {
        display: none;
    }

    font-size: 11px;
    color: #9aa1aa;
    border: 1px solid #2f343a;
    border-radius: 5px;
    padding: 2px 6px;
    white-space: nowrap;
`;

const FilterRow = styled.div`
    flex: none;
    display: flex;
    gap: 6px;
    padding: 10px 16px;
    border-bottom: 1px solid #262a2f;
    overflow-x: auto;
`;

const Chip = styled.button<{ $on: boolean }>`
    height: 30px;
    flex: none;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 12px;
    border-radius: 15px;
    border: 1px solid ${({ $on }) => ($on ? "#3d82f0" : "#2c3137")};
    background: ${({ $on }) => ($on ? "#23324a" : "transparent")};
    color: ${({ $on }) => ($on ? "#e6efff" : "#c7cbd1")};
    font-size: 13px;
    font-weight: ${({ $on }) => ($on ? 600 : 500)};
    cursor: pointer;
`;

const Body = styled.div`
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 300px;

    @media (max-width: ${PHONE_WIDTH}px) {
        grid-template-columns: minmax(0, 1fr);
    }
`;

const scrollbar = css`
    overflow-y: auto;
    &::-webkit-scrollbar {
        width: 8px;
    }
    &::-webkit-scrollbar-thumb {
        background: #2c3235;
        border-radius: 4px;
    }
`;

const List = styled.div`
    ${scrollbar}
    padding: 6px 0 10px;
`;

const SectionTitle = styled.div`
    position: sticky;
    top: -6px;
    z-index: 1;
    padding: 10px 16px 6px;
    background: #17191c;
    color: #8b929b;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.02em;
`;

const Row = styled.div<{ $active: boolean }>`
    margin: 0 8px;
    min-height: 48px;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 10px;
    border-radius: 9px;
    cursor: pointer;
    background: ${({ $active }) => ($active ? "#232a35" : "transparent")};
    outline: ${({ $active }) => ($active ? "1px solid #34537f" : "none")};

    &:hover {
        background: ${({ $active }) => ($active ? "#232a35" : "#1d2024")};
    }
`;

const Led = styled.span<{ $status: SwitcherStatus }>`
    width: 9px;
    height: 9px;
    flex: none;
    border-radius: 50%;
    background: ${({ $status }) => STATUS_COLOR[$status]};
`;

const RowText = styled.div`
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
`;

const RowTitle = styled.span`
    color: #f2f3f5;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
`;

const RowSub = styled.span`
    color: #9aa1aa;
    font-size: 12px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
`;

const Meta = styled.span`
    flex: none;
    color: #8b929b;
    font-size: 12px;
`;

const CurrentTag = styled.span`
    flex: none;
    font-size: 11px;
    color: #9cc2ff;
    border: 1px solid #34537f;
    border-radius: 5px;
    padding: 1px 6px;
`;

const Side = styled.aside`
    ${scrollbar}
    border-left: 1px solid #262a2f;
    padding: 14px 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    background: #141619;

    @media (max-width: ${PHONE_WIDTH}px) {
        display: none;
    }
`;

const SideTitle = styled.h3`
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: #f2f3f5;
`;

const SideSub = styled.p`
    margin: 0;
    color: #9aa1aa;
    font-size: 12px;
    line-height: 1.5;
`;

const TwinButton = styled.button<{ $active: boolean }>`
    width: 100%;
    min-height: 44px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    text-align: left;
    font-family: inherit;
    font-size: 13px;
    color: #e6e8eb;
    background: ${({ $active }) => ($active ? "#232a35" : "#1b1e22")};
    border: 1px solid ${({ $active }) => ($active ? "#3d82f0" : "#2c3137")};
    border-radius: 9px;
    cursor: pointer;

    &:hover {
        border-color: #3d82f0;
    }
`;

const InlineTwins = styled.div`
    display: none;
    margin: 2px 8px 6px 34px;
    flex-direction: column;
    gap: 6px;

    @media (max-width: ${PHONE_WIDTH}px) {
        display: flex;
    }
`;

const Footer = styled.div`
    flex: none;
    display: flex;
    gap: 16px;
    padding: 9px 16px;
    border-top: 1px solid #262a2f;
    color: #8b929b;
    font-size: 12px;

    @media (max-width: ${PHONE_WIDTH}px) {
        display: none;
    }
`;

const Empty = styled.p`
    margin: 0;
    padding: 28px 16px;
    color: #9aa1aa;
    text-align: center;
`;

const timeAgo = (at: number | null, now: number): string => {
    if (at === null) return "";
    const minutes = Math.max(0, Math.round((now - at) / 60000));
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours} h ago`;
    return `${Math.round(hours / 24)} d ago`;
};

const twinTypeLabel = (type: string): string => {
    if (type === "Grafana dashboard") return "Dashboard";
    if (type === "Gltf 3D model" || type === "Glb 3D model") return "3D model";
    return type;
};

export interface AssetSwitcherProps {
    open: boolean;
    entries: SwitcherEntry[];
    currentDigitalTwinId: number | null;
    onClose: () => void;
    onOpenTwin: (entry: SwitcherEntry, twin: SwitcherTwin) => void;
    now?: number;
}

const FILTERS: { id: SwitcherFilter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "alarms", label: "With alarms" },
    { id: "recent", label: "Recent" },
];

const AssetSwitcher: FC<AssetSwitcherProps> = ({ open, entries, currentDigitalTwinId, onClose, onOpenTwin, now }) => {
    const [query, setQuery] = useState("");
    const [filter, setFilter] = useState<SwitcherFilter>("all");
    const [activeAssetId, setActiveAssetId] = useState<number | null>(null);
    const [activeTwinIndex, setActiveTwinIndex] = useState(0);
    const [focusTwins, setFocusTwins] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const restoreFocusRef = useRef<HTMLElement | null>(null);
    const titleId = useId();
    const listId = useId();
    const clock = now ?? Date.now();

    const sections = useMemo(() => groupByPlace(filterEntries(entries, query, filter), filter), [entries, query, filter]);
    const visible = useMemo(() => sections.flatMap((s) => s.entries), [sections]);
    const alarms = useMemo(() => countAlarms(entries), [entries]);
    const active = visible.find((e) => e.asset.id === activeAssetId) || visible[0] || null;

    // When opened: start empty, on the asset being viewed.
    useEffect(() => {
        if (!open) return;
        restoreFocusRef.current = document.activeElement as HTMLElement | null;
        setQuery("");
        setFilter("all");
        setFocusTwins(false);
        setActiveTwinIndex(0);
        const current = entries.find((e) => e.twins.some((t) => t.digitalTwin.id === currentDigitalTwinId));
        setActiveAssetId(current ? current.asset.id : null);
        const t = window.setTimeout(() => inputRef.current?.focus(), 0);
        return () => {
            window.clearTimeout(t);
            restoreFocusRef.current?.focus?.();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    useEffect(() => {
        if (!open || !active) return;
        const row = listRef.current?.querySelector<HTMLElement>(`[data-asset-id="${active.asset.id}"]`);
        row?.scrollIntoView?.({ block: "nearest" });
    }, [open, active]);

    if (!open) return null;

    const moveAsset = (step: number) => {
        if (!visible.length) return;
        const index = active ? visible.indexOf(active) : -1;
        const next = visible[Math.min(visible.length - 1, Math.max(0, index + step))];
        setActiveAssetId(next.asset.id);
        setActiveTwinIndex(0);
    };

    const openTwin = (entry: SwitcherEntry, twin?: SwitcherTwin) => {
        const chosen = twin || entry.twins[0];
        if (chosen) onOpenTwin(entry, chosen);
    };

    const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
        if (e.key === "Escape") {
            e.preventDefault();
            if (focusTwins) setFocusTwins(false);
            else onClose();
            return;
        }
        if (!active) return;
        if (e.key === "ArrowDown") {
            e.preventDefault();
            if (focusTwins) setActiveTwinIndex((i) => Math.min(active.twins.length - 1, i + 1));
            else moveAsset(1);
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            if (focusTwins) setActiveTwinIndex((i) => Math.max(0, i - 1));
            else moveAsset(-1);
        } else if (e.key === "ArrowRight" && active.twins.length > 1 && !focusTwins) {
            const input = inputRef.current;
            if (input && input.selectionStart !== input.value.length) return;
            e.preventDefault();
            setFocusTwins(true);
            setActiveTwinIndex(0);
        } else if (e.key === "ArrowLeft" && focusTwins) {
            e.preventDefault();
            setFocusTwins(false);
        } else if (e.key === "Enter") {
            e.preventDefault();
            openTwin(active, focusTwins ? active.twins[activeTwinIndex] : undefined);
        }
    };

    const assetSub = (entry: SwitcherEntry) =>
        [entry.asset.assetType, entry.group?.acronym || entry.group?.name].filter(Boolean).join(" · ");

    const twinsList = (entry: SwitcherEntry, highlight: boolean) =>
        entry.twins.map((twin, index) => {
            const isActive = highlight && focusTwins && index === activeTwinIndex;
            return (
                <TwinButton
                    key={twin.digitalTwin.id}
                    type="button"
                    $active={isActive}
                    aria-current={twin.digitalTwin.id === currentDigitalTwinId ? "true" : undefined}
                    onClick={(e) => {
                        e.stopPropagation();
                        openTwin(entry, twin);
                    }}
                >
                    <RowText>
                        <RowTitle style={{ fontWeight: 500 }}>{twin.digitalTwin.description}</RowTitle>
                        <RowSub>
                            {[twinTypeLabel(twin.digitalTwin.type), timeAgo(twin.lastUsedAt, clock)]
                                .filter(Boolean)
                                .join(" · ")}
                        </RowSub>
                    </RowText>
                    {twin.digitalTwin.id === currentDigitalTwinId ? (
                        <CurrentTag>Open</CurrentTag>
                    ) : (
                        <ChevronRight size={16} aria-hidden="true" />
                    )}
                </TwinButton>
            );
        });

    const dialog = (
        <Backdrop
            onMouseDown={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <Dialog role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={onKeyDown}>
                <h2 id={titleId} style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
                    Go to an asset
                </h2>
                <SearchRow>
                    <Search size={18} aria-hidden="true" />
                    <SearchInput
                        ref={inputRef}
                        role="combobox"
                        aria-expanded="true"
                        aria-controls={listId}
                        aria-activedescendant={active ? `${listId}-${active.asset.id}` : undefined}
                        aria-label="Search assets and digital twins"
                        placeholder="Search assets, digital twins, groups…"
                        value={query}
                        onChange={(e) => {
                            setQuery(e.target.value);
                            setActiveAssetId(null);
                            setFocusTwins(false);
                        }}
                    />
                    <Kbd>Esc</Kbd>
                    <IconButton type="button" aria-label="Close" onClick={onClose}>
                        <X size={18} aria-hidden="true" />
                    </IconButton>
                </SearchRow>
                <FilterRow role="group" aria-label="Filter">
                    {FILTERS.map((f) => (
                        <Chip
                            key={f.id}
                            type="button"
                            $on={filter === f.id}
                            aria-pressed={filter === f.id}
                            onClick={() => {
                                setFilter(f.id);
                                setActiveAssetId(null);
                                setFocusTwins(false);
                                inputRef.current?.focus();
                            }}
                        >
                            {f.id === "alarms" && <Led $status="alerting" aria-hidden="true" style={{ width: 7, height: 7 }} />}
                            {f.label}
                            {f.id === "alarms" && alarms > 0 ? ` (${alarms})` : ""}
                        </Chip>
                    ))}
                </FilterRow>
                <Body>
                    <List ref={listRef} id={listId} role="listbox" aria-label="Assets">
                        {sections.length === 0 && (
                            <Empty>
                                {filter === "recent"
                                    ? "No digital twin opened yet."
                                    : filter === "alarms"
                                      ? "No asset with alarms."
                                      : "No asset matches the search."}
                            </Empty>
                        )}
                        {sections.map((section) => (
                            <div key={section.place} role="group" aria-label={section.place}>
                                <SectionTitle aria-hidden="true">{section.place}</SectionTitle>
                                {section.entries.map((entry) => {
                                    const isActive = active?.asset.id === entry.asset.id;
                                    const isCurrent = entry.twins.some((t) => t.digitalTwin.id === currentDigitalTwinId);
                                    return (
                                        <div key={entry.asset.id}>
                                            <Row
                                                id={`${listId}-${entry.asset.id}`}
                                                data-asset-id={entry.asset.id}
                                                role="option"
                                                aria-selected={isActive}
                                                aria-label={`${entry.asset.description}, ${STATUS_TEXT[entry.status]}`}
                                                $active={isActive && !focusTwins}
                                                onMouseMove={() => {
                                                    if (!isActive) {
                                                        setActiveAssetId(entry.asset.id);
                                                        setFocusTwins(false);
                                                    }
                                                }}
                                                onClick={() => {
                                                    const phone = window.matchMedia?.(`(max-width: ${PHONE_WIDTH}px)`).matches;
                                                    if (phone && entry.twins.length > 1 && !isActive) {
                                                        setActiveAssetId(entry.asset.id);
                                                        return;
                                                    }
                                                    openTwin(entry);
                                                }}
                                            >
                                                <Led $status={entry.status} title={STATUS_TEXT[entry.status]} />
                                                <RowText>
                                                    <RowTitle>{entry.asset.description || entry.asset.assetUid}</RowTitle>
                                                    <RowSub>{assetSub(entry)}</RowSub>
                                                </RowText>
                                                {isCurrent && <CurrentTag>Open</CurrentTag>}
                                                <Meta>
                                                    {entry.twins.length === 0
                                                        ? "No twins"
                                                        : entry.twins.length === 1
                                                          ? "1 twin"
                                                          : `${entry.twins.length} twins`}
                                                </Meta>
                                            </Row>
                                            {isActive && entry.twins.length > 1 && (
                                                <InlineTwins>{twinsList(entry, false)}</InlineTwins>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        ))}
                    </List>
                    <Side aria-label="Digital twins of the asset">
                        {active ? (
                            <>
                                <div>
                                    <SideTitle>{active.asset.description || active.asset.assetUid}</SideTitle>
                                    <SideSub>
                                        {active.place}
                                        {active.org ? ` · ${active.org.acronym || active.org.name}` : ""}
                                        <br />
                                        Status: {STATUS_TEXT[active.status]}
                                    </SideSub>
                                </div>
                                {active.twins.length === 0 ? (
                                    <SideSub>This asset has no digital twin.</SideSub>
                                ) : (
                                    twinsList(active, true)
                                )}
                            </>
                        ) : (
                            <SideSub>Pick an asset to see its digital twins.</SideSub>
                        )}
                    </Side>
                </Body>
                <Footer aria-hidden="true">
                    <span>
                        <Kbd>↑</Kbd> <Kbd>↓</Kbd> move
                    </span>
                    <span>
                        <Kbd>→</Kbd> twins
                    </span>
                    <span>
                        <Kbd>Enter</Kbd> open (last used twin)
                    </span>
                    <span style={{ marginLeft: "auto" }}>
                        <Kbd>Ctrl</Kbd> <Kbd>K</Kbd> anywhere
                    </span>
                </Footer>
            </Dialog>
        </Backdrop>
    );

    return createPortal(dialog, document.body);
};

export default AssetSwitcher;
