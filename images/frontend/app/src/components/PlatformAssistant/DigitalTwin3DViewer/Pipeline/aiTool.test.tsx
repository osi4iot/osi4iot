import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import AiToolParametersEditor from "./AiToolParametersEditor";
import { AiToolParameter, aiToolProblems, isValidToolName, pipelineAiTools, uniqueToolName } from "./aiTool";

describe("aiTool helpers", () => {
    it("validates tool names like pipelines", () => {
        expect(isValidToolName("wind_load")).toBe(true);
        expect(isValidToolName("Tool2")).toBe(true);
        expect(isValidToolName("2tool")).toBe(false);
        expect(isValidToolName("wind-load")).toBe(false);
        expect(isValidToolName("")).toBe(false);
        expect(isValidToolName("a".repeat(49))).toBe(false);
    });

    it("finds a free default name", () => {
        expect(uniqueToolName([], 1)).toBe("tool_1");
        expect(uniqueToolName(["tool_3", "tool_4", undefined], 3)).toBe("tool_5");
    });

    it("reports the problems of the settings", () => {
        expect(aiToolProblems({ toolName: "wind_load", description: "Load factor", parameters: [] })).toEqual([]);
        const problems = aiToolProblems(
            {
                toolName: "wind_load",
                description: " ",
                parameters: [
                    { name: "v", type: "number" },
                    { name: "v", type: "number" },
                    { name: "userName", type: "string" },
                    { name: "bad name", type: "string" },
                ],
            },
            ["wind_load"],
        );
        expect(problems.some((p) => p.includes("Another AI Tool node"))).toBe(true);
        expect(problems.some((p) => p.includes("description is required"))).toBe(true);
        expect(problems.some((p) => p.includes('"v" is repeated'))).toBe(true);
        expect(problems.some((p) => p.includes('"userName" is reserved'))).toBe(true);
        expect(problems.some((p) => p.includes("invalid name"))).toBe(true);
    });

    it("lists the AI Tool nodes of a pipeline", () => {
        const tools = pipelineAiTools([
            { id: "a", type: "Function", data: { label: "F", settings: {} } },
            { id: "b", type: "AiTool", data: { label: "Wind", settings: { toolName: "wind_load", description: "d" } } },
        ]);
        expect(tools).toEqual([{ nodeId: "b", label: "Wind", toolName: "wind_load", description: "d" }]);
    });
});

describe("AiToolParametersEditor", () => {
    const Host = ({ initial = [] as AiToolParameter[], onValue = (_: AiToolParameter[]) => {} }) => {
        const [value, setValue] = useState<AiToolParameter[]>(initial);
        return (
            <AiToolParametersEditor
                value={value}
                onChange={(v) => {
                    setValue(v);
                    onValue(v);
                }}
            />
        );
    };

    it("adds, edits and removes parameters", () => {
        let last: AiToolParameter[] = [];
        render(<Host onValue={(v) => (last = v)} />);
        fireEvent.click(screen.getByText("+ Add parameter"));
        fireEvent.change(screen.getByLabelText("Parameter 1 name"), { target: { value: "windSpeed" } });
        fireEvent.change(screen.getByLabelText("Parameter 1 type"), { target: { value: "number" } });
        fireEvent.change(screen.getByLabelText("Parameter 1 description"), { target: { value: "m/s" } });
        expect(last).toHaveLength(1);
        expect(last[0]).toMatchObject({ name: "windSpeed", type: "number", description: "m/s" });
        fireEvent.click(screen.getByLabelText("Remove parameter 1"));
        expect(last).toEqual([]);
    });

    it("shows the element type of a list", () => {
        render(<Host initial={[{ name: "cycles", type: "array", items: "number" }]} />);
        expect(screen.getByLabelText("Parameter 1 element type")).toBeTruthy();
        expect(screen.queryByLabelText("Parameter 1 allowed values")).toBeNull();
    });
});
