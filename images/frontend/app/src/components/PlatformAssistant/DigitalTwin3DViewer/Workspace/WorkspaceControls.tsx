// The Viewer page's buttons in the top bar: "Edit layout", for those who are not group administrators
// "Group layout" while they have their own changes, and the viewer configuration (.json): download it, and for
// group administrators load one.
import { FC, useEffect, useRef, useState } from "react";
import styled from "styled-components";
import { Download, FileJson, LayoutDashboard, RotateCcw, Upload } from "lucide-react";

const Wrap = styled.div`
    display: flex;
    align-items: center;
    gap: 6px;
    margin-right: 6px;
`;

const Button = styled.button`
    height: 34px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0 10px;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.04);
    color: #d5d9de;
    font: 500 13px Roboto, "Helvetica Neue", Arial, sans-serif;
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
    min-width: 250px;
    padding: 6px;
    background: #16181c;
    border: 1px solid #2c3137;
    border-radius: 10px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45);

    button {
        width: 100%;
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 10px;
        background: transparent;
        border: none;
        border-radius: 7px;
        color: #e6e8eb;
        font: 400 14px Roboto, "Helvetica Neue", Arial, sans-serif;
        text-align: left;
        cursor: pointer;
    }
    button:hover,
    button:focus-visible {
        background: #23272d;
        outline: none;
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
`;

interface WorkspaceControlsProps {
    visible: boolean;
    canSave: boolean;
    origin: "local" | "group" | "automatic";
    onEdit: () => void;
    onRestore: () => void;
    // the viewer configuration: download it; load a file (group administrators)
    onDownloadConfig?: () => void;
    onLoadConfig?: (fileName: string, text: string) => void;
}

const ConfigMenu: FC<Pick<WorkspaceControlsProps, "canSave" | "onDownloadConfig" | "onLoadConfig">> = ({
    canSave,
    onDownloadConfig,
    onLoadConfig,
}) => {
    const [open, setOpen] = useState(false);
    const wrapRef = useRef<HTMLDivElement>(null);
    const fileRef = useRef<HTMLInputElement>(null);
    useEffect(() => {
        if (!open) return;
        const away = (e: MouseEvent) => {
            if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener("mousedown", away);
        return () => document.removeEventListener("mousedown", away);
    }, [open]);
    if (!onDownloadConfig && !onLoadConfig) return null;
    return (
        <MenuWrap
            ref={wrapRef}
            onKeyDown={(e) => {
                if (e.key === "Escape") setOpen(false);
            }}
        >
            <Button
                type="button"
                aria-label="Viewer configuration"
                title="Viewer configuration (.json): layout and lighting"
                aria-haspopup="menu"
                aria-expanded={open}
                onClick={() => setOpen((o) => !o)}
            >
                <FileJson aria-hidden="true" />
                <span>Configuration</span>
            </Button>
            {open && (
                <Menu role="menu" aria-label="Viewer configuration">
                    {onDownloadConfig && (
                        <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                                setOpen(false);
                                onDownloadConfig();
                            }}
                        >
                            <Download aria-hidden="true" />
                            <span>
                                Download (.json)
                                <small>The layout and the lighting shown</small>
                            </span>
                        </button>
                    )}
                    {onLoadConfig && canSave && (
                        <button type="button" role="menuitem" onClick={() => fileRef.current?.click()}>
                            <Upload aria-hidden="true" />
                            <span>
                                Load a file…
                                <small>To edit it, then save it for the group</small>
                            </span>
                        </button>
                    )}
                </Menu>
            )}
            <input
                ref={fileRef}
                type="file"
                accept=".json,application/json"
                hidden
                data-testid="viewer-config-file"
                onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file || !onLoadConfig) return;
                    setOpen(false);
                    file.text().then((text) => onLoadConfig(file.name, text));
                }}
            />
        </MenuWrap>
    );
};

const WorkspaceControls: FC<WorkspaceControlsProps> = ({
    visible,
    canSave,
    origin,
    onEdit,
    onRestore,
    onDownloadConfig,
    onLoadConfig,
}) => {
    if (!visible) return null;
    return (
        <Wrap>
            <ConfigMenu canSave={canSave} onDownloadConfig={onDownloadConfig} onLoadConfig={onLoadConfig} />
            {!canSave && origin === "local" && (
                <Button type="button" onClick={onRestore} aria-label="Back to the group layout" title="Back to the group layout">
                    <RotateCcw aria-hidden="true" />
                    <span>Group layout</span>
                </Button>
            )}
            <Button
                type="button"
                onClick={onEdit}
                aria-label="Edit layout"
                title={canSave ? "Arrange the panels for the whole group" : "Arrange the panels (only for you)"}
            >
                <LayoutDashboard aria-hidden="true" />
                <span>Edit layout</span>
            </Button>
        </Wrap>
    );
};

export default WorkspaceControls;
