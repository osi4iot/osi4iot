// The 3D model in a panel. The model is rendered once, with a portal, in a host element of its own; the model
// panel of the slide shown moves that element in here. Changing the slide (or the layout) moves the canvas
// instead of unmounting it: the scene is not loaded again, and several slides can show the model.
import { FC, useLayoutEffect, useRef } from "react";

// Where the 3D model goes in its panel: the host element (rendered once, with a portal) is moved in here
const ModelSlot: FC<{ host: HTMLDivElement }> = ({ host }) => {
    const ref = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
        const slot = ref.current;
        if (!slot) return;
        slot.appendChild(host);
        return () => {
            if (host.parentNode === slot) slot.removeChild(host);
        };
    }, [host]);
    return <div ref={ref} style={{ position: "absolute", inset: 0 }} />;
};

// The host element of the model: positioned to fill the panel it is moved into
export const createModelHost = (): HTMLDivElement => {
    const host = document.createElement("div");
    host.style.position = "absolute";
    host.style.inset = "0";
    return host;
};

export default ModelSlot;
