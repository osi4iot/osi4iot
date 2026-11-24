// What some files bring to the twin's Viewer data (viewerData.ts), to choose what to load: each part with its file,
// what it is and what loading it does; what was left out and why. While loading, how far each part went.
import { FC, useId, useMemo, useState } from "react";
import styled from "styled-components";
import { Check, Database, Loader2, X } from "lucide-react";
import { scrollbarStyle } from "../../../Tools/FormTools";
import { PART_EFFECTS, PART_LABELS, ViewerDataItem, ViewerDataSet } from "./viewerData";

const font = `Roboto, "Helvetica Neue", Arial, sans-serif`;

const Backdrop = styled.div`
    position: fixed;
    inset: 0;
    z-index: 3000;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.55);
    padding: 16px;
`;

const Dialog = styled.div`
    width: min(620px, 100%);
    max-height: calc(100vh - 32px);
    display: flex;
    flex-direction: column;
    background: #16181c;
    border: 1px solid #2c3137;
    border-radius: 12px;
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
    color: #e6e8eb;
    font: 400 14px ${font};
`;

const Head = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 14px 16px;
    border-bottom: 1px solid #2c3137;

    h2 {
        margin: 0;
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 16px;
        font-weight: 500;
    }
    svg {
        width: 18px;
        height: 18px;
    }
`;

const Close = styled.button`
    width: 34px;
    height: 34px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid #2c3137;
    border-radius: 8px;
    background: transparent;
    color: #c7cbd1;
    cursor: pointer;

    &:disabled {
        opacity: 0.4;
        cursor: not-allowed;
    }
`;

const Body = styled.div`
    min-height: 0;
    overflow-y: auto;
    padding: 12px 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    ${scrollbarStyle}

    .muted {
        color: #9aa1aa;
        font-size: 12px;
        margin: 0;
    }
`;

const Item = styled.label<{ $off: boolean }>`
    display: grid;
    grid-template-columns: 20px minmax(0, 1fr) auto;
    gap: 10px;
    align-items: start;
    padding: 10px 12px;
    border: 1px solid #2c3137;
    border-radius: 8px;
    background: ${({ $off }) => ($off ? "transparent" : "#1b1e22")};
    opacity: ${({ $off }) => ($off ? 0.6 : 1)};
    cursor: pointer;

    input {
        margin-top: 3px;
        width: 16px;
        height: 16px;
    }
    .part {
        font-weight: 500;
    }
    .file {
        color: #c7d0d9;
        font-size: 12px;
        word-break: break-all;
    }
    .effect {
        color: #9aa1aa;
        font-size: 12px;
    }
    .state {
        font-size: 12px;
        color: #9aa1aa;
        white-space: nowrap;
        display: inline-flex;
        align-items: center;
        gap: 4px;
    }
    .state svg {
        width: 14px;
        height: 14px;
    }
    .spin {
        animation: viewer-data-load-spin 1s linear infinite;
    }
    @keyframes viewer-data-load-spin {
        to {
            transform: rotate(360deg);
        }
    }
`;

const Ignored = styled.ul`
    margin: 0;
    padding-left: 18px;
    color: #ffb35c;
    font-size: 12px;
`;

const Actions = styled.div`
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 12px 16px;
    border-top: 1px solid #2c3137;

    button {
        height: 34px;
        padding: 0 16px;
        border-radius: 8px;
        font: 500 13px ${font};
        cursor: pointer;
    }
    button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
    .secondary {
        background: transparent;
        border: 1px solid #2c3137;
        color: #d5d9de;
    }
    .primary {
        background: #3274d9;
        border: 1px solid #3274d9;
        color: #ffffff;
    }
`;

export type ItemState = { status: "waiting" | "loading" | "done" | "failed"; fraction?: number };

export interface ViewerDataLoadDialogProps {
    set: ViewerDataSet;
    // where the files came from ("viewer_data.zip", "3 files")
    source: string;
    // while loading: the state of each item (by its index in set.items)
    states?: ItemState[] | null;
    onLoad: (items: ViewerDataItem[]) => void;
    onClose: () => void;
}

export const ViewerDataLoadDialog: FC<ViewerDataLoadDialogProps> = ({ set, source, states = null, onLoad, onClose }) => {
    const titleId = useId();
    const [chosen, setChosen] = useState<boolean[]>(() => set.items.map(() => true));
    const running = !!states && states.some((s) => s.status === "waiting" || s.status === "loading");
    const finished = !!states && !running;
    const selected = useMemo(() => set.items.filter((_, i) => chosen[i]), [set.items, chosen]);

    const stateOf = (i: number) => {
        const state = states?.[i];
        if (!state || !chosen[i]) return null;
        if (state.status === "loading")
            return (
                <span className="state">
                    <Loader2 className="spin" aria-hidden="true" />
                    {state.fraction !== undefined && state.fraction > 0 ? `${Math.round(state.fraction * 100)}%` : "Loading…"}
                </span>
            );
        if (state.status === "done")
            return (
                <span className="state" style={{ color: "#8fd48a" }}>
                    <Check aria-hidden="true" />
                    Loaded
                </span>
            );
        if (state.status === "failed")
            return (
                <span className="state" style={{ color: "#ff8a95" }}>
                    <X aria-hidden="true" />
                    Failed
                </span>
            );
        return <span className="state">Waiting</span>;
    };

    return (
        <Backdrop>
            <Dialog
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                onKeyDown={(e) => {
                    if (e.key === "Escape" && !running) onClose();
                }}
            >
                <Head>
                    <h2 id={titleId}>
                        <Database aria-hidden="true" />
                        Load viewer data
                    </h2>
                    <Close type="button" aria-label="Close" disabled={running} onClick={onClose}>
                        <X aria-hidden="true" />
                    </Close>
                </Head>
                <Body>
                    <p className="muted">
                        {set.items.length === 0
                            ? `Nothing to load in ${source}.`
                            : `${source} brings ${set.items.length === 1 ? "this part" : "these parts"}. Untick what you do not want to load.`}
                    </p>
                    {set.items.map((item, i) => (
                        <Item key={`${item.part}-${item.file.name}-${i}`} $off={!chosen[i]}>
                            <input
                                type="checkbox"
                                checked={chosen[i]}
                                disabled={!!states}
                                aria-label={`Load ${PART_LABELS[item.part]}: ${item.file.name}`}
                                onChange={(e) => setChosen((c) => c.map((v, j) => (j === i ? e.target.checked : v)))}
                            />
                            <div>
                                <div className="part">{PART_LABELS[item.part]}</div>
                                <div className="file">
                                    {item.file.name} · {item.summary}
                                    {item.slideId ? ` · slide ${item.slideId}` : ""}
                                </div>
                                <div className="effect">{PART_EFFECTS[item.part]}</div>
                            </div>
                            {stateOf(i)}
                        </Item>
                    ))}
                    {set.ignored.length > 0 && (
                        <>
                            <p className="muted">Left out:</p>
                            <Ignored>
                                {set.ignored.map((reason) => (
                                    <li key={reason}>{reason}</li>
                                ))}
                            </Ignored>
                        </>
                    )}
                </Body>
                <Actions>
                    {finished ? (
                        <button type="button" className="primary" onClick={onClose}>
                            Close
                        </button>
                    ) : (
                        <>
                            <button type="button" className="secondary" disabled={running} onClick={onClose}>
                                Cancel
                            </button>
                            <button type="button" className="primary" disabled={running || selected.length === 0} onClick={() => onLoad(selected)}>
                                {running ? "Loading…" : `Load ${selected.length === 1 ? "1 part" : `${selected.length} parts`}`}
                            </button>
                        </>
                    )}
                </Actions>
            </Dialog>
        </Backdrop>
    );
};

export default ViewerDataLoadDialog;
