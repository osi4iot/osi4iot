import { useSyncExternalStore } from "react";

// true mientras se cumple la media query (p. ej. "(max-width: 900px)")
export const useMediaQuery = (query: string) =>
    useSyncExternalStore(
        (onChange) => {
            if (!window.matchMedia) return () => {};
            const media = window.matchMedia(query);
            media.addEventListener("change", onChange);
            return () => media.removeEventListener("change", onChange);
        },
        () => (window.matchMedia ? window.matchMedia(query).matches : false),
        () => false,
    );
