import { describe, expect, it } from "vitest";
import { isAdminOfSomeGroup } from "./groupRoles";

describe("roles en los grupos", () => {
    const groups = [
        { id: 1, roleInGroup: "Admin" },
        { id: 2, roleInGroup: "Editor" },
        { id: 3 },
    ];
    it("sabe si administra algún grupo", () => {
        expect(isAdminOfSomeGroup("GroupAdmin", [{ id: 2, roleInGroup: "Editor" }])).toBe(false);
        expect(isAdminOfSomeGroup("GroupAdmin", groups)).toBe(true);
        expect(isAdminOfSomeGroup("OrgAdmin", [])).toBe(true);
        expect(isAdminOfSomeGroup("GroupAdmin", [])).toBe(true); // cargando
    });
});

describe("canAdministerGroup", () => {
    it("is false for an Editor or a Viewer, true for an Admin or a group without a role", async () => {
        const { canAdministerGroup } = await import("./groupRoles");
        expect(canAdministerGroup({ id: 1, roleInGroup: "Admin" })).toBe(true);
        expect(canAdministerGroup({ id: 1 })).toBe(true);
        expect(canAdministerGroup({ id: 1, roleInGroup: "Editor" })).toBe(false);
        expect(canAdministerGroup({ id: 1, roleInGroup: "Viewer" })).toBe(false);
        expect(canAdministerGroup(null)).toBe(false);
    });
});
