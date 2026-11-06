import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../contexts/authContext";
import { useSessionStore } from "../state/sessionStore";
import HomePage from "./HomePage";

let pending: number | null = null;
let alarms: { toAttend: number; active: number } | null = null;
vi.mock("../components/Approvals/useApprovals", () => ({
    usePlatformCounts: (enabled: boolean) => (enabled ? { approvals: pending, alarms } : { approvals: null, alarms: null }),
}));

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
        alarms = null;
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

    it("offers the Alarms with the alarms to acknowledge and the acknowledged ones still active", () => {
        useSessionStore.getState().setUserRole({ userRole: "GroupAdmin" });
        alarms = { toAttend: 2, active: 5 };
        renderHome();
        const link = screen.getByRole("link", { name: "Alarms, 2 to acknowledge, 5 active, acknowledged" });
        expect(link).toHaveAttribute("href", "/alarms");
        expect(link).toHaveTextContent("Alarms25");
    });

    it("is not offered to the other users", () => {
        useSessionStore.getState().setUserRole({ userRole: "User" });
        renderHome();
        expect(screen.queryByRole("link", { name: "Approvals" })).not.toBeInTheDocument();
        expect(screen.queryByRole("link", { name: /Alarms/ })).not.toBeInTheDocument();
    });
});
