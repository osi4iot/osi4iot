// What a viewer configuration file brings, before loading it in the Viewer: its layout and lighting, and what was
// left out or may not work in this twin. Loading it starts editing the layout (with the file's) and shows its
// lighting; "Save for the group" saves both, Cancel leaves both as they were.
import { FC, useEffect, useRef } from "react";
import styled from "styled-components";
import { AlertTriangle, FileJson, X } from "lucide-react";
import { ParsedViewerConfig, describeViewerConfig } from "./viewerConfig";

const font = `Roboto, "Helvetica Neue", Arial, sans-serif`;

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

const Box = styled.div`
    width: 520px;
    max-width: 100%;
    max-height: calc(100vh - 32px);
    overflow-y: auto;
    box-sizing: border-box;
    padding: 20px;
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
    p {
        margin: 10px 0 0;
        font-size: 14px;
        line-height: 1.45;
        color: #c7cbd1;
    }
    .file {
        color: #9aa1aa;
        font-size: 13px;
        word-break: break-all;
    }
    .error {
        color: #ff7383;
    }
`;

const Head = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
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

const Warnings = styled.ul`
    margin: 14px 0 0;
    padding: 10px 12px 10px 30px;
    background: rgba(242, 204, 12, 0.07);
    border: 1px solid rgba(242, 204, 12, 0.3);
    border-radius: 10px;
    font-size: 13px;
    line-height: 1.45;
    color: #e8dca0;

    li + li {
        margin-top: 4px;
    }
`;

const WarnTitle = styled.p`
    display: flex;
    align-items: center;
    gap: 6px;

    && {
        margin-top: 14px;
        color: #f2cc0c;
        font-weight: 500;
    }
    svg {
        width: 15px;
        height: 15px;
    }
`;

const Actions = styled.div`
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 20px;

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

export interface ViewerConfigDialogProps {
    fileName: string;
    result: ParsedViewerConfig | { error: string };
    // what the layout names that this twin does not have
    refWarnings: string[];
    onLoad: () => void;
    onClose: () => void;
}

const ViewerConfigDialog: FC<ViewerConfigDialogProps> = ({ fileName, result, refWarnings, onLoad, onClose }) => {
    const firstRef = useRef<HTMLButtonElement>(null);
    useEffect(() => {
        firstRef.current?.focus();
    }, []);
    const warnings = "error" in result ? [] : [...result.warnings, ...refWarnings];
    return (
        <Backdrop
            onMouseDown={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <Box
                role="dialog"
                aria-modal="true"
                aria-labelledby="viewer-config-title"
                onKeyDown={(e) => {
                    if (e.key === "Escape") onClose();
                }}
            >
                <Head>
                    <h2 id="viewer-config-title">
                        <FileJson aria-hidden="true" />
                        Load viewer configuration
                    </h2>
                    <Close type="button" aria-label="Close" onClick={onClose}>
                        <X aria-hidden="true" />
                    </Close>
                </Head>
                <p className="file">{fileName}</p>
                {"error" in result ? (
                    <p className="error" role="alert">
                        {result.error}
                    </p>
                ) : (
                    <>
                        <p>
                            <strong>{describeViewerConfig(result)}</strong>
                            {result.source?.digitalTwinUid ? ` · from ${result.source.digitalTwinUid}` : ""}
                            {result.exportedAt ? ` · ${result.exportedAt.slice(0, 16).replace("T", " ")} UTC` : ""}
                        </p>
                        <p>
                            {result.layout ? "Its layout opens to edit, " : "The layout stays as it is, "}
                            {result.lighting ? "and its lighting is shown. " : "and the lighting stays as it is. "}
                            <strong>Save for the group</strong> replaces the group&apos;s layout
                            {result.lighting ? " and the twin's lighting" : ""}; <strong>Cancel</strong> leaves them as they were.
                        </p>
                        {warnings.length > 0 && (
                            <>
                                <WarnTitle>
                                    <AlertTriangle aria-hidden="true" />
                                    {warnings.length === 1 ? "1 thing to check" : `${warnings.length} things to check`}
                                </WarnTitle>
                                <Warnings>
                                    {warnings.map((w) => (
                                        <li key={w}>{w}</li>
                                    ))}
                                </Warnings>
                            </>
                        )}
                    </>
                )}
                <Actions>
                    <Secondary ref={"error" in result ? firstRef : undefined} type="button" onClick={onClose}>
                        {"error" in result ? "Close" : "Cancel"}
                    </Secondary>
                    {!("error" in result) && (
                        <Primary ref={firstRef} type="button" onClick={onLoad}>
                            Load
                        </Primary>
                    )}
                </Actions>
            </Box>
        </Backdrop>
    );
};

export default ViewerConfigDialog;
