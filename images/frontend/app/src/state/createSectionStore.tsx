// Estado de cada sección de las capas de administración (tabla, crear, editar, elemento en edición...)
// en un almacén Zustand global en lugar de un Context + useReducer montado dentro de la capa: así no se
// pierde al cambiar de capa o de sección. Los reducers y las acciones existentes se reutilizan tal cual.
import { ReactNode, useEffect } from "react";
import { create, StoreApi, UseBoundStore } from "zustand";

type Action = { type: string; payload?: any; error?: any };

export type SectionStore<S> = UseBoundStore<StoreApi<S>> & {
    // mismo tipo que devolvían los antiguos useXxxDispatch (las acciones existentes lo reciben así)
    dispatch: (action: Action) => void;
    initialState: S;
};

// Todos los almacenes de sección, para vaciarlos al cerrar sesión
const registry = new Set<SectionStore<any>>();
export const resetSectionStores = () => registry.forEach((store) => store.setState({ ...store.initialState }, true));

export const createSectionStore = <S extends object, A = Action>(reducer: (state: S, action: A) => S, initialState: S) => {
    const store = create<S>()(() => ({ ...initialState })) as SectionStore<S>;
    store.dispatch = (action: Action) => store.setState(reducer(store.getState(), action as A), true);
    store.initialState = initialState;
    registry.add(store);
    return store;
};

// Al volver a una sección que se dejó en un formulario de edición se vuelve a la tabla: el formulario
// localiza el elemento por su posición en la tabla, que puede haber cambiado mientras tanto. El resto
// (tabla, crear, pasos intermedios con sus datos) se conserva.
const isEditOption = (value: unknown) => typeof value === "string" && /^Edit\b/.test(value);

export const SectionStoreProvider = <S extends object>({ store, children }: { store: SectionStore<S>; children: ReactNode }) => {
    useEffect(() => {
        const state = store.getState() as Record<string, unknown>;
        const initial = store.initialState as Record<string, unknown>;
        const patch: Record<string, unknown> = {};
        for (const key of Object.keys(state)) {
            if (/OptionToShow$/.test(key) && isEditOption(state[key])) patch[key] = initial[key];
        }
        if (Object.keys(patch).length) store.setState(patch as Partial<S>);
    }, [store]);
    return <>{children}</>;
};

