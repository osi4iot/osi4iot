import { describe, expect, it } from "vitest";
import { natsInboxPrefix } from "./natsInbox";

// mismos casos que inbox_test.go de auth_callout
describe("natsInboxPrefix", () => {
    it("encodes the login as auth_callout does", () => {
        expect(natsInboxPrefix("dicapua")).toBe("_INBOX_U_dicapua");
        expect(natsInboxPrefix("rafael.pacheco")).toBe("_INBOX_U_rafael_2epacheco");
        expect(natsInboxPrefix("a_b")).toBe("_INBOX_U_a_5fb");
        expect(natsInboxPrefix("José")).toBe("_INBOX_U_Jos_c3_a9");
    });
});
