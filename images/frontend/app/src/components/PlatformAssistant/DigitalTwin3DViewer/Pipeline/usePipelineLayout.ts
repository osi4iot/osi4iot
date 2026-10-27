// Distribución del editor de pipelines:
//  - La paleta de nodos se puede plegar a una columna de iconos. Por defecto se pliega sola cuando el
//    editor es estrecho; si el usuario la pliega o despliega, se respeta su elección.
//  - El lienzo y el panel de propiedades empiezan debajo de la barra del visor (que puede ocupar varias
//    líneas en pantallas estrechas), así ningún nodo queda tapado por ella.
import { RefObject, useEffect, useLayoutEffect, useState } from "react";
import { setUiValue, usePersistentState } from "../../../../state/uiStore";
import { INSPECTOR_GAP } from "../Inspector/Inspector";

export const PALETTE_WIDTH = 190;
export const PALETTE_COLLAPSED_WIDTH = 56;
export const PALETTE_WIDTH_KEY = "pipeline.paletteWidth";
const NARROW_EDITOR = 760;

const findViewerBar = (root: HTMLElement) => {
    for (let el: HTMLElement | null = root.parentElement; el; el = el.parentElement) {
        const bar = el.querySelector<HTMLElement>('[data-testid="viewer-top-bar"]');
        if (bar) return bar;
    }
    return null;
};

export const usePipelineLayout = (rootRef: RefObject<HTMLElement | null>) => {
    const [collapsedPreference, setCollapsedPreference] = usePersistentState<boolean | null>("pipeline.paletteCollapsed", null);
    const [isNarrow, setIsNarrow] = useState(false);
    const [barOffset, setBarOffset] = useState(0);

    useLayoutEffect(() => {
        const root = rootRef.current;
        if (!root) return;
        let bar = findViewerBar(root);
        const measure = () => {
            setIsNarrow(root.clientWidth < NARROW_EDITOR);
            bar = bar?.isConnected ? bar : findViewerBar(root);
            setBarOffset(bar ? Math.ceil(bar.getBoundingClientRect().height) + 2 * INSPECTOR_GAP : 0);
        };
        measure();
        if (typeof ResizeObserver === "undefined") return;
        const observer = new ResizeObserver(measure);
        observer.observe(root);
        if (bar) observer.observe(bar);
        return () => observer.disconnect();
    }, [rootRef]);

    const collapsed = collapsedPreference ?? isNarrow;
    const paletteWidth = collapsed ? PALETTE_COLLAPSED_WIDTH : PALETTE_WIDTH;

    // la barra del visor empieza a la derecha de la paleta
    useEffect(() => {
        setUiValue(PALETTE_WIDTH_KEY, paletteWidth);
    }, [paletteWidth]);

    return {
        paletteCollapsed: collapsed,
        togglePalette: () => setCollapsedPreference(!collapsed),
        paletteWidth,
        barOffset,
    };
};
