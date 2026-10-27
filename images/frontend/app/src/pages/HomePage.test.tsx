import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { AuthProvider } from "../contexts/authContext";
import HomePage from "./HomePage";

describe("página de inicio", () => {
    it("sin WebGL (jsdom) muestra el texto, los accesos y la imagen de fondo en lugar de la escena 3D", () => {
        render(
            <AuthProvider>
                <MemoryRouter>
                    <HomePage />
                </MemoryRouter>
            </AuthProvider>,
        );
        expect(screen.getByRole("heading", { name: "Open-source platform for IoT and digital twins" })).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Open platform assistant" })).toHaveAttribute("href", "/platform_assistant");
        expect(screen.getByRole("button", { name: "Dashboards" })).toBeInTheDocument();
        // los conceptos solo tienen sentido con la escena
        expect(screen.queryByRole("group", { name: "Highlight a concept in the scene" })).not.toBeInTheDocument();
    });
});
