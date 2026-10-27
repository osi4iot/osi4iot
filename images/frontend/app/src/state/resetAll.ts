// Al cerrar sesión se vacía todo el estado en memoria: caché del servidor, sesión, interfaz de las capas,
// secciones y memoria del visor 3D.
import { queryClient } from "./queryClient";
import { useSessionStore } from "./sessionStore";
import { useUiStore } from "./uiStore";
import { resetSectionStores } from "./createSectionStore";
import { useViewerMemoryStore } from "./viewerMemoryStore";

export const resetAllState = () => {
    queryClient.clear();
    useSessionStore.getState().reset();
    useUiStore.getState().reset();
    useViewerMemoryStore.getState().reset();
    resetSectionStores();
};
