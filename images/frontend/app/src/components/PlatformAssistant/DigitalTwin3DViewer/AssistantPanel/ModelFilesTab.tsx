// The "Files" tab of the 3D model settings (AssistantPanel, placement "panel"): the model and its FEM results, for
// the group's editors and administrators. Loading goes through the Viewer data dialog (what each file is, what
// loading it does, how far each upload went); downloading, removing the model and how many FEM results are kept
// are done here.
import { FC, useEffect, useRef, useState } from "react";
import styled from "styled-components";
import { Box, Download, Layers, Loader2, Trash2, Upload } from "lucide-react";
import { SecondaryButton, panelColors as c } from "./controls";

const Block = styled.section`
    margin: 6px 12px 14px;
    padding: 12px;
    border: 1px solid ${c.border};
    border-radius: 10px;

    h3 {
        display: flex;
        align-items: center;
        gap: 8px;
        margin: 0 0 4px;
        font-size: 13px;
        font-weight: 500;
        color: ${c.text};
    }
    h3 svg {
        width: 15px;
        height: 15px;
        color: ${c.textMuted};
    }
    .detail {
        margin: 0 0 10px;
        font-size: 12px;
        color: ${c.textMuted};
        overflow-wrap: anywhere;
    }
    .actions {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(96px, 1fr));
        gap: 6px;
    }
    .danger {
        color: #ff8a95;
        border-color: rgba(242, 73, 92, 0.45);
    }
    .confirm {
        margin: 8px 0 0;
        font-size: 12px;
        color: #ffb3bb;
    }
    .spin {
        animation: model-files-spin 1s linear infinite;
    }
    @keyframes model-files-spin {
        to {
            transform: rotate(360deg);
        }
    }
`;

const Keep = styled.label`
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 10px;
    font-size: 12px;
    color: ${c.textMuted};

    input {
        width: 60px;
        height: 30px;
        padding: 0 6px;
        background: #0b0c0e;
        color: ${c.text};
        border: 1px solid #2c3235;
        border-radius: 6px;
        font:
            400 12px Roboto,
            "Helvetica Neue",
            Arial,
            sans-serif;
    }
    button {
        width: auto;
        height: 30px;
        padding: 0 12px;
    }
`;

const Busy = styled.p`
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 4px 14px 8px;
    font-size: 12px;
    color: ${c.textSecondary};

    svg {
        width: 14px;
        height: 14px;
        animation: model-files-spin 1s linear infinite;
    }
`;

export interface ModelFilesTabProps {
    // the stored model's file name (null: none)
    model: string | null;
    // the stored FEM result files (null: not read yet) and how many are kept
    femCount: number | null;
    femMax: number;
    // what is being loaded or downloaded: the buttons wait
    busy: string | null;
    // the tab was shown: read what the twin has (the FEM results)
    onShow?: () => void;
    // files chosen to load (they go through the Viewer data dialog)
    onLoadFiles: (files: File[]) => void;
    onDownloadModel: () => void;
    onRemoveModel: () => void;
    onDownloadFem: () => void;
    onSetFemMax: (max: number) => void;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export const ModelFilesTab: FC<ModelFilesTabProps> = ({
    model,
    femCount,
    femMax,
    busy,
    onShow,
    onLoadFiles,
    onDownloadModel,
    onRemoveModel,
    onDownloadFem,
    onSetFemMax,
}) => {
    const modelInput = useRef<HTMLInputElement>(null);
    const femInput = useRef<HTMLInputElement>(null);
    const [confirmRemove, setConfirmRemove] = useState(false);
    const [keep, setKeep] = useState(String(femMax));
    useEffect(() => setKeep(String(femMax)), [femMax]);
    useEffect(() => onShow?.(), []);

    const keepValue = Number(keep);
    const keepValid = Number.isInteger(keepValue) && keepValue >= 1 && keepValue <= 100;
    const waiting = !!busy;
    const picked = (input: HTMLInputElement | null) => {
        const files = Array.from(input?.files ?? []);
        if (input) input.value = "";
        if (files.length > 0) onLoadFiles(files);
    };

    return (
        <>
            {busy && (
                <Busy role="status">
                    <Loader2 aria-hidden="true" />
                    {busy}
                </Busy>
            )}
            <Block aria-label="3D model file">
                <h3>
                    <Box aria-hidden="true" />
                    3D model
                </h3>
                <p className="detail">{model ?? "None"}</p>
                <div className="actions">
                    <SecondaryButton
                        type="button"
                        disabled={waiting}
                        onClick={() => modelInput.current?.click()}
                        title="Load a .glb or .gltf file: it replaces the current model"
                    >
                        <Upload aria-hidden="true" />
                        {model ? "Replace" : "Load"}
                    </SecondaryButton>
                    <SecondaryButton
                        type="button"
                        disabled={waiting || !model}
                        onClick={onDownloadModel}
                        aria-label="Download the 3D model"
                    >
                        <Download aria-hidden="true" />
                        Download
                    </SecondaryButton>
                    <SecondaryButton
                        type="button"
                        className="danger"
                        disabled={waiting || !model}
                        aria-label={confirmRemove ? "Confirm: remove the 3D model" : "Remove the 3D model"}
                        onClick={() => {
                            if (!confirmRemove) {
                                setConfirmRemove(true);
                                return;
                            }
                            setConfirmRemove(false);
                            onRemoveModel();
                        }}
                        onBlur={() => setConfirmRemove(false)}
                    >
                        <Trash2 aria-hidden="true" />
                        {confirmRemove ? "Confirm" : "Remove"}
                    </SecondaryButton>
                </div>
                {confirmRemove && (
                    <p className="confirm" role="status">
                        Click again to remove the 3D model. Its FEM results are kept.
                    </p>
                )}
                <input
                    ref={modelInput}
                    type="file"
                    accept=".glb,.gltf"
                    hidden
                    data-testid="model-file"
                    onChange={(e) => picked(e.target)}
                />
            </Block>

            <Block aria-label="FEM results files">
                <h3>
                    <Layers aria-hidden="true" />
                    FEM results
                </h3>
                <p className="detail">{femCount === null ? "…" : femCount === 0 ? "None" : plural(femCount, "file", "files")}</p>
                <div className="actions">
                    <SecondaryButton
                        type="button"
                        disabled={waiting}
                        onClick={() => femInput.current?.click()}
                        title="Load one or more .json files of FEM results"
                    >
                        <Upload aria-hidden="true" />
                        Load
                    </SecondaryButton>
                    <SecondaryButton
                        type="button"
                        disabled={waiting || !femCount}
                        onClick={onDownloadFem}
                        aria-label="Download the FEM results"
                    >
                        <Download aria-hidden="true" />
                        Download
                    </SecondaryButton>
                </div>
                <Keep>
                    Keep the newest
                    <input
                        type="number"
                        min={1}
                        max={100}
                        aria-label="FEM result files kept"
                        value={keep}
                        onChange={(e) => setKeep(e.target.value)}
                    />
                    <SecondaryButton
                        type="button"
                        disabled={!keepValid || keepValue === femMax || waiting}
                        onClick={() => onSetFemMax(keepValue)}
                    >
                        Save
                    </SecondaryButton>
                </Keep>
                <input
                    ref={femInput}
                    type="file"
                    accept=".json,application/json"
                    multiple
                    hidden
                    data-testid="fem-files"
                    onChange={(e) => picked(e.target)}
                />
            </Block>
        </>
    );
};

export default ModelFilesTab;
