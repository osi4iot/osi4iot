// The Viewer page's buttons in the top bar: "Edit layout", for those who are not group administrators
// "Group layout" while they have their own changes, and the viewer configuration (.json): download it, and for
// group administrators load one.
import { FC, useEffect, useRef, useState } from "react";
import styled from "styled-components";
import { Download, FileJson, LayoutDashboard, RotateCcw, Upload, Volume2, VolumeX } from "lucide-react";

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
    // the viewer configuration: download it (a .zip with the images of its Picture panels, when it has some);
    // load a file, .json or .zip (group administrators)
    onDownloadConfig?: () => void;
    downloadImages?: number;
    onLoadConfig?: (file: File) => void;
}

const ConfigMenu: FC<Pick<WorkspaceControlsProps, "canSave" | "onDownloadConfig" | "downloadImages" | "onLoadConfig">> = ({
    canSave,
    onDownloadConfig,
    downloadImages = 0,
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
                                {downloadImages > 0 ? "Download (.zip)" : "Download (.json)"}
                                <small>
                                    {downloadImages > 0
                                        ? `The layout, the lighting and ${downloadImages === 1 ? "its image" : `its ${downloadImages} images`}`
                                        : "The layout and the lighting shown"}
                                </small>
                            </span>
                        </button>
                    )}
                    {onLoadConfig && canSave && (
                        <button type="button" role="menuitem" onClick={() => fileRef.current?.click()}>
                            <Upload aria-hidden="true" />
                            <span>
                                Load a file…
                                <small>A .json, or a .zip with its images: to edit it, then save it for the group</small>
                            </span>
                        </button>
                    )}
                </Menu>
            )}
            <input
                ref={fileRef}
                type="file"
                accept=".json,application/json,.zip,application/zip"
                hidden
                data-testid="viewer-config-file"
                onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file || !onLoadConfig) return;
                    setOpen(false);
                    onLoadConfig(file);
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
    downloadImages,
    onLoadConfig,
}) => {
    if (!visible) return null;
    return (
        <Wrap>
            <ConfigMenu canSave={canSave} onDownloadConfig={onDownloadConfig} downloadImages={downloadImages} onLoadConfig={onLoadConfig} />
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

// The sound of the viewer (sounds the pipeline asks for, e.g. access granted or denied): on or muted, always in
// sight while the twin can send sounds.
const SoundButton = styled(Button)<{ $on: boolean }>`
    ${({ $on }) => ($on ? "border-color: #3d82f0; color: #ffffff; background: rgba(61, 130, 240, 0.18);" : "")}
`;

export const SoundToggle: FC<{ visible: boolean; enabled: boolean; onToggle: () => void }> = ({ visible, enabled, onToggle }) => {
    if (!visible) return null;
    return (
        <SoundButton
            type="button"
            $on={enabled}
            aria-pressed={enabled}
            aria-label={enabled ? "Sound on: mute the viewer" : "Sound muted: turn it on"}
            title={enabled ? "Sound on · click to mute" : "Sound muted · click to hear the sounds of the twin"}
            onClick={onToggle}
        >
            {enabled ? <Volume2 aria-hidden="true" /> : <VolumeX aria-hidden="true" />}
            <span>{enabled ? "Sound on" : "Muted"}</span>
        </SoundButton>
    );
};

export default WorkspaceControls;
