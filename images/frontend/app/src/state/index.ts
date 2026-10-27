// Gestión del estado de la plataforma:
//  - Datos del servidor: TanStack Query (tables.ts, tableResources.ts).
//  - Estado de la interfaz que sobrevive al cambiar de capa: Zustand (uiStore, sessionStore,
//    viewerMemoryStore y los almacenes de cada sección creados con createSectionStore).
export { StateProvider } from "./StateProvider";
export { LayerScopeProvider, useLayerScope } from "./layerScope";
export type { LayerScope } from "./layerScope";
export { useTable, useTableQuery, useMlModelsInGroup, useTablesPending, reloadTable, reloadTables, setTableData, getTableData } from "./tables";
export type { TableName, TableTypes } from "./tableResources";
export { usePersistentState, useUiStore } from "./uiStore";
export { useSessionStore, useUserRole, useIsPlatformAdmin, useIsOrgAdmin, useIsGroupAdmin, useWindowObjectReferences } from "./sessionStore";
export { resetAllState } from "./resetAll";
