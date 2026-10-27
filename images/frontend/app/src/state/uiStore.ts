// Estado de la interfaz que debe sobrevivir al cambiar de capa (Zustand, solo en memoria).
//
// usePersistentState funciona como useState, pero el valor vive en un almacén global identificado por una
// clave ("group.optionToShow", "home.buildingSelected"...). Al salir de una capa y volver, cada componente
// recupera el valor que tenía. No se guarda al recargar la página.
import { SetStateAction, useCallback, useRef } from "react";
import { create } from "zustand";

interface UiState {
    values: Record<string, unknown>;
    setValue: (key: string, value: unknown) => void;
    reset: () => void;
}

export const useUiStore = create<UiState>()((set) => ({
    values: {},
    setValue: (key, value) =>
        set((state) => (Object.is(state.values[key], value) ? state : { values: { ...state.values, [key]: value } })),
    reset: () => set({ values: {} }),
}));

const resolve = <T>(action: SetStateAction<T>, prev: T): T =>
    typeof action === "function" ? (action as (prev: T) => T)(prev) : action;

export function usePersistentState<T>(key: string, initialValue: T | (() => T)) {
    const has = useUiStore((state) => key in state.values);
    const stored = useUiStore((state) => state.values[key]) as T | undefined;
    // valor inicial calculado una sola vez por montaje (identidad estable mientras no se cambie)
    const initialRef = useRef<{ value: T } | null>(null);
    if (!has && initialRef.current === null) {
        initialRef.current = { value: resolve(initialValue as SetStateAction<T>, undefined as unknown as T) };
    }
    const value = has ? (stored as T) : initialRef.current!.value;
    const setValue = useCallback(
        (action: SetStateAction<T>) => {
            const store = useUiStore.getState();
            const prev = key in store.values ? (store.values[key] as T) : (initialRef.current?.value as T);
            store.setValue(key, resolve(action, prev));
        },
        [key],
    );
    return [value, setValue] as const;
}

// Lectura/escritura fuera de React
export const getUiValue = <T>(key: string): T | undefined => useUiStore.getState().values[key] as T | undefined;
export const setUiValue = (key: string, value: unknown) => useUiStore.getState().setValue(key, value);
