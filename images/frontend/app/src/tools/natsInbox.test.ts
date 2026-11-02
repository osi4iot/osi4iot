import { describe, expect, it } from "vitest";
import { natsInboxPrefix, natsUserChatSubject, natsUserInboxSubject } from "./natsInbox";

// mismos casos que inbox_test.go de auth_callout
describe("natsInboxPrefix", () => {
    it("encodes the login as auth_callout does", () => {
        expect(natsInboxPrefix("dicapua")).toBe("_INBOX_U_dicapua");
        expect(natsInboxPrefix("rafael.pacheco")).toBe("_INBOX_U_rafael_2epacheco");
        expect(natsInboxPrefix("a_b")).toBe("_INBOX_U_a_5fb");
        expect(natsInboxPrefix("José")).toBe("_INBOX_U_Jos_c3_a9");
    });
});

// mismos casos que userSubjects_test.go de pipelines e inbox_test.go de auth_callout
describe("natsUserChatSubject", () => {
    it("is the user's copy of the topic", () => {
        expect(natsUserChatSubject("rafael.pacheco", "sim2llm.Group_g.Topic_t")).toBe(
            "user.rafael_2epacheco.sim2llm.Group_g.Topic_t",
        );
    });
    it("answers come to the user's inbox", () => {
        expect(natsUserInboxSubject("ana", "llm2sim.Group_g.Topic_t")).toBe("_INBOX_U_ana.llm2sim.Group_g.Topic_t");
    });
});
