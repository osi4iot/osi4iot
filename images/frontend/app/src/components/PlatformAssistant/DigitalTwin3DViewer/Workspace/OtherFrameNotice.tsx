// A 3D Model or Simulator panel of a frame of a canvas other than the one shown: each frame has its own model and
// simulator, and only those of the frame shown (its step) are in use. Its state is kept: shown again, they have it.
import { FC } from "react";
import styled from "styled-components";
import { Box, SlidersHorizontal } from "lucide-react";
import { panelColors as c } from "../AssistantPanel/controls";

const Wrap = styled.div`
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 16px;
    text-align: center;
    color: ${c.textMuted};
    font:
        13px Roboto,
        "Helvetica Neue",
        Arial,
        sans-serif;

    > svg {
        width: 30px;
        height: 30px;
        color: ${c.textDisabled};
    }
    p {
        margin: 0;
        max-width: 320px;
    }
`;

export const OtherFrameNotice: FC<{ kind: "model" | "simulator" }> = ({ kind }) => (
    <Wrap data-testid={`other-frame-${kind}`}>
        {kind === "model" ? <Box aria-hidden="true" /> : <SlidersHorizontal aria-hidden="true" />}
        <p>{kind === "model" ? "The 3D model of this frame" : "The simulator of this frame"}: in use when its frame is the step shown (◀ ▶).</p>
    </Wrap>
);
