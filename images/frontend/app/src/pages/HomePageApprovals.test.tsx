import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../contexts/authContext";
import { useSessionStore } from "../state/sessionStore";
import HomePage from "./HomePage";

let pending: number | null = null;
vi.mock("../components/Approvals/useApprovals", () => ({ usePendingApprovalsCount: (enabled: boolean) => (enabled ? pending : null) }));

vi.mock("../contexts/authContext", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../contexts/authContext")>()),
    useIsUserAuth: () => true,
}));

const renderHome = () =>
    render(
        <AuthProvider>
            <MemoryRouter>
                <HomePage />
            </MemoryRouter>
        </AuthProvider>,
    );

describe("the Approvals option of the home page", () => {
    afterEach(() => {
        useSessionStore.getState().setUserRole({ userRole: "unknown" });
        pending = null;
    });

    it("is offered to the administrators of a group", () => {
        useSessionStore.getState().setUserRole({ userRole: "GroupAdmin" });
        renderHome();
        expect(screen.getByRole("link", { name: "Approvals" })).toHaveAttribute("href", "/approvals");
    });

    it("shows how many requests are pending", () => {
        useSessionStore.getState().setUserRole({ userRole: "OrgAdmin" });
        pending = 3;
        renderHome();
        const link = screen.getByRole("link", { name: "Approvals, 3 pending" });
        expect(link).toHaveTextContent("Approvals3");
    });

    it("is not offered to the other users", () => {
        useSessionStore.getState().setUserRole({ userRole: "User" });
        renderHome();
        expect(screen.queryByRole("link", { name: "Approvals" })).not.toBeInTheDocument();
    });
});
