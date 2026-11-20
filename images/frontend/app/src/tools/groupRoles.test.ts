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
