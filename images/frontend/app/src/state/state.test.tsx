import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import axios from "axios";
import { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { AuthProvider } from "../contexts/authContext";
import { LayerScope, LayerScopeProvider } from "./layerScope";
import { queryClient } from "./queryClient";
import { reloadTable, useTable, useTablesPending } from "./tables";
import { usePersistentState, useUiStore } from "./uiStore";
import { createSectionStore, SectionStoreProvider } from "./createSectionStore";
import { resetAllState } from "./resetAll";
import { useSessionStore } from "./sessionStore";
import { sortObjects } from "../components/PlatformAssistant/DigitalTwin3DViewer/ViewerTools/ViewerUtils";

// sesión iniciada antes de cargar authContext (lee localStorage al importarse)
vi.hoisted(() => {
    localStorage.setItem("iot_platform_auth", JSON.stringify({ userName: "u", accessToken: "a.b.c", refreshToken: "r" }));
});

const wrapper =
    (scope: LayerScope = "home") =>
    ({ children }: { children: ReactNode }) => (
        <AuthProvider>
            <QueryClientProvider client={queryClient}>
                <LayerScopeProvider scope={scope}>{children}</LayerScopeProvider>
            </QueryClientProvider>
        </AuthProvider>
    );

describe("usePersistentState", () => {
    afterEach(() => useUiStore.getState().reset());

    it("conserva el valor al desmontar y volver a montar (cambio de capa)", () => {
        const first = renderHook(() => usePersistentState("group.optionToShow", "Groups"));
        act(() => first.result.current[1]("Sensors"));
        first.unmount();
        const second = renderHook(() => usePersistentState("group.optionToShow", "Groups"));
        expect(second.result.current[0]).toBe("Sensors");
        act(() => second.result.current[1]((prev) => prev + "!"));
        expect(second.result.current[0]).toBe("Sensors!");
    });

    it("el valor inicial calculado mantiene su identidad entre renders", () => {
        const { result, rerender } = renderHook(() => usePersistentState("home.bounds", () => [[1, 2]]));
        const first = result.current[0];
        rerender();
        expect(result.current[0]).toBe(first);
    });
});

describe("tablas con TanStack Query", () => {
    beforeEach(() => queryClient.clear());
    afterEach(() => vi.restoreAllMocks());

    it("pide cada tabla una vez, la comparte entre componentes y la prepara (edificios)", async () => {
        const get = vi.spyOn(axios, "get").mockResolvedValue({
            data: [{ id: 1, createdAtAge: "1 days", updatedAtAge: "2 days", geoJsonData: {} }],
        });
        const { result } = renderHook(
            () => ({ a: useTable("buildings"), b: useTable("buildings"), pending: useTablesPending(["buildings"]) }),
            { wrapper: wrapper("group") },
        );
        expect(result.current.pending).toBe(true);
        await waitFor(() => expect(result.current.a).toHaveLength(1));
        expect(result.current.pending).toBe(false);
        expect(result.current.b).toBe(result.current.a);
        expect(get).toHaveBeenCalledTimes(1);
        expect(get.mock.calls[0][0]).toMatch(/admin_api\/buildings\/user_groups_managed\/$/);
    });

    it("la capa del administrador de la plataforma pide todos los edificios (otra entrada de caché)", async () => {
        const get = vi.spyOn(axios, "get").mockResolvedValue({ data: [] });
        const { result } = renderHook(() => useTablesPending(["buildings"]), { wrapper: wrapper("admin") });
        await waitFor(() => expect(result.current).toBe(false));
        expect(get.mock.calls[0][0]).toMatch(/admin_api\/buildings$/);
    });

    it("reloadTable vuelve a pedir la tabla sin volver a mostrar la pantalla de carga", async () => {
        let call = 0;
        vi.spyOn(axios, "get").mockImplementation(async () => ({ data: [{ id: ++call }] }));
        const { result } = renderHook(() => ({ sensors: useTable("sensors"), pending: useTablesPending(["sensors"]) }), {
            wrapper: wrapper(),
        });
        await waitFor(() => expect(result.current.sensors[0]?.id).toBe(1));
        act(() => reloadTable("sensors"));
        expect(result.current.pending).toBe(false);
        await waitFor(() => expect(result.current.sensors[0]?.id).toBe(2));
    });

    it("una tabla que falla se muestra vacía (antes la pantalla de carga no terminaba)", async () => {
        vi.spyOn(axios, "get").mockRejectedValue(new Error("boom"));
        vi.spyOn(console, "log").mockImplementation(() => {});
        const { result } = renderHook(() => ({ topics: useTable("topics"), pending: useTablesPending(["topics"]) }), {
            wrapper: wrapper(),
        });
        await waitFor(() => expect(result.current.pending).toBe(false));
        expect(result.current.topics).toEqual([]);
    });

    it("una tabla que falla no entra en bucle de carga al montar la sección que la usa", async () => {
        const get = vi.spyOn(axios, "get").mockRejectedValue(new Error("boom"));
        vi.spyOn(console, "log").mockImplementation(() => {});
        // como las capas: pantalla de carga mientras hay tablas pendientes y, después, la sección que la usa
        const Section = () => <span>rows: {useTable("floors").length}</span>;
        const Layer = () => (useTablesPending(["floors"]) ? <span>loading</span> : <Section />);
        render(<Layer />, { wrapper: wrapper("group") });
        await screen.findByText("rows: 0");
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(screen.getByText("rows: 0")).toBeInTheDocument();
        expect(get).toHaveBeenCalledTimes(1);
    });
});

describe("almacenes de sección (Zustand)", () => {
    type S = { sensorsOptionToShow: string; sensorIdToEdit: number };
    const reducer = (state: S, action: { type: string; payload?: any }) =>
        action.type === "OPTION" ? { ...state, sensorsOptionToShow: action.payload } : { ...state, sensorIdToEdit: action.payload };
    const store = createSectionStore(reducer, { sensorsOptionToShow: "Table", sensorIdToEdit: 0 });
    const View = () => <span>{store((s) => s.sensorsOptionToShow)}</span>;

    it("el estado sobrevive al desmontar; al volver a un formulario de edición se vuelve a la tabla", () => {
        store.dispatch({ type: "OPTION", payload: "Create sensor" });
        const first = render(<SectionStoreProvider store={store}><View /></SectionStoreProvider>);
        expect(screen.getByText("Create sensor")).toBeInTheDocument();
        first.unmount();
        store.dispatch({ type: "OPTION", payload: "Edit sensor" });
        store.dispatch({ type: "ID", payload: 7 });
        render(<SectionStoreProvider store={store}><View /></SectionStoreProvider>);
        expect(screen.getByText("Table")).toBeInTheDocument();
        expect(store.getState().sensorIdToEdit).toBe(7);
    });

    it("resetAllState (cerrar sesión) lo vacía todo", () => {
        store.dispatch({ type: "OPTION", payload: "Create sensor" });
        useSessionStore.getState().setUserRole({ userRole: "GroupAdmin" });
        useUiStore.getState().setValue("home.optionToShow", "Tutorial");
        queryClient.setQueryData(["table", "sensors", "x"], [1]);
        resetAllState();
        expect(store.getState().sensorsOptionToShow).toBe("Table");
        expect(useSessionStore.getState().userRole).toBe("unknown");
        expect(useUiStore.getState().values).toEqual({});
        expect(queryClient.getQueryData(["table", "sensors", "x"])).toBeUndefined();
    });
});

describe("sortObjects al volver a montar el visor con el mismo modelo", () => {
    it("encuentra los mismos objetos aunque R3F los haya sacado de la escena del glTF", () => {
        const scene = new THREE.Group();
        const a = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ name: "m" }));
        a.name = "A";
        const b = a.clone();
        b.name = "B";
        scene.add(a, b);
        const nodes = { Scene: scene, A: a, B: b };
        const materials = { m: a.material as THREE.MeshStandardMaterial };
        const first = sortObjects(nodes, materials, [], scene);
        // R3F mueve los objetos a su propia escena al renderizarlos y los quita al desmontar
        const r3fScene = new THREE.Scene();
        r3fScene.add(a, b);
        r3fScene.remove(a, b);
        expect(scene.children).toHaveLength(0);
        const second = sortObjects(nodes, materials, [], scene);
        expect(second.genericObjects.map((o) => o.node.name)).toEqual(first.genericObjects.map((o) => o.node.name));
        expect(second.genericObjects).toHaveLength(2);
    });
});
