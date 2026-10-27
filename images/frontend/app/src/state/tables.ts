// Acceso a las tablas del servidor con TanStack Query.
//
//   const sensors = useTable("sensors");            // datos (array vacío mientras cargan)
//   const loading = useTablesPending(["sensors"]);  // true solo en la primera carga (sin datos en caché)
//   reloadTable("sensors");                         // tras crear/editar/borrar: se vuelve a pedir
//
// Las tablas se comparten entre capas: al volver a una capa ya están en caché.
import { useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { useAuthDispatch, useAuthState } from "../contexts/authContext";
import { getAxiosInstance } from "../tools/axiosIntance";
import axiosErrorHandler from "../tools/axiosErrorHandler";
import { axiosAuth, getDomainName, getProtocol } from "../tools/tools";
import { LayerScope, useLayerScope } from "./layerScope";
import { queryClient } from "./queryClient";
import { INITIAL_USER_PROFILE, TABLE_RESOURCES, TableName, TableTypes, tablePath } from "./tableResources";

const EMPTY: never[] = [];
Object.freeze(EMPTY);

const emptyValue = <K extends TableName>(name: K): TableTypes[K] =>
    (name === "userProfile" ? INITIAL_USER_PROFILE : EMPTY) as unknown as TableTypes[K];

export const tableQueryKey = (name: TableName, scope: LayerScope) => ["table", name, tablePath(name, scope)] as const;

interface AuthInfo {
    accessToken: string;
    refreshToken: string;
    authDispatch: any;
}

const fetchTable = async <K extends TableName>(name: K, scope: LayerScope, auth: AuthInfo): Promise<TableTypes[K]> => {
    const url = `${getProtocol()}://${getDomainName()}/admin_api/${tablePath(name, scope)}`;
    try {
        const response = await getAxiosInstance(auth.refreshToken, auth.authDispatch).get(url, axiosAuth(auth.accessToken));
        const transform = TABLE_RESOURCES[name].transform;
        return (transform ? await transform(response.data) : response.data) as TableTypes[K];
    } catch (error) {
        axiosErrorHandler(error as AxiosError, auth.authDispatch);
        throw error;
    }
};

const tableQueryOptions = <K extends TableName>(name: K, scope: LayerScope, auth: AuthInfo, enabled = true) => ({
    queryKey: tableQueryKey(name, scope),
    queryFn: () => fetchTable(name, scope, auth),
    enabled: enabled && !!auth.accessToken,
});

const useAuthInfo = (): AuthInfo => {
    const { accessToken, refreshToken } = useAuthState();
    const authDispatch = useAuthDispatch();
    return { accessToken, refreshToken, authDispatch };
};

// Consulta completa (isPending, isFetching, refetch, dataUpdatedAt...)
export const useTableQuery = <K extends TableName>(name: K, options: { enabled?: boolean } = {}) => {
    const scope = useLayerScope();
    const auth = useAuthInfo();
    return useQuery(tableQueryOptions(name, scope, auth, options.enabled ?? true));
};

// Solo los datos: array vacío (o el perfil vacío) mientras no hay datos
export const useTable = <K extends TableName>(name: K, options: { enabled?: boolean } = {}): TableTypes[K] => {
    const { data } = useTableQuery(name, options);
    return (data ?? emptyValue(name)) as TableTypes[K];
};

// true mientras alguna de las tablas no tiene todavía datos (primera carga). Una tabla que falla deja de
// estar pendiente (se muestra vacía y el error ya se ha notificado).
export const useTablesPending = (names: TableName[]) => {
    const scope = useLayerScope();
    const auth = useAuthInfo();
    return useQueries({
        queries: names.map((name) => tableQueryOptions(name, scope, auth)),
        // una tabla que ya ha fallado alguna vez no vuelve a mostrar la pantalla de carga al pedirse de nuevo
        combine: (results) =>
            results.some((result) => result.isPending && result.fetchStatus !== "idle" && result.errorUpdateCount === 0),
    });
};

// Tablas que comparten la misma URL (p. ej. "groups" de la capa de organización y "groupsManaged")
const SAME_DATA: Partial<Record<TableName, TableName[]>> = {
    groups: ["groupsManaged"],
    groupsManaged: ["groups"],
};

// Marca la tabla como desactualizada en todas las capas y vuelve a pedir las que están en pantalla
export const reloadTable = (name: TableName) => {
    for (const table of [name, ...(SAME_DATA[name] ?? [])]) {
        void queryClient.invalidateQueries({ queryKey: ["table", table] });
    }
};

export const reloadTables = (names: TableName[]) => names.forEach(reloadTable);

// Sustituye los datos en caché (todas las variantes) sin pedirlos al servidor
export const setTableData = <K extends TableName>(name: K, data: TableTypes[K]) => {
    queryClient.setQueriesData({ queryKey: ["table", name] }, data);
};

// Datos en caché fuera de React (sin pedirlos)
export const getTableData = <K extends TableName>(name: K, scope: LayerScope = "home"): TableTypes[K] =>
    (queryClient.getQueryData(tableQueryKey(name, scope)) ?? emptyValue(name)) as TableTypes[K];

// Modelos de ML de un grupo
export const useMlModelsInGroup = (groupId: number) => {
    const mlModels = useTable("mlModels");
    return useMemo(() => mlModels.filter((model) => model.groupId === groupId), [mlModels, groupId]);
};
