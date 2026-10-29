import { describe, expect, it } from "vitest";
import { isMessageSchemaEditable, messageSchemaSource, messageSchemaText, messageSchemaTextError } from "./messageSchema";

describe("message schema of a topic", () => {
    it("knows where the schema of each type comes from", () => {
        expect(messageSchemaSource("dev2pdb_wt")).toBe("sensors");
        expect(messageSchemaSource("dtm2sim")).toBe("simulation");
        expect(messageSchemaSource("state2sim")).toBe("fixed");
        expect(isMessageSchemaEditable("dev2dtm")).toBe(true);
        expect(isMessageSchemaEditable("inject_3")).toBe(true);
        expect(isMessageSchemaEditable("sim2llm")).toBe(false);
    });
    it("shows stored schemas and validates the edited ones", () => {
        expect(messageSchemaText('"{\\"type\\":\\"object\\"}"')).toBe('{\n    "type": "object"\n}');
        expect(messageSchemaText(null)).toBe("{}");
        expect(messageSchemaTextError('{ "type": "object" }')).toBeNull();
        expect(messageSchemaTextError("[]")).not.toBeNull();
        expect(messageSchemaTextError('{ "type": 3 }')).not.toBeNull();
    });
});
