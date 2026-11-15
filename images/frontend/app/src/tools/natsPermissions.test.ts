import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { PermissionViolationError } from "@nats-io/nats-core";
import { clearPermissionViolations, deniedSubjects, isPermissionViolation, reportPermissionViolation, topicKindOf, usePermissionViolations } from "./natsPermissions";

const violation = (subject: string, operation = "subscription") =>
    new PermissionViolationError(`Permissions Violation for ${operation === "publish" ? "Publish" : "Subscription"} to "${subject}"`, operation as "publish" | "subscription", subject);

beforeEach(() => clearPermissionViolations());

describe("natsPermissions", () => {
    it("recognises permission violations", () => {
        expect(isPermissionViolation(violation("dtm2sim.G.T"))).toBe(true);
        expect(isPermissionViolation(new Error("boom"))).toBe(false);
        expect(isPermissionViolation(null)).toBe(false);
    });

    it("notes each refused subject once", () => {
        expect(reportPermissionViolation(violation("dtm2sim.G.T"), 1)).toBe(true);
        expect(reportPermissionViolation(violation("dtm2sim.G.T"), 2)).toBe(false);
        expect(reportPermissionViolation(violation("dtm2sim.G.T", "publish"), 3)).toBe(true);
        expect(reportPermissionViolation(new Error("other"))).toBe(false);
        expect(deniedSubjects()).toEqual([
            { subject: "dtm2sim.G.T", operation: "subscription", at: 1 },
            { subject: "dtm2sim.G.T", operation: "publish", at: 3 },
        ]);
    });

    it("updates the components that watch the refusals", () => {
        const { result } = renderHook(() => usePermissionViolations());
        expect(result.current).toEqual([]);
        act(() => {
            reportPermissionViolation(violation("dev2pdb.G.T1"));
        });
        expect(result.current.map((d) => d.subject)).toEqual(["dev2pdb.G.T1"]);
        act(() => clearPermissionViolations());
        expect(result.current).toEqual([]);
    });

    it("names the topic of a subject", () => {
        expect(topicKindOf("dtm2sim.Group_x.Topic_y")).toBe("dtm2sim");
        expect(topicKindOf("_INBOX_U_dicapua_5fchina.llm2sim.Group_x.Topic_y")).toBe("llm2sim (private)");
        expect(topicKindOf("user.dicapua_5fchina.sim2llm.Group_x.Topic_y")).toBe("sim2llm (private)");
    });
});
