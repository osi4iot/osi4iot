import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../../contexts/authContext";
import { useSessionStore } from "../../state/sessionStore";
import { useUiStore } from "../../state/uiStore";
import PlatformAssistantLayout from "./PlatformAssistantLayout";

vi.hoisted(() => {
    localStorage.setItem("iot_platform_auth", JSON.stringify({ userName: "u", accessToken: "a.b.c", refreshToken: "r" }));
});

const Where = () => <span data-testid="path">{useLocation().pathname}</span>;

const renderAt = (path: string, layer: "home" | "group") =>
    render(
        <AuthProvider>
            <MemoryRouter initialEntries={[path]}>
                <Routes>
                    <Route path="*" element={<PlatformAssistantLayout layer={layer}><Where /></PlatformAssistantLayout>} />
                </Routes>
            </MemoryRouter>
        </AuthProvider>,
    );

describe("menú lateral del asistente", () => {
    afterEach(() => {
        useUiStore.getState().reset();
        useSessionStore.getState().reset();
    });

    it("muestra solo las capas permitidas por el rol", () => {
        act(() => useSessionStore.getState().setUserRole({ userRole: "GroupAdmin" }));
        renderAt("/platform_assistant", "home");
        const nav = screen.getByRole("navigation");
        expect(nav).toHaveTextContent("Group admin");
        expect(nav).not.toHaveTextContent("Organization admin");
        expect(nav).not.toHaveTextContent("Platform admin");
    });

    it("al elegir una sección de otra capa se guarda la sección y se navega a la capa", () => {
        act(() => useSessionStore.getState().setUserRole({ userRole: "PlatformAdmin" }));
        renderAt("/platform_assistant", "home");
        fireEvent.click(screen.getByRole("button", { name: "Group admin" }));
        fireEvent.click(screen.getByRole("button", { name: "Sensors" }));
        expect(useUiStore.getState().values["group.optionToShow"]).toBe("Sensors");
        expect(screen.getByTestId("path")).toHaveTextContent("/platform_assistant/group");
    });

    it("marca la sección activa y la muestra en la barra superior", () => {
        act(() => {
            useSessionStore.getState().setUserRole({ userRole: "GroupAdmin" });
            useUiStore.getState().setValue("group.optionToShow", "Topics");
        });
        renderAt("/platform_assistant/group", "group");
        expect(screen.getByRole("button", { name: "Topics" })).toHaveAttribute("aria-current", "page");
        expect(screen.getByRole("banner")).toHaveTextContent("Group admin");
        expect(screen.getByRole("banner")).toHaveTextContent("Topics");
    });

    it("añade el gemelo digital abierto a la capa principal", () => {
        act(() => {
            useUiStore.getState().setValue("home.digitalTwinGltfData", {});
            useUiStore.getState().setValue("home.digitalTwinSelected", { description: "Wind turbine" });
        });
        renderAt("/platform_assistant", "home");
        expect(screen.getByRole("button", { name: "Digital twin · Wind turbine" })).toBeInTheDocument();
    });
});
