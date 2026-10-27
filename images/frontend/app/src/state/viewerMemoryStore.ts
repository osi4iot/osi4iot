// Memoria del visor de cada gemelo digital mientras sigue abierto (Zustand, solo en memoria): vista activa,
// opciones del panel, cambios del pipeline sin desplegar y logs. Si el visor se desmonta (cambio de capa,
// recarga de datos) y se vuelve a montar, recupera todo esto. Se borra al cerrar el visor.
import { create } from "zustand";

export interface ViewerMemory {
    activeViewer?: "3D" | "pipeline" | "image_frame";
    opts?: unknown;
    pipeline?: { nodes: any[]; edges: any[]; changed: boolean };
    logMessages?: unknown[];
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
