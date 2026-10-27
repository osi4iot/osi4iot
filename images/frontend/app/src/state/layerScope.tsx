import { createContext, FC, ReactNode, useContext } from "react";

// Capa de la plataforma en la que se está (cada página la declara). Solo sirve para elegir la variante
// de algunas tablas: p. ej. los edificios son todos en la capa del administrador de la plataforma y
// solo los de los grupos gestionados en el resto.
export type LayerScope = "home" | "user" | "group" | "org" | "admin";

const LayerScopeContext = createContext<LayerScope>("home");

export const LayerScopeProvider: FC<{ scope: LayerScope; children: ReactNode }> = ({ scope, children }) => (
    <LayerScopeContext.Provider value={scope}>{children}</LayerScopeContext.Provider>
);

export const useLayerScope = () => useContext(LayerScopeContext);
