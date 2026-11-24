// "Viewer data" in the Viewer's top bar (viewerData.ts): load the .zip of all the twin's Viewer data (or loose parts
// of it) and download all of it. The viewer configuration keeps its own entries (download it; open a file to try it
// before saving it). Each slide's 3D model and its FEM results are managed in its 3D Model panel (load it there, and
// the Files tab of its settings), the pipeline in the Pipeline view, the simulator format in the Simulator panel; the
// .zip carries them all (the model and FEM results of every slide).
// Loading is for the group's editors and administrators; the others only download the configuration.
import { FC, ReactNode, useEffect, useRef, useState } from "react";
import styled from "styled-components";
import { Download, FileCode2, FileText, FileJson, Loader2, Upload } from "lucide-react";
import { scrollbarStyle } from "../../../Tools/FormTools";
import { ViewerDataPart } from "./viewerData";

const font = `Roboto, "Helvetica Neue", Arial, sans-serif`;

export const Button = styled.button`
    height: 34px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0 10px;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.04);
    color: #d5d9de;
    font: 500 13px ${font};
    white-space: nowrap;
    cursor: pointer;

    &:hover {
        border-color: #3d82f0;
    }
    &:focus-visible {
        outline: 2px solid #3d82f0;
        outline-offset: 2px;
    }
    svg {
        width: 15px;
        height: 15px;
        flex: none;
    }
    .spin {
        animation: viewer-data-spin 1s linear infinite;
    }
    @keyframes viewer-data-spin {
        to {
            transform: rotate(360deg);
        }
    }
    @media (max-width: 1100px) {
        span {
            display: none;
        }
    }
`;

const MenuWrap = styled.div`
    position: relative;
`;

const Menu = styled.div`
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    z-index: 1200;
    width: 360px;
    max-height: min(560px, calc(100vh - 140px));
    overflow-y: auto;
    padding: 6px;
    background: #16181c;
    border: 1px solid #2c3137;
    border-radius: 10px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45);
    font: 400 14px ${font};
    color: #e6e8eb;
    ${scrollbarStyle}

    .item {
        width: 100%;
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 10px;
        background: transparent;
        border: none;
        border-radius: 7px;
        color: #e6e8eb;
        font: 400 14px ${font};
        text-align: left;
        cursor: pointer;
    }
    .item:hover,
    .item:focus-visible {
        background: #23272d;
        outline: none;
    }
    .item:disabled {
        opacity: 0.45;
        cursor: not-allowed;
        background: transparent;
    }
    svg {
        width: 15px;
        height: 15px;
        color: #9aa1aa;
        flex: none;
    }
    small {
        display: block;
        color: #9aa1aa;
        font-size: 12px;
    }
    hr {
        border: 0;
        border-top: 1px solid #2c3137;
        margin: 6px 4px;
    }
    .heading {
        padding: 6px 10px 2px;
        color: #9aa1aa;
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.04em;
    }
`;

const PartRow = styled.div`
    display: grid;
    grid-template-columns: 18px minmax(0, 1fr) auto;
    gap: 10px;
    align-items: center;
    padding: 6px 6px 6px 10px;
    border-radius: 7px;

    .name {
        min-width: 0;
    }
    .name small {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    .actions {
        display: flex;
        gap: 4px;
    }
`;

const IconButton = styled.button<{ $danger?: boolean }>`
    width: 32px;
    height: 32px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 7px;
    border: 1px solid #2c3137;
    background: transparent;
    color: ${({ $danger }) => ($danger ? "#ff8a95" : "#c7cbd1")};
    cursor: pointer;

    &:hover:not(:disabled) {
        border-color: ${({ $danger }) => ($danger ? "#f2495c" : "#3d82f0")};
    }
    &:focus-visible {
        outline: 2px solid #3d82f0;
        outline-offset: 1px;
    }
    &:disabled {
        opacity: 0.35;
        cursor: not-allowed;
    }
    svg {
        width: 14px;
        height: 14px;
        color: inherit;
    }
`;

export interface ViewerDataStatus {
    configImages: number;
}

export interface ViewerDataMenuProps {
    canEdit: boolean;
    // what is being loaded or prepared ("Loading 3D model… 40%"): the menu waits
    busy: string | null;
    status: ViewerDataStatus;
    onLoadFiles: () => void;
    onDownloadAll: () => void;
    onDownloadPart: (part: ViewerDataPart) => void;
    // the viewer configuration: open a file to try it (and save it from the Viewer)
    onOpenConfigFile?: (file: File) => void;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export const ViewerDataMenu: FC<ViewerDataMenuProps> = ({
    canEdit,
    busy,
    status,
    onLoadFiles,
    onDownloadAll,
    onDownloadPart,
    onOpenConfigFile,
}) => {
    const [open, setOpen] = useState(false);
    const wrapRef = useRef<HTMLDivElement>(null);
    const configRef = useRef<HTMLInputElement>(null);
    useEffect(() => {
        if (!open) return;
        const away = (e: MouseEvent) => {
            if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener("mousedown", away);
        return () => document.removeEventListener("mousedown", away);
    }, [open]);

    const run = (action: () => void) => {
        setOpen(false);
        action();
    };

    const row = (part: ViewerDataPart, icon: ReactNode, label: string, detail: string, hasData: boolean, extra?: ReactNode) => (
        <PartRow key={part}>
            {icon}
            <div className="name">
                {label}
                <small title={detail}>{detail}</small>
            </div>
            <div className="actions">
                <IconButton
                    type="button"
                    aria-label={`Download the ${label.toLowerCase()}`}
                    title={hasData ? `Download the ${label.toLowerCase()}` : "Nothing to download"}
                    disabled={!hasData || !!busy}
                    onClick={() => run(() => onDownloadPart(part))}
                >
                    <Download aria-hidden="true" />
                </IconButton>
                {extra}
            </div>
        </PartRow>
    );

    return (
        <MenuWrap
            ref={wrapRef}
            onKeyDown={(e) => {
                if (e.key === "Escape") setOpen(false);
            }}
        >
            <Button
                type="button"
                aria-label="Viewer data"
                title={busy ?? "Viewer data: load or download all of it, and the viewer configuration"}
                aria-haspopup="menu"
                aria-expanded={open}
                onClick={() => setOpen((o) => !o)}
            >
                {busy ? <Loader2 className="spin" aria-hidden="true" /> : <FileText aria-hidden="true" />}
                {/* an icon (its tooltip names it); the progress of a load or download is shown beside it */}
                {busy && <span>{busy}</span>}
            </Button>
            {open && (
                <Menu role="menu" aria-label="Viewer data">
                    {canEdit && (
                        <>
                            <button type="button" role="menuitem" className="item" disabled={!!busy} onClick={() => run(onLoadFiles)}>
                                <Upload aria-hidden="true" />
                                <span>
                                    Load files…
                                    <small>The .zip of all the viewer data, or a configuration (3D models are loaded in their slide's 3D Model panel)</small>
                                </span>
                            </button>
                            <button type="button" role="menuitem" className="item" disabled={!!busy} onClick={() => run(onDownloadAll)}>
                                <Download aria-hidden="true" />
                                <span>
                                    Download all (.zip)
                                    <small>
                                        Configuration, the 3D model and FEM results of every slide, simulator format and pipeline, to load
                                        in this or another digital twin
                                    </small>
                                </span>
                            </button>
                            <hr />
                        </>
                    )}
                    {row(
                        "config",
                        <FileJson aria-hidden="true" />,
                        "Viewer configuration",
                        status.configImages > 0
                            ? `Layout and lighting, ${plural(status.configImages, "image", "images")} (.zip)`
                            : "Layout and lighting (.json)",
                        true,
                        onOpenConfigFile && canEdit ? (
                            <IconButton
                                type="button"
                                aria-label="Open a configuration file to try it"
                                title="Open a configuration file (.json or .zip) to try it, then save it for the group"
                                disabled={!!busy}
                                onClick={() => configRef.current?.click()}
                            >
                                <Upload aria-hidden="true" />
                            </IconButton>
                        ) : undefined,
                    )}
                    {!canEdit && (
                        <PartRow as="div">
                            <FileCode2 aria-hidden="true" />
                            <small style={{ gridColumn: "2 / 4" }}>
                                The other parts are for the editors and administrators of the group.
                            </small>
                        </PartRow>
                    )}
                </Menu>
            )}
            <input
                ref={configRef}
                type="file"
                accept=".json,application/json,.zip,application/zip"
                hidden
                data-testid="viewer-config-file"
                onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file || !onOpenConfigFile) return;
                    setOpen(false);
                    onOpenConfigFile(file);
                }}
            />
        </MenuWrap>
    );
};

export default ViewerDataMenu;
