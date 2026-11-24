// A 3D Model panel whose slide has no model yet (each slide has its own: Main/slideModel.ts), or whose model is
// being read. The group's editors and administrators load the model here (.glb or .gltf); its FEM results then in
// the Files tab of the model's settings.
import { FC } from "react";
import styled, { keyframes } from "styled-components";
import { Box, Loader2, Upload } from "lucide-react";
import { focusRing, panelColors as c } from "../AssistantPanel/controls";

const spin = keyframes`
    to { transform: rotate(360deg); }
`;

const Wrap = styled.div`
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 16px;
    text-align: center;
    color: ${c.textMuted};
    font: 13px Roboto, "Helvetica Neue", Arial, sans-serif;

    > svg {
        width: 34px;
        height: 34px;
        color: ${c.textDisabled};
    }
    p {
        margin: 0;
        max-width: 360px;
    }
`;

const Spinner = styled(Loader2)`
    animation: ${spin} 1s linear infinite;
`;

const Problem = styled.p`
    color: ${c.danger};
`;

const Button = styled.button`
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 34px;
    padding: 0 14px;
    border-radius: 8px;
    border: 1px solid transparent;
    background-color: ${c.accentStrong};
    color: #ffffff;
    font: 500 13px Roboto, "Helvetica Neue", Arial, sans-serif;
    cursor: pointer;
    ${focusRing}

    &:hover:not(:disabled) {
        background-color: ${c.accentHover};
    }
    &:disabled {
        opacity: 0.5;
        cursor: default;
    }
    svg {
        width: 15px;
        height: 15px;
    }
`;

export interface EmptyModelPanelProps {
    // the model is being read: the fraction of its download
    loading?: number | null;
    error?: string | null;
    // something of the viewer data is being loaded (its text)
    busy?: string | null;
    // the group's editors and administrators: load the slide's model
    onLoad?: () => void;
    // the layout is being edited: the model is loaded once the slide is saved
    editing?: boolean;
}

const EmptyModelPanel: FC<EmptyModelPanelProps> = ({ loading = null, error = null, busy = null, onLoad, editing = false }) => {
    if (loading !== null) {
        return (
            <Wrap role="status" data-testid="empty-model-panel">
                <Spinner aria-hidden="true" />
                <p>Loading the 3D model… {Math.round(loading * 100)}%</p>
            </Wrap>
        );
    }
    return (
        <Wrap data-testid="empty-model-panel">
            <Box aria-hidden="true" />
            {error ? <Problem role="alert">{error}</Problem> : <p>This slide has no 3D model yet.</p>}
            {editing ? (
                <p>Save the slide, then load its 3D model here.</p>
            ) : onLoad ? (
                <>
                    <Button type="button" onClick={onLoad} disabled={!!busy}>
                        {busy ? <Spinner aria-hidden="true" /> : <Upload aria-hidden="true" />}
                        {busy ?? "Load 3D model"}
                    </Button>
                    <p>A .glb or .gltf file. Its FEM results are loaded afterwards in the Files tab of the model's settings.</p>
                </>
            ) : null}
        </Wrap>
    );
};

export default EmptyModelPanel;
