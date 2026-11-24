// Before saving a layout that no longer has some slides, or their 3D Model panels: their models and FEM results are
// removed from the twin's files (slideModelFiles.ts). The editor confirms it, or goes back.
import { FC, useEffect, useRef } from "react";
import styled from "styled-components";
import { AlertTriangle, X } from "lucide-react";
import { LostModel, describeLostModel } from "./slideModelFiles";

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
    width: 480px;
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
        color: #ff7383;
    }
    p {
        margin: 12px 0 0;
        font-size: 14px;
        line-height: 1.45;
        color: #c7cbd1;
    }
    ul {
        margin: 10px 0 0;
        padding-left: 20px;
        font-size: 14px;
        line-height: 1.5;
        color: #e6e8eb;
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

const Danger = styled.button`
    background: #e02f44;
    border: 1px solid #e02f44;
    color: #fff;
`;

export interface ModelRemovalDialogProps {
    lost: LostModel[];
    onConfirm: () => void;
    onCancel: () => void;
}

const ModelRemovalDialog: FC<ModelRemovalDialogProps> = ({ lost, onConfirm, onCancel }) => {
    const cancelRef = useRef<HTMLButtonElement>(null);
    useEffect(() => {
        cancelRef.current?.focus();
    }, []);
    return (
        <Backdrop
            onMouseDown={(e) => {
                if (e.target === e.currentTarget) onCancel();
            }}
        >
            <Box
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="model-removal-title"
                aria-describedby="model-removal-text"
                onKeyDown={(e) => {
                    if (e.key === "Escape") onCancel();
                }}
            >
                <Head>
                    <h2 id="model-removal-title">
                        <AlertTriangle aria-hidden="true" />
                        Remove 3D models
                    </h2>
                    <Close type="button" aria-label="Close" onClick={onCancel}>
                        <X aria-hidden="true" />
                    </Close>
                </Head>
                <p id="model-removal-text">
                    Saving removes the files of the {lost.length === 1 ? "slide" : "slides"} that no longer {lost.length === 1 ? "has" : "have"} a
                    3D Model panel. This cannot be undone.
                </p>
                <ul>
                    {lost.map((l) => (
                        <li key={l.slideId}>{describeLostModel(l)}</li>
                    ))}
                </ul>
                <Actions>
                    <Secondary ref={cancelRef} type="button" onClick={onCancel}>
                        Go back
                    </Secondary>
                    <Danger type="button" onClick={onConfirm}>
                        Save and remove
                    </Danger>
                </Actions>
            </Box>
        </Backdrop>
    );
};

export default ModelRemovalDialog;
