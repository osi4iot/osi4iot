// Editor of the parameters of an AI Tool node: what the model must send when it calls the tool.
import { FC } from "react";
import styled from "styled-components";
import { Trash2 } from "lucide-react";
import { AiToolParameter, AiToolParameterType, AI_TOOL_MAX_PARAMETERS } from "./aiTool";
import { Button, CheckboxInput, Input, Label, Select } from "./types";

const Card = styled.div`
    padding: 10px;
    margin-bottom: 10px;
    border-radius: 6px;
    background-color: #2f3743;
    border: 1px solid #4b5563;
`;

const Row = styled.div`
    display: flex;
    gap: 8px;
    align-items: center;
    margin-bottom: 8px;

    & > * {
        min-width: 0;
    }
`;

const Small = styled.span`
    color: #9ca3af;
    font-size: 12px;
`;

const RemoveButton = styled.button`
    flex: none;
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    border: 1px solid #4b5563;
    border-radius: 6px;
    background: transparent;
    color: #c9c9c9;
    cursor: pointer;

    &:hover {
        color: #ffffff;
        border-color: #f2495c;
    }
`;

const Hint = styled.div`
    color: #9a9a9a;
    font-size: 12px;
    margin: 0 0 10px;
    line-height: 1.45;
`;

const TYPES: { value: AiToolParameterType; label: string }[] = [
    { value: "string", label: "Text" },
    { value: "number", label: "Number" },
    { value: "integer", label: "Integer" },
    { value: "boolean", label: "Boolean" },
    { value: "array", label: "List" },
];

interface Props {
    value: AiToolParameter[];
    onChange: (parameters: AiToolParameter[]) => void;
}

const AiToolParametersEditor: FC<Props> = ({ value, onChange }) => {
    const parameters = Array.isArray(value) ? value : [];
    const update = (index: number, change: Partial<AiToolParameter>) =>
        onChange(parameters.map((p, i) => (i === index ? { ...p, ...change } : p)));

    return (
        <>
            <Hint>
                The model sends these arguments when it calls the tool; they arrive as fields of msg.payload (also
                msg.payload.userName, who asked, and msg.payload.toolName). Describe each one: the model fills them
                from the description.
            </Hint>
            {parameters.map((param, index) => (
                <Card key={index}>
                    <Row>
                        <Input
                            type="text"
                            aria-label={`Parameter ${index + 1} name`}
                            placeholder="name (e.g. windSpeed)"
                            value={param.name ?? ""}
                            onChange={(e: { target: { value: string } }) => update(index, { name: e.target.value })}
                            style={{ flex: 2 }}
                        />
                        <Select
                            aria-label={`Parameter ${index + 1} type`}
                            value={param.type ?? "string"}
                            onChange={(e: { target: { value: string } }) =>
                                update(index, {
                                    type: e.target.value as AiToolParameterType,
                                    items: e.target.value === "array" ? param.items ?? "string" : undefined,
                                    enum: e.target.value === "string" ? param.enum : undefined,
                                })
                            }
                            style={{ flex: 1 }}
                        >
                            {TYPES.map((t) => (
                                <option key={t.value} value={t.value}>
                                    {t.label}
                                </option>
                            ))}
                        </Select>
                        <RemoveButton
                            type="button"
                            aria-label={`Remove parameter ${index + 1}`}
                            title="Remove"
                            onClick={() => onChange(parameters.filter((_, i) => i !== index))}
                        >
                            <Trash2 size={14} />
                        </RemoveButton>
                    </Row>
                    <Row>
                        <Input
                            type="text"
                            aria-label={`Parameter ${index + 1} description`}
                            placeholder="description for the model (units, meaning…)"
                            value={param.description ?? ""}
                            onChange={(e: { target: { value: string } }) =>
                                update(index, { description: e.target.value })
                            }
                        />
                    </Row>
                    <Row>
                        <label style={{ display: "flex", alignItems: "center", gap: 6, color: "#d1d5db", fontSize: 13 }}>
                            <CheckboxInput
                                type="checkbox"
                                checked={!!param.required}
                                onChange={(e: { target: { checked: boolean } }) =>
                                    update(index, { required: e.target.checked })
                                }
                            />
                            Required
                        </label>
                        {param.type === "array" && (
                            <>
                                <Small>of</Small>
                                <Select
                                    aria-label={`Parameter ${index + 1} element type`}
                                    value={param.items ?? "string"}
                                    onChange={(e: { target: { value: string } }) =>
                                        update(index, { items: e.target.value as AiToolParameter["items"] })
                                    }
                                    style={{ maxWidth: 140 }}
                                >
                                    {TYPES.filter((t) => t.value !== "array").map((t) => (
                                        <option key={t.value} value={t.value}>
                                            {t.label}
                                        </option>
                                    ))}
                                </Select>
                            </>
                        )}
                        {(param.type ?? "string") === "string" && (
                            <Input
                                type="text"
                                aria-label={`Parameter ${index + 1} allowed values`}
                                placeholder="allowed values, comma separated (optional)"
                                value={param.enum ?? ""}
                                onChange={(e: { target: { value: string } }) => update(index, { enum: e.target.value })}
                            />
                        )}
                    </Row>
                </Card>
            ))}
            {parameters.length < AI_TOOL_MAX_PARAMETERS && (
                <Button
                    variant="secondary"
                    type="button"
                    onClick={() => onChange([...parameters, { name: "", type: "string", description: "", required: true }])}
                >
                    + Add parameter
                </Button>
            )}
            {parameters.length === 0 && (
                <Label style={{ marginTop: 10, fontWeight: 400, color: "#9ca3af" }}>
                    No parameters: the model calls the tool without arguments.
                </Label>
            )}
        </>
    );
};

export default AiToolParametersEditor;
