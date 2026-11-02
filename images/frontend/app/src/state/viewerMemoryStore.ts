// Memoria del visor de cada gemelo digital mientras sigue abierto (Zustand, solo en memoria): vista activa,
// opciones del panel, cambios del pipeline sin desplegar, logs, cámara 3D, paneles abiertos y, en el editor
// de pipelines, el desplazamiento del lienzo y el nodo abierto. Si el visor se desmonta (cambio de capa,
// recarga de datos) y se vuelve a montar, recupera todo esto. Se borra al cerrar el visor.
import { create } from "zustand";

// Cámara del visor 3D: posición, punto al que mira (el de los controles de órbita) y zoom (ortográfica)
export interface CameraView {
    position: [number, number, number];
    target: [number, number, number];
    zoom: number;
    // lado menor del lienzo cuando se guardó: con otro tamaño el zoom se escala para ver lo mismo
    viewSize: number;
}

// Nodo del pipeline con el panel de propiedades abierto, con lo que el usuario llevaba escrito sin aplicar
export interface OpenNodePanel {
    nodeId: string;
    activeTab?: string;
    width?: number;
    formData?: Record<string, unknown>;
}

export interface ViewerMemory {
    activeViewer?: "3D" | "pipeline" | "image_frame";
    opts?: unknown;
    pipeline?: { nodes: any[]; edges: any[]; changed: boolean };
    logMessages?: unknown[];
    camera?: CameraView;
    // paneles abiertos del visor: Inspector, chat, logs del pipeline
    panels?: { controlPanel: boolean; chatAssistant: boolean; pipelineLogs: boolean };
    // editor de pipelines: desplazamiento y zoom del lienzo, y el nodo abierto
    flowViewport?: { x: number; y: number; zoom: number };
    openNode?: OpenNodePanel | null;
}

interface ViewerMemoryState {
    byDigitalTwin: Record<string, ViewerMemory>;
    remember: (dtUid: string, patch: Partial<ViewerMemory>) => void;
    forget: (dtUid: string) => void;
    reset: () => void;
}

export const useViewerMemoryStore = create<ViewerMemoryState>()((set) => ({
    byDigitalTwin: {},
    remember: (dtUid, patch) =>
        set((state) => ({
            byDigitalTwin: { ...state.byDigitalTwin, [dtUid]: { ...state.byDigitalTwin[dtUid], ...patch } },
        })),
    forget: (dtUid) =>
        set((state) => {
            const { [dtUid]: _removed, ...rest } = state.byDigitalTwin;
            return { byDigitalTwin: rest };
        }),
    reset: () => set({ byDigitalTwin: {} }),
}));

// Lectura sin suscripción (solo al montar el visor)
export const getViewerMemory = (dtUid: string): ViewerMemory => useViewerMemoryStore.getState().byDigitalTwin[dtUid] ?? {};
export const rememberViewer = (dtUid: string, patch: Partial<ViewerMemory>) => {
    if (dtUid) useViewerMemoryStore.getState().remember(dtUid, patch);
};
export const forgetViewer = (dtUid: string) => useViewerMemoryStore.getState().forget(dtUid);
