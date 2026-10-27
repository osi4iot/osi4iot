import { QueryClient } from "@tanstack/react-query";

// Caché de los datos del servidor (TanStack Query), compartida por todas las capas de la plataforma.
//  - Al volver a una capa los datos se muestran al instante desde la caché.
//  - Si tienen más de STALE_TIME se vuelven a pedir en segundo plano (sin pantalla de carga).
//  - Tras crear, editar o borrar algo se invalida su tabla (reloadTable) y se pide de nuevo.
export const STALE_TIME = 30_000;

export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: STALE_TIME,
            gcTime: 30 * 60_000,
            // los errores ya se notifican con axiosErrorHandler (toast); reintentar repetiría el aviso
            retry: false,
            // una tabla que ha fallado no se vuelve a pedir solo por montar otro componente que la usa (sin
            // esto, la pantalla de carga desmontaba y volvía a montar la sección en bucle); reloadTable sí
            // la vuelve a pedir
            retryOnMount: false,
            refetchOnWindowFocus: false,
        },
    },
});
